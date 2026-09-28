import { minimatch } from 'minimatch';

/**
 * Normalized change status for a file in a pull request.
 * GitHub's raw statuses are mapped down to these three buckets (see the spec).
 */
export type ChangeStatus = 'CREATED' | 'MODIFIED' | 'REMOVED';

/** A single changed file as reported by the GitHub API, after normalization. */
export interface ChangedFile {
  /** Current path of the file in the PR head. */
  path: string;
  /** Normalized change status. */
  status: ChangeStatus;
  /** Previous path, only present for renamed files (raw GitHub status `renamed`). */
  previousPath?: string;
}

/** A protected file: a changed file that matched at least one protected glob. */
export interface MatchedFile extends ChangedFile {
  /** The protected glob pattern that first matched this file. */
  matchedBy: string;
}

/**
 * Normalize a raw GitHub file status to one of CREATED / MODIFIED / REMOVED.
 *
 * GitHub reports: added, modified, removed, renamed, copied, changed, unchanged.
 * Per the spec, renamed is treated as MODIFIED (the old path is preserved separately).
 */
export function normalizeStatus(githubStatus: string): ChangeStatus {
  switch (githubStatus) {
    case 'added':
      return 'CREATED';
    case 'removed':
      return 'REMOVED';
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'changed':
    case 'unchanged':
      return 'MODIFIED';
    default:
      // Unknown/future status: fail safe toward MODIFIED so it is still surfaced.
      return 'MODIFIED';
  }
}

// minimatch options: `dot` so patterns like `.github/workflows/**` and `.eslintrc*`
// match paths whose segments begin with a dot. Path matching only — never content.
const MATCH_OPTIONS = { dot: true } as const;

/**
 * Does `filePath` match any of the given protected glob patterns?
 * A renamed file's previous path is also tested so moving a protected file out is caught.
 */
export function isProtected(
  filePath: string,
  patterns: string[],
  previousPath?: string,
): string | undefined {
  for (const pattern of patterns) {
    if (minimatch(filePath, pattern, MATCH_OPTIONS)) {
      return pattern;
    }
    if (previousPath && minimatch(previousPath, pattern, MATCH_OPTIONS)) {
      return pattern;
    }
  }
  return undefined;
}

/**
 * Filter changed files down to those matching any protected glob.
 * Deterministic: input order is preserved, no dedupe needed (GitHub lists each path once).
 */
export function matchProtected(files: ChangedFile[], patterns: string[]): MatchedFile[] {
  if (patterns.length === 0) {
    return [];
  }
  const matched: MatchedFile[] = [];
  for (const file of files) {
    const matchedBy = isProtected(file.path, patterns, file.previousPath);
    if (matchedBy !== undefined) {
      matched.push({ ...file, matchedBy });
    }
  }
  return matched;
}
