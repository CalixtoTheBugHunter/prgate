import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/config';

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
    expect(() => parseConfig(JSON.stringify({ guardrails: { protected: ['ok', 123] } }))).toThrow(
      ConfigError,
    );
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
    const { warnings } = parseConfig(JSON.stringify({ guardrails: { protected: [], mystery: 1 } }));
    expect(warnings.some((w) => w.includes('guardrails.mystery'))).toBe(true);
  });
});
