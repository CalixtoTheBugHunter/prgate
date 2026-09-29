import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COMMENT_MARKER, diffAnchor, renderComment } from '../src/comment';
import type { MatchedFile } from '../src/match';

const BASE = {
  owner: 'acme',
  repo: 'widgets',
  prNumber: 42,
  serverUrl: 'https://github.com',
  approvalLabel: 'prgate-approved',
};

const files: MatchedFile[] = [
  { path: 'tests/auth.spec.ts', status: 'MODIFIED', matchedBy: 'tests/**' },
  { path: '.github/workflows/ci.yml', status: 'REMOVED', matchedBy: '.github/workflows/**' },
  { path: '.eslintrc.json', status: 'CREATED', matchedBy: '.eslintrc*' },
];

describe('diffAnchor', () => {
  it('is the sha256 hex of the path, prefixed with diff-', () => {
    const expected = `diff-${crypto.createHash('sha256').update('tests/x.ts', 'utf8').digest('hex')}`;
    expect(diffAnchor('tests/x.ts')).toBe(expected);
  });

  it('is deterministic', () => {
    expect(diffAnchor('a/b.ts')).toBe(diffAnchor('a/b.ts'));
  });
});

describe('renderComment', () => {
  it('starts with the hidden marker so it can be found for upsert', () => {
    const body = renderComment({ ...BASE, matched: files, isHardBlocker: false });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
  });

  it('renders one table row per file with the right badge', () => {
    const body = renderComment({ ...BASE, matched: files, isHardBlocker: false });
    expect(body).toContain('| `tests/auth.spec.ts` | 🟡 MODIFIED |');
    expect(body).toContain('| `.github/workflows/ci.yml` | 🔴 REMOVED |');
    expect(body).toContain('| `.eslintrc.json` | 🟢 CREATED |');
  });

  it('links each row to the file diff anchor', () => {
    const body = renderComment({ ...BASE, matched: files, isHardBlocker: false });
    const anchor = diffAnchor('tests/auth.spec.ts');
    expect(body).toContain(
      `[View diff ↗](https://github.com/acme/widgets/pull/42/files#${anchor})`,
    );
  });

  it('omits the blocked notice in advisory mode', () => {
    const body = renderComment({ ...BASE, matched: files, isHardBlocker: false });
    expect(body).not.toContain('This PR is blocked');
  });

  it('includes the blocked notice and label name when hard-blocking', () => {
    const body = renderComment({ ...BASE, matched: files, isHardBlocker: true });
    expect(body).toContain('This PR is blocked');
    expect(body).toContain('`prgate-approved`');
  });

  it('notes the previous path for renamed files', () => {
    const renamed: MatchedFile[] = [
      {
        path: 'tests/new.spec.ts',
        status: 'MODIFIED',
        matchedBy: 'tests/**',
        previousPath: 'tests/old.spec.ts',
      },
    ];
    const body = renderComment({ ...BASE, matched: renamed, isHardBlocker: false });
    expect(body).toContain('`tests/new.spec.ts` (was `tests/old.spec.ts`)');
  });

  it('respects a custom server URL (GitHub Enterprise)', () => {
    const body = renderComment({
      ...BASE,
      serverUrl: 'https://ghe.acme.com',
      matched: files,
      isHardBlocker: false,
    });
    expect(body).toContain('https://ghe.acme.com/acme/widgets/pull/42/files#');
  });
});
