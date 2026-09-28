import * as fs from 'fs';

/**
 * Parsed and validated guardrails configuration.
 * Mirrors the `guardrails` object inside `guardrails.prgate.json`.
 */
export interface GuardrailsConfig {
  /** MVP: glob patterns (minimatch syntax) of files that guard the project. */
  protected: string[];
  /** POST-MVP: parsed and shape-validated, but NOT acted upon in the MVP. */
  source_of_truth: string[];
  /** When true, the check blocks merge until the approval label is applied. */
  is_hard_blocker: boolean;
}

/** Thrown when the config file exists but is malformed. Callers should FAIL the check. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Non-fatal validation notes (e.g. unknown keys) surfaced to the caller as warnings. */
export interface LoadResult {
  config: GuardrailsConfig;
  warnings: string[];
}

const KNOWN_ROOT_KEYS = ['guardrails'];
const KNOWN_GUARDRAIL_KEYS = ['protected', 'source_of_truth', 'is_hard_blocker'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`\`${field}\` must be an array of strings.`);
  }
  value.forEach((item, i) => {
    if (typeof item !== 'string') {
      throw new ConfigError(`\`${field}[${i}]\` must be a string, got ${typeof item}.`);
    }
  });
  return value as string[];
}

/**
 * Parse and validate the raw JSON text of a guardrails config.
 * Pure and deterministic (no filesystem access) so it is directly unit-testable.
 *
 * @throws {ConfigError} on malformed JSON or an invalid schema.
 */
export function parseConfig(raw: string): LoadResult {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`guardrails.prgate.json is not valid JSON: ${detail}`);
  }

  if (!isPlainObject(parsed)) {
    throw new ConfigError('guardrails.prgate.json must contain a JSON object at its root.');
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_ROOT_KEYS.includes(key)) {
      warnings.push(`Unknown top-level key \`${key}\` in guardrails.prgate.json — ignored.`);
    }
  }

  const guardrails = parsed.guardrails;
  if (!isPlainObject(guardrails)) {
    throw new ConfigError('guardrails.prgate.json must contain a `guardrails` object.');
  }

  for (const key of Object.keys(guardrails)) {
    if (!KNOWN_GUARDRAIL_KEYS.includes(key)) {
      warnings.push(`Unknown key \`guardrails.${key}\` in guardrails.prgate.json — ignored.`);
    }
  }

  // `protected` — required in spirit; default to [] so an empty/omitted list passes silently.
  const protectedGlobs =
    guardrails.protected === undefined
      ? []
      : assertStringArray(guardrails.protected, 'guardrails.protected');

  // `source_of_truth` — POST-MVP. Validate the shape only; do not act on it.
  const sourceOfTruth =
    guardrails.source_of_truth === undefined
      ? []
      : assertStringArray(guardrails.source_of_truth, 'guardrails.source_of_truth');

  // `is_hard_blocker` — default false; must be boolean if present.
  let isHardBlocker = false;
  if (guardrails.is_hard_blocker !== undefined) {
    if (typeof guardrails.is_hard_blocker !== 'boolean') {
      throw new ConfigError('`guardrails.is_hard_blocker` must be a boolean (true or false).');
    }
    isHardBlocker = guardrails.is_hard_blocker;
  }

  return {
    config: {
      protected: protectedGlobs,
      source_of_truth: sourceOfTruth,
      is_hard_blocker: isHardBlocker,
    },
    warnings,
  };
}

/**
 * Load config from disk.
 * Returns `null` when the file is absent (project hasn't opted in → PASS silently).
 *
 * @throws {ConfigError} when the file exists but is malformed/invalid.
 */
export function loadConfig(filePath: string): LoadResult | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not read ${filePath}: ${detail}`);
  }
  return parseConfig(raw);
}
