import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, isWorkspaceCheckedOut, parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('parses a full valid config', () => {
    const { config, warnings } = parseConfig(
      JSON.stringify({
        guardrails: {
          protected: ['tests/**', '.eslintrc*'],
          source_of_truth: ['SPEC.md'],
          is_hard_blocker: true,
        },
      }),
    );
    expect(config).toEqual({
      protected: ['tests/**', '.eslintrc*'],
      source_of_truth: ['SPEC.md'],
      is_hard_blocker: true,
    });
    expect(warnings).toEqual([]);
  });

  it('defaults is_hard_blocker to false and arrays to empty', () => {
    const { config } = parseConfig(JSON.stringify({ guardrails: { protected: ['tests/**'] } }));
    expect(config.is_hard_blocker).toBe(false);
    expect(config.source_of_truth).toEqual([]);
  });

  it('allows an empty protected list (passes silently downstream)', () => {
    const { config } = parseConfig(JSON.stringify({ guardrails: { protected: [] } }));
    expect(config.protected).toEqual([]);
  });

  it('throws ConfigError on invalid JSON', () => {
    expect(() => parseConfig('{ not json')).toThrow(ConfigError);
  });

  it('throws when root is not an object', () => {
    expect(() => parseConfig('[]')).toThrow(ConfigError);
    expect(() => parseConfig('42')).toThrow(ConfigError);
  });

  it('throws when guardrails object is missing', () => {
    expect(() => parseConfig(JSON.stringify({ nope: true }))).toThrow(ConfigError);
  });

  it('throws when protected is not an array of strings', () => {
    expect(() => parseConfig(JSON.stringify({ guardrails: { protected: 'tests/**' } }))).toThrow(
      ConfigError,
    );
    expect(() =>
      parseConfig(JSON.stringify({ guardrails: { protected: ['ok', 123] } })),
    ).toThrow(ConfigError);
  });

  it('throws when is_hard_blocker is not a boolean', () => {
    expect(() =>
      parseConfig(JSON.stringify({ guardrails: { protected: [], is_hard_blocker: 'yes' } })),
    ).toThrow(ConfigError);
  });

  it('warns (does not throw) on unknown top-level keys', () => {
    const { warnings } = parseConfig(
      JSON.stringify({ guardrails: { protected: [] }, extra: true }),
    );
    expect(warnings.some((w) => w.includes('extra'))).toBe(true);
  });

  it('warns on unknown keys inside guardrails', () => {
    const { warnings } = parseConfig(
      JSON.stringify({ guardrails: { protected: [], mystery: 1 } }),
    );
    expect(warnings.some((w) => w.includes('guardrails.mystery'))).toBe(true);
  });
});

describe('isWorkspaceCheckedOut', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    while (tmpDirs.length) {
      fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });

  function mkTmp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prgate-ws-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('returns true when the workspace contains files (repo checked out)', () => {
    const dir = mkTmp();
    fs.writeFileSync(path.join(dir, 'README.md'), '# repo');
    expect(isWorkspaceCheckedOut(dir)).toBe(true);
  });

  it('returns false for an empty workspace (checkout was omitted)', () => {
    expect(isWorkspaceCheckedOut(mkTmp())).toBe(false);
  });

  it('returns false when the workspace directory does not exist', () => {
    expect(isWorkspaceCheckedOut(path.join(os.tmpdir(), 'prgate-does-not-exist-xyz'))).toBe(false);
  });
});
