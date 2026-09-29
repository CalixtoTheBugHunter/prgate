import type { getOctokit } from '@actions/github';

type Octokit = ReturnType<typeof getOctokit>;

const WRITE_OR_ABOVE = new Set(['admin', 'write', 'maintain']);

export interface BlockerResult {
  passed: boolean;
  reason: string;
}

export interface BlockerContext {
  owner: string;
  repo: string;
  prNumber: number;
  approvalLabel: string;
}

interface LabelEvent {
  event?: string;
  label?: { name?: string };
  actor?: { login?: string };
}

/**
 * Decide whether a hard-blocked PR is unblocked.
 *
 * Rule (from the spec): the approval label must be present AND have been applied by a
 * user with write+ permission. A label alone from someone without write access must NOT
 * unblock. If we cannot verify (API restrictions, e.g. fork PRs), we stay blocked and
 * explain why — failing safe rather than opening the gate.
 */
export async function evaluateBlocker(
  octokit: Octokit,
  ctx: BlockerContext,
): Promise<BlockerResult> {
  const { owner, repo, prNumber, approvalLabel } = ctx;

  let labelPresent: boolean;
  try {
    const labels = await octokit.paginate(octokit.rest.issues.listLabelsOnIssue, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    labelPresent = labels.some((l: { name: string }) => l.name === approvalLabel);
  } catch (err) {
    return {
      passed: false,
      reason: `Could not read PR labels to verify the \`${approvalLabel}\` label (${describe(err)}). Staying blocked.`,
    };
  }

  if (!labelPresent) {
    return {
      passed: false,
      reason: `Blocked: apply the \`${approvalLabel}\` label (as a user with write access) to unblock.`,
    };
  }

  let labeler: string | undefined;
  try {
    const events = await octokit.paginate(octokit.rest.issues.listEvents, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    for (const raw of events) {
      const event = raw as LabelEvent;
      if (event.event === 'labeled' && event.label?.name === approvalLabel && event.actor?.login) {
        labeler = event.actor.login;
      }
    }
  } catch (err) {
    return {
      passed: false,
      reason: `The \`${approvalLabel}\` label is present but its applier could not be verified (${describe(err)}). Staying blocked.`,
    };
  }

  if (!labeler) {
    return {
      passed: false,
      reason: `The \`${approvalLabel}\` label is present but no "labeled" event was found to attribute it. Staying blocked.`,
    };
  }

  let permission: string;
  try {
    const res = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: labeler,
    });
    permission = res.data.permission;
  } catch (err) {
    return {
      passed: false,
      reason: `Could not verify permission of @${labeler}, who applied the \`${approvalLabel}\` label (${describe(err)}). Staying blocked.`,
    };
  }

  if (WRITE_OR_ABOVE.has(permission)) {
    return {
      passed: true,
      reason: `Unblocked: @${labeler} (${permission}) applied the \`${approvalLabel}\` label.`,
    };
  }

  return {
    passed: false,
    reason: `Blocked: the \`${approvalLabel}\` label was applied by @${labeler}, who lacks write access (${permission}). A maintainer must apply it.`,
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
