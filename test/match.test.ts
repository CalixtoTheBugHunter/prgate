import { describe, expect, it } from 'vitest';
import {
  isProtected,
  matchProtected,
  normalizeStatus,
  type ChangedFile,
} from '../src/match';

describe('normalizeStatus', () => {
  it('maps added → CREATED', () => {
    expect(normalizeStatus('added')).toBe('CREATED');
  });

  it('maps removed → REMOVED', () => {
    expect(normalizeStatus('removed')).toBe('REMOVED');
  });

  it('maps modified → MODIFIED', () => {
    expect(normalizeStatus('modified')).toBe('MODIFIED');
  });

  it('maps renamed → MODIFIED (old path preserved elsewhere)', () => {
    expect(normalizeStatus('renamed')).toBe('MODIFIED');
  });

  it.each(['copied', 'changed', 'unchanged'])('maps %s → MODIFIED', (status) => {
    expect(normalizeStatus(status)).toBe('MODIFIED');
  });

  it('fails safe to MODIFIED for unknown statuses', () => {
    expect(normalizeStatus('something-new')).toBe('MODIFIED');
  });
});

describe('isProtected', () => {
  const patterns = ['tests/**', '**/*.spec.ts', '.github/workflows/**', '.eslintrc*'];

  it('matches files under a directory glob', () => {
    expect(isProtected('tests/auth.spec.ts', patterns)).toBe('tests/**');
  });

  it('matches nested spec files via globstar', () => {
    expect(isProtected('src/deep/nested/thing.spec.ts', patterns)).toBe('**/*.spec.ts');
  });

  it('matches dotfile directories (needs dot option)', () => {
    expect(isProtected('.github/workflows/ci.yml', patterns)).toBe('.github/workflows/**');
  });

  it('matches dotfile prefixes like .eslintrc*', () => {
    expect(isProtected('.eslintrc.json', patterns)).toBe('.eslintrc*');
  });

  it('returns undefined for non-protected files', () => {
    expect(isProtected('src/index.ts', patterns)).toBeUndefined();
  });

  it('also matches when a renamed file MOVED OUT of a protected path', () => {
    // File was tests/foo.spec.ts, renamed to docs/foo.md → still flagged.
    expect(isProtected('docs/foo.md', patterns, 'tests/foo.spec.ts')).toBe('tests/**');
  });
});

describe('matchProtected', () => {
  const patterns = ['tests/**', '.github/workflows/**'];

  it('returns only matching files, preserving order and attaching matchedBy', () => {
    const files: ChangedFile[] = [
      { path: 'src/index.ts', status: 'MODIFIED' },
      { path: 'tests/a.test.ts', status: 'CREATED' },
      { path: 'README.md', status: 'MODIFIED' },
      { path: '.github/workflows/ci.yml', status: 'REMOVED' },
    ];
    const matched = matchProtected(files, patterns);
    expect(matched).toEqual([
      { path: 'tests/a.test.ts', status: 'CREATED', matchedBy: 'tests/**' },
      {
        path: '.github/workflows/ci.yml',
        status: 'REMOVED',
        matchedBy: '.github/workflows/**',
      },
    ]);
  });

  it('returns nothing when patterns are empty', () => {
    const files: ChangedFile[] = [{ path: 'tests/a.test.ts', status: 'CREATED' }];
    expect(matchProtected(files, [])).toEqual([]);
  });

  it('carries previousPath through for renamed files', () => {
    const files: ChangedFile[] = [
      { path: 'tests/new.spec.ts', status: 'MODIFIED', previousPath: 'tests/old.spec.ts' },
    ];
    const matched = matchProtected(files, patterns);
    expect(matched[0].previousPath).toBe('tests/old.spec.ts');
  });
});
