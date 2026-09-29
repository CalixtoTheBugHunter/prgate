import * as path from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { evaluateBlocker } from './blocker';
import { type CommentTarget, deleteStaleComment, renderComment, upsertComment } from './comment';
import { ConfigError, type LoadResult, loadConfig } from './config';
import { type ChangedFile, matchProtected, normalizeStatus } from './match';
import { checkForUpdate } from './version-check';

async function run(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const configPath = core.getInput('config-path') || 'guardrails.prgate.json';
  const approvalLabel = core.getInput('approval-label') || 'prgate-approved';
  const versionCheckEnabled = (core.getInput('version-check') || 'true').toLowerCase() !== 'false';

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const absoluteConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(workspace, configPath);

  let loaded: LoadResult | null;
  try {
    loaded = loadConfig(absoluteConfigPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      core.setFailed(`PR Gate config error: ${err.message}`);
      return;
    }
    throw err;
  }

  if (loaded === null) {
    core.notice(`No ${configPath} found — PR Gate is not configured for this repo. Passing.`);
    return;
  }

  for (const warning of loaded.warnings) {
    core.warning(warning);
  }
  const config = loaded.config;

  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.notice('PR Gate only runs on pull_request events. Nothing to do. Passing.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const prNumber = pr.number;
  const target: CommentTarget = { owner, repo, prNumber };

  const updateNotice = await checkForUpdate(octokit, {
    enabled: versionCheckEnabled,
    actionRef: process.env.GITHUB_ACTION_REF,
  });

  if (config.protected.length === 0) {
    core.notice('`protected` is empty — nothing is guarded. Passing.');
    await safeDeleteStaleComment(octokit, target);
    return;
  }

  if (config.source_of_truth.length > 0) {
    core.info(
      `Note: \`source_of_truth\` has ${config.source_of_truth.length} entr${config.source_of_truth.length === 1 ? 'y' : 'ies'} but is not enforced in this version.`,
    );
  }

  const changed = await listChangedFiles(octokit, target);
  core.info(`PR #${prNumber} changed ${changed.length} file(s).`);

  const matched = matchProtected(changed, config.protected);

  if (matched.length === 0) {
    core.info('No protected files were changed. Passing.');
    await safeDeleteStaleComment(octokit, target);
    return;
  }

  core.info(`${matched.length} protected file(s) changed:`);
  for (const file of matched) {
    core.info(`  ${file.status}  ${file.path}  (matched \`${file.matchedBy}\`)`);
  }

  const body = renderComment({
    matched,
    isHardBlocker: config.is_hard_blocker,
    approvalLabel,
    owner,
    repo,
    prNumber,
    serverUrl: github.context.serverUrl,
    updateNotice,
  });
  try {
    await upsertComment(octokit, target, body);
  } catch (err) {
    core.warning(
      `Could not post/update the PR Gate comment (${describe(err)}). ` +
        'This is expected for fork PRs without write permission.',
    );
  }

  if (!config.is_hard_blocker) {
    core.info('Advisory mode (is_hard_blocker=false). Passing.');
    core.setOutput('blocked', 'false');
    return;
  }

  const result = await evaluateBlocker(octokit, { owner, repo, prNumber, approvalLabel });
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
