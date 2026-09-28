import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

import { ConfigError, loadConfig } from './config';
import { matchProtected, normalizeStatus, type ChangedFile } from './match';
import { deleteStaleComment, renderComment, upsertComment, type CommentTarget } from './comment';
import { evaluateBlocker } from './blocker';

/**
 * PR Gate entrypoint. Deterministic: same PR + same config ⇒ same result. The only
 * network access is the GitHub API. No LLM/agentic logic lives here.
 */
async function run(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const configPath = core.getInput('config-path') || 'guardrails.prgate.json';
  const approvalLabel = core.getInput('approval-label') || 'prgate-approved';

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const absoluteConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(workspace, configPath);

  // 1. Read & validate config. Missing → PASS and exit. Malformed → FAIL.
  let loaded;
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
    core.notice(
      `No ${configPath} found — PR Gate is not configured for this repo. Passing.`,
    );
    return;
  }

  for (const warning of loaded.warnings) {
    core.warning(warning);
  }
  const config = loaded.config;

  // We must be running on a pull_request event to inspect files / comment.
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.notice('PR Gate only runs on pull_request events. Nothing to do. Passing.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const prNumber = pr.number;
  const target: CommentTarget = { owner, repo, prNumber };

  // Config present but no protected globs → pass silently (clean up any stale comment).
  if (config.protected.length === 0) {
    core.notice('`protected` is empty — nothing is guarded. Passing.');
    await safeDeleteStaleComment(octokit, target);
    return;
  }

  if (config.source_of_truth.length > 0) {
    // POST-MVP: source_of_truth is parsed and validated but not acted on yet.
    core.info(
      `Note: \`source_of_truth\` has ${config.source_of_truth.length} entr${config.source_of_truth.length === 1 ? 'y' : 'ies'} but is not enforced in this version.`,
    );
  }

  // 2. Get changed files (paginated) and normalize their statuses.
  const changed = await listChangedFiles(octokit, target);
  core.info(`PR #${prNumber} changed ${changed.length} file(s).`);

  // 3. Filter to protected matches.
  const matched = matchProtected(changed, config.protected);

  // 4. No matches → delete any prior comment, PASS.
  if (matched.length === 0) {
    core.info('No protected files were changed. Passing.');
    await safeDeleteStaleComment(octokit, target);
    return;
  }

  core.info(`${matched.length} protected file(s) changed:`);
  for (const file of matched) {
    core.info(`  ${file.status}  ${file.path}  (matched \`${file.matchedBy}\`)`);
  }

  // 5. Upsert the sticky comment.
  const body = renderComment({
    matched,
    isHardBlocker: config.is_hard_blocker,
    approvalLabel,
    owner,
    repo,
    prNumber,
    serverUrl: github.context.serverUrl,
  });
  try {
    await upsertComment(octokit, target, body);
  } catch (err) {
    // Fork PRs may lack pull-requests: write — degrade gracefully, don't crash.
    core.warning(
      `Could not post/update the PR Gate comment (${describe(err)}). ` +
        'This is expected for fork PRs without write permission.',
    );
  }

  // 6. Determine pass/fail.
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

/** Fetch all changed files for a PR, following pagination, normalized to ChangedFile. */
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
  return files.map((f) => ({
    path: f.filename,
    status: normalizeStatus(f.status),
    previousPath: f.previous_filename,
  }));
}

/** Delete a stale comment, tolerating permission errors (fork PRs). */
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
