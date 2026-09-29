import { minimatch } from 'minimatch';

export type ChangeStatus = 'CREATED' | 'MODIFIED' | 'REMOVED';

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  previousPath?: string;
}

export interface MatchedFile extends ChangedFile {
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
      return 'MODIFIED';
  }
}

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
 * Return the effective protected globs, always including the guardrails config file
 * itself. The config that declares the guardrails is implicitly protected so a PR can't
 * quietly weaken, rename, or delete it in the same change — maintainers never have to
 * list it in `protected`. The path is appended only when not already present so the
 * config author can still list it explicitly without producing a duplicate.
 */
export function withImplicitProtection(patterns: string[], configPath: string): string[] {
  return patterns.includes(configPath) ? patterns : [...patterns, configPath];
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
