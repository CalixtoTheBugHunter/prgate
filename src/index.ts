import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { ConfigError, isWorkspaceCheckedOut, loadConfig, type GuardrailsConfig } from './config';
import { matchProtected, normalizeStatus, type ChangedFile, type MatchedFile } from './match';
import { deleteStaleComment, renderComment, upsertComment, type CommentTarget } from './comment';
import { evaluateBlocker } from './blocker';

interface Inputs {
  token: string;
  configPath: string;
  approvalLabel: string;
  workspace: string;
  absoluteConfigPath: string;
}

interface PullRequestContext {
  octokit: ReturnType<typeof github.getOctokit>;
  target: CommentTarget;
  owner: string;
  repo: string;
  prNumber: number;
  serverUrl: string;
  approvalLabel: string;
}

async function run(): Promise<void> {
  const inputs = readInputs();

  const config = loadGuardrailsConfig(inputs);
  if (!config) return;

  const ctx = resolvePullRequestContext(inputs);
  if (!ctx) return;

  if (await passWhenNothingIsGuarded(config, ctx)) return;

  noteUnenforcedSourceOfTruth(config);

  const matched = await findChangedProtectedFiles(config, ctx);
  if (await passWhenNoProtectedFilesChanged(matched, ctx)) return;

  logMatchedFiles(matched);
  await postProtectedFilesComment(matched, config, ctx);
  await applyGateVerdict(config, ctx);
}

function readInputs(): Inputs {
  const configPath = core.getInput('config-path') || 'guardrails.prgate.json';
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  return {
    token: core.getInput('github-token', { required: true }),
    configPath,
    approvalLabel: core.getInput('approval-label') || 'prgate-approved',
    workspace,
    absoluteConfigPath: path.isAbsolute(configPath)
      ? configPath
      : path.join(workspace, configPath),
  };
}

function loadGuardrailsConfig(inputs: Inputs): GuardrailsConfig | null {
  let loaded;
  try {
    loaded = loadConfig(inputs.absoluteConfigPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      core.setFailed(`PR Gate config error: ${err.message}`);
      return null;
    }
    throw err;
  }

  if (loaded === null) {
    reportMissingConfig(inputs);
    return null;
  }

  for (const warning of loaded.warnings) {
    core.warning(warning);
  }
  return loaded.config;
}

function reportMissingConfig(inputs: Inputs): void {
  if (!isWorkspaceCheckedOut(inputs.workspace)) {
    core.setFailed(
      `PR Gate could not read ${inputs.configPath}: the workspace at ${inputs.workspace} is ` +
        `empty, so the repository was never checked out. Add \`- uses: actions/checkout@v4\` ` +
        `before the PR Gate step in your workflow (see docs/templates/pr-gate.yml).`,
    );
    return;
  }
  core.notice(`No ${inputs.configPath} found — PR Gate is not configured for this repo. Passing.`);
}

function resolvePullRequestContext(inputs: Inputs): PullRequestContext | null {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.notice('PR Gate only runs on pull_request events. Nothing to do. Passing.');
    return null;
  }
  const { owner, repo } = github.context.repo;
  return {
    octokit: github.getOctokit(inputs.token),
    target: { owner, repo, prNumber: pr.number },
    owner,
    repo,
    prNumber: pr.number,
    serverUrl: github.context.serverUrl,
    approvalLabel: inputs.approvalLabel,
  };
}

async function passWhenNothingIsGuarded(
  config: GuardrailsConfig,
  ctx: PullRequestContext,
): Promise<boolean> {
  if (config.protected.length > 0) return false;
  core.notice('`protected` is empty — nothing is guarded. Passing.');
  await safeDeleteStaleComment(ctx.octokit, ctx.target);
  return true;
}

function noteUnenforcedSourceOfTruth(config: GuardrailsConfig): void {
  const count = config.source_of_truth.length;
  if (count === 0) return;
  core.info(
    `Note: \`source_of_truth\` has ${count} entr${count === 1 ? 'y' : 'ies'} but is not enforced in this version.`,
  );
}

async function findChangedProtectedFiles(
  config: GuardrailsConfig,
  ctx: PullRequestContext,
): Promise<MatchedFile[]> {
  const changed = await listChangedFiles(ctx.octokit, ctx.target);
  core.info(`PR #${ctx.prNumber} changed ${changed.length} file(s).`);
  return matchProtected(changed, config.protected);
}

async function passWhenNoProtectedFilesChanged(
  matched: MatchedFile[],
  ctx: PullRequestContext,
): Promise<boolean> {
  if (matched.length > 0) return false;
  core.info('No protected files were changed. Passing.');
  await safeDeleteStaleComment(ctx.octokit, ctx.target);
  return true;
}

function logMatchedFiles(matched: MatchedFile[]): void {
  core.info(`${matched.length} protected file(s) changed:`);
  for (const file of matched) {
    core.info(`  ${file.status}  ${file.path}  (matched \`${file.matchedBy}\`)`);
  }
}

async function postProtectedFilesComment(
  matched: MatchedFile[],
  config: GuardrailsConfig,
  ctx: PullRequestContext,
): Promise<void> {
  const body = renderComment({
    matched,
    isHardBlocker: config.is_hard_blocker,
    approvalLabel: ctx.approvalLabel,
    owner: ctx.owner,
    repo: ctx.repo,
    prNumber: ctx.prNumber,
    serverUrl: ctx.serverUrl,
  });
  try {
    await upsertComment(ctx.octokit, ctx.target, body);
  } catch (err) {
    core.warning(
      `Could not post/update the PR Gate comment (${describe(err)}). ` +
        'This is expected for fork PRs without write permission.',
    );
  }
}

async function applyGateVerdict(
  config: GuardrailsConfig,
  ctx: PullRequestContext,
): Promise<void> {
  if (!config.is_hard_blocker) {
    core.info('Advisory mode (is_hard_blocker=false). Passing.');
    core.setOutput('blocked', 'false');
    return;
  }

  const result = await evaluateBlocker(ctx.octokit, {
    owner: ctx.owner,
    repo: ctx.repo,
    prNumber: ctx.prNumber,
    approvalLabel: ctx.approvalLabel,
  });
  core.setOutput('blocked', String(!result.passed));
  if (result.passed) {
    core.info(result.reason);
    return;
  }
  core.setFailed(result.reason);
}

async function listChangedFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  target: CommentTarget,
): Promise<ChangedFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: target.owner,
    repo: target.repo,
    pull_number: target.prNumber,
    per_page: 100,
  });
  return files.map(
    (f: { filename: string; status: string; previous_filename?: string | null }) => ({
      path: f.filename,
      status: normalizeStatus(f.status),
      previousPath: f.previous_filename ?? undefined,
    }),
  );
}

async function safeDeleteStaleComment(
  octokit: ReturnType<typeof github.getOctokit>,
  target: CommentTarget,
): Promise<void> {
  try {
    const deleted = await deleteStaleComment(octokit, target);
    if (deleted) {
      core.info('Removed a stale PR Gate comment.');
    }
  } catch (err) {
    core.warning(`Could not delete a stale PR Gate comment (${describe(err)}).`);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

run().catch((err) => {
  core.setFailed(`PR Gate crashed: ${describe(err)}`);
});
