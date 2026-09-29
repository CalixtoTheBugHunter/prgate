import * as crypto from 'node:crypto';
import type { getOctokit } from '@actions/github';
import type { MatchedFile } from './match';

type Octokit = ReturnType<typeof getOctokit>;

export const COMMENT_MARKER = '<!-- pr-gate:comment -->';

const STATUS_BADGE: Record<MatchedFile['status'], string> = {
  CREATED: '🟢',
  MODIFIED: '🟡',
  REMOVED: '🔴',
};

export interface RenderOptions {
  matched: MatchedFile[];
  isHardBlocker: boolean;
  approvalLabel: string;
  owner: string;
  repo: string;
  prNumber: number;
  serverUrl: string;
}

/**
 * Build the anchor GitHub uses for a file's diff on the PR "Files changed" tab.
 * GitHub anchors a file diff at `diff-<sha256(path)>` (hex digest of the UTF-8 path).
 */
export function diffAnchor(filePath: string): string {
  const hash = crypto.createHash('sha256').update(filePath, 'utf8').digest('hex');
  return `diff-${hash}`;
}

/** Full URL to a specific file's diff within the PR. */
export function diffUrl(opts: {
  serverUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  filePath: string;
}): string {
  const base = opts.serverUrl.replace(/\/+$/, '');
  return `${base}/${opts.owner}/${opts.repo}/pull/${opts.prNumber}/files#${diffAnchor(opts.filePath)}`;
}

/**
 * Render the sticky comment Markdown. Deterministic and pure so it is unit-testable.
 * Always leads with the hidden marker so the comment can be found and updated in place.
 */
export function renderComment(opts: RenderOptions): string {
  const { matched, isHardBlocker, approvalLabel, owner, repo, prNumber, serverUrl } = opts;

  const rows = matched
    .map((file) => {
      const badge = `${STATUS_BADGE[file.status]} ${file.status}`;
      const label =
        file.previousPath && file.previousPath !== file.path
          ? `\`${file.path}\` (was \`${file.previousPath}\`)`
          : `\`${file.path}\``;
      const url = diffUrl({ serverUrl, owner, repo, prNumber, filePath: file.path });
      return `| ${label} | ${badge} | [View diff ↗](${url}) |`;
    })
    .join('\n');

  const lines = [
    COMMENT_MARKER,
    '> ⚠️ **Protected files changed.** This PR modifies files that guard the project',
    '> against AI hallucinations and regressions (tests, lint, CI, config). Review carefully.',
    '',
    '| File | Change | Review |',
    '|------|--------|--------|',
    rows,
  ];

  if (isHardBlocker) {
    lines.push(
      '',
      `**This PR is blocked.** A maintainer with write access must review the changes above ` +
        `and apply the \`${approvalLabel}\` label to unblock.`,
    );
  }

  return lines.join('\n');
}

export interface CommentTarget {
  owner: string;
  repo: string;
  prNumber: number;
}

async function findExistingComment(
  octokit: Octokit,
  target: CommentTarget,
): Promise<number | undefined> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: target.owner,
    repo: target.repo,
    issue_number: target.prNumber,
    per_page: 100,
  });
  const existing = comments.find((c: { id: number; body?: string | null }) =>
    (c.body ?? '').includes(COMMENT_MARKER),
  );
  return existing?.id;
}

/**
 * Upsert the single sticky PR Gate comment: update the existing one in place, or create
 * it. Never posts a second comment. Last-writer-wins on concurrent runs (fine for MVP).
 */
export async function upsertComment(
  octokit: Octokit,
  target: CommentTarget,
  body: string,
): Promise<void> {
  const existingId = await findExistingComment(octokit, target);
  if (existingId !== undefined) {
    await octokit.rest.issues.updateComment({
      owner: target.owner,
      repo: target.repo,
      comment_id: existingId,
      body,
    });
    return;
  }
  await octokit.rest.issues.createComment({
    owner: target.owner,
    repo: target.repo,
    issue_number: target.prNumber,
    body,
  });
}

/**
 * Delete a stale PR Gate comment if one exists (used when no protected file is touched).
 * No-op when there is nothing to delete.
 */
export async function deleteStaleComment(
  octokit: Octokit,
  target: CommentTarget,
): Promise<boolean> {
  const existingId = await findExistingComment(octokit, target);
  if (existingId === undefined) {
    return false;
  }
  await octokit.rest.issues.deleteComment({
    owner: target.owner,
    repo: target.repo,
    comment_id: existingId,
  });
  return true;
}
