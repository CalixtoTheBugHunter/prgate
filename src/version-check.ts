import * as core from '@actions/core';
import type { getOctokit } from '@actions/github';

type Octokit = ReturnType<typeof getOctokit>;

declare const __PRGATE_VERSION__: string;

const ACTION_OWNER = 'Fuzzy-Unlogic';
const ACTION_REPO = 'prgate';

export const RUNNING_VERSION: string =
  typeof __PRGATE_VERSION__ === 'string' ? __PRGATE_VERSION__ : '0.0.0';

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

/**
 * Parse a `vMAJOR.MINOR.PATCH[-prerelease]` string into its numeric parts.
 * Returns `null` for anything that is not a full three-part version — e.g. a floating
 * major tag like `v1`, a commit SHA, or malformed input.
 */
export function parseSemver(input: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? '',
  };
}

function comparePrerelease(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a === '') {
    return 1;
  }
  if (b === '') {
    return -1;
  }
  return Math.sign(a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Compare two SemVer values, returning -1, 0, or 1. Follows SemVer precedence: a version
 * carrying a prerelease identifier (e.g. `1.1.0-alpha`) ranks below the same version
 * without one (`1.1.0`).
 */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) {
    return Math.sign(a.major - b.major);
  }
  if (a.minor !== b.minor) {
    return Math.sign(a.minor - b.minor);
  }
  if (a.patch !== b.patch) {
    return Math.sign(a.patch - b.patch);
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Pick the release tag a consumer running `runningRaw` should be nudged toward, given the
 * list of `availableRaw` release tags. A consumer on a stable version is only offered a
 * newer stable release; a consumer on a prerelease is offered the newest release of any
 * kind. Returns the winning tag string, or `null` when nothing newer applies or the
 * running version is unparseable.
 */
export function selectSuggestedVersion(runningRaw: string, availableRaw: string[]): string | null {
  const running = parseSemver(runningRaw);
  if (!running) {
    return null;
  }
  const runningIsStable = running.prerelease === '';
  let best: { raw: string; ver: Semver } | null = null;
  for (const raw of availableRaw) {
    const ver = parseSemver(raw);
    if (!ver) {
      continue;
    }
    if (runningIsStable && ver.prerelease !== '') {
      continue;
    }
    if (compareSemver(ver, running) <= 0) {
      continue;
    }
    if (best === null || compareSemver(ver, best.ver) > 0) {
      best = { raw, ver };
    }
  }
  return best === null ? null : best.raw;
}

/**
 * True when `ref` is a floating tag that auto-updates on the consumer's behalf — a major
 * tag like `v1` or a minor tag like `v1.2` — and therefore should never be nudged. An
 * exact version tag (`v1.2.3`) or a commit SHA returns `false`.
 */
export function isFloatingRef(ref: string): boolean {
  return /^v\d+(\.\d+)?$/.test(ref.trim());
}

function displayTag(version: string): string {
  return /^v/.test(version) ? version : `v${version}`;
}

/**
 * Render the one-line update notice shown as a run annotation and appended to the PR
 * comment. `suggested` is the release tag the consumer should move to.
 */
export function renderUpdateNotice(running: string, suggested: string): string {
  const url = `https://github.com/${ACTION_OWNER}/${ACTION_REPO}/releases/tag/${suggested}`;
  return `PR Gate ${displayTag(running)} is running; ${suggested} is available. Release notes: ${url}`;
}

/**
 * Check whether a newer PR Gate release is available and, if so, emit a non-blocking
 * warning annotation. Returns a one-line Markdown-safe notice for the PR comment, or
 * `null` when no nudge applies. Never throws: any network or API failure is swallowed so
 * the gate itself is never affected by this best-effort check.
 */
export async function checkForUpdate(
  octokit: Octokit,
  opts: { enabled: boolean; actionRef?: string; running?: string },
): Promise<string | null> {
  if (!opts.enabled) {
    return null;
  }
  if (opts.actionRef !== undefined && isFloatingRef(opts.actionRef)) {
    return null;
  }
  const running = opts.running ?? RUNNING_VERSION;
  try {
    const res = await octokit.rest.repos.listReleases({
      owner: ACTION_OWNER,
      repo: ACTION_REPO,
      per_page: 100,
    });
    const tags = res.data
      .filter((release: { draft?: boolean }) => release.draft !== true)
      .map((release: { tag_name: string }) => release.tag_name);
    const suggested = selectSuggestedVersion(running, tags);
    if (suggested === null) {
      return null;
    }
    const notice = renderUpdateNotice(running, suggested);
    core.warning(notice, { title: 'PR Gate update available' });
    return notice;
  } catch (err) {
    core.debug(
      `PR Gate version check skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
