import type { getOctokit } from '@actions/github';

type Octokit = ReturnType<typeof getOctokit>;

/** Permission levels (from the collaborator-permission API) that count as write-or-above. */
const WRITE_OR_ABOVE = new Set(['admin', 'write', 'maintain']);

/** Outcome of evaluating whether a hard-blocked PR may pass. */
export interface BlockerResult {
  passed: boolean;
  /** Human-readable explanation, surfaced in logs and the failing check message. */
  reason: string;
}

export interface BlockerContext {
  owner: string;
  repo: string;
  prNumber: number;
  approvalLabel: string;
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

  // 1. Is the approval label currently present on the PR?
  let labelPresent: boolean;
  try {
    const labels = await octokit.paginate(octokit.rest.issues.listLabelsOnIssue, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    labelPresent = labels.some((l) => l.name === approvalLabel);
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

  // 2. Who applied the label most recently? Verify their permission.
  let labeler: string | undefined;
  try {
    const events = await octokit.paginate(octokit.rest.issues.listEvents, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    // Last "labeled" event for this label wins (most recent application).
    // listEvents returns a union of event shapes; `label` only exists on the
    // labeled/unlabeled variants, so read it through a structural narrowing.
    for (const raw of events) {
      const event = raw as { event?: string; label?: { name?: string }; actor?: { login?: string } };
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

  // 3. Does the labeler have write+ permission?
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
