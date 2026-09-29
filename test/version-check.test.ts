import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  isFloatingRef,
  parseSemver,
  renderUpdateNotice,
  selectSuggestedVersion,
} from '../src/version-check';

describe('parseSemver', () => {
  it('parses a stable version with or without a v prefix', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
  });

  it('parses a prerelease identifier', () => {
    expect(parseSemver('v1.1.0-alpha')).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
      prerelease: 'alpha',
    });
  });

  it('returns null for floating tags, SHAs, and junk', () => {
    expect(parseSemver('v1')).toBeNull();
    expect(parseSemver('v1.2')).toBeNull();
    expect(parseSemver('abc123')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });
});

describe('compareSemver', () => {
  const sv = (raw: string) => {
    const parsed = parseSemver(raw);
    if (parsed === null) {
      throw new Error(`test fixture is not a valid semver: ${raw}`);
    }
    return parsed;
  };
  const cmp = (a: string, b: string) => compareSemver(sv(a), sv(b));

  it('orders by major, minor, then patch', () => {
    expect(cmp('2.0.0', '1.9.9')).toBe(1);
    expect(cmp('1.1.0', '1.2.0')).toBe(-1);
    expect(cmp('1.1.1', '1.1.1')).toBe(0);
  });

  it('ranks a prerelease below the matching stable release', () => {
    expect(cmp('1.1.0-alpha', '1.1.0')).toBe(-1);
    expect(cmp('1.1.0', '1.1.0-alpha')).toBe(1);
  });

  it('orders prerelease identifiers per SemVer precedence', () => {
    expect(cmp('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(cmp('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
    expect(cmp('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
  });
});

describe('selectSuggestedVersion', () => {
  it('suggests the newest stable for a stable consumer, ignoring prereleases', () => {
    expect(selectSuggestedVersion('1.0.0', ['v1.0.0', 'v1.1.0', 'v1.2.0-beta'])).toBe('v1.1.0');
  });

  it('suggests the newest release of any kind for a prerelease consumer', () => {
    expect(selectSuggestedVersion('1.0.0-alpha', ['v1.0.0-alpha', 'v1.1.0-alpha', 'v1.0.0'])).toBe(
      'v1.1.0-alpha',
    );
  });

  it('returns null when nothing newer is available', () => {
    expect(selectSuggestedVersion('1.1.0', ['v1.0.0', 'v1.1.0'])).toBeNull();
  });

  it('ignores unparseable tags like the floating major tag', () => {
    expect(selectSuggestedVersion('1.0.0', ['v1', 'v1.1.0', 'latest'])).toBe('v1.1.0');
  });

  it('returns null when the running version is unparseable', () => {
    expect(selectSuggestedVersion('v1', ['v1.1.0'])).toBeNull();
  });
});

describe('isFloatingRef', () => {
  it('is true for floating major and minor tags', () => {
    expect(isFloatingRef('v1')).toBe(true);
    expect(isFloatingRef('v1.2')).toBe(true);
  });

  it('is false for exact version tags and SHAs', () => {
    expect(isFloatingRef('v1.2.3')).toBe(false);
    expect(isFloatingRef('v1.0.0-alpha')).toBe(false);
    expect(isFloatingRef('a1b2c3d4e5f6')).toBe(false);
  });
});

describe('renderUpdateNotice', () => {
  it('names both versions and links the release notes', () => {
    const notice = renderUpdateNotice('1.0.0-alpha', 'v1.1.0-alpha');
    expect(notice).toContain('v1.0.0-alpha');
    expect(notice).toContain('v1.1.0-alpha');
    expect(notice).toContain('https://github.com/Fuzzy-Unlogic/prgate/releases/tag/v1.1.0-alpha');
  });
});
