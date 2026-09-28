# PR Gate

> ⚠️ **Experimental MVP (v0.0.1).** Ship-fast, minimal scope. See [Roadmap](#roadmap).

A **language-agnostic** GitHub Action that detects when a pull request touches files a
project has declared **"protected"** (tests, lint config, CI workflows, project config,
etc.) and surfaces them for **mandatory human review** — deterministically, with **zero
AI/agentic logic in the check itself**.

## Why it exists

AI coding agents silently weaken or delete the guardrails that protect a codebase —
tests, lint rules, CI. **PR Gate makes any such change loud** and, optionally, blocking.

## What PR Gate is / is not

**Core principles (non-negotiable):**

1. **Deterministic.** Same PR + same config ⇒ same result, always. No LLM calls, no
   heuristics, no network beyond the GitHub API. This is the product's whole value.
2. **Language / tech agnostic.** The engine only reasons about file paths and glob
   patterns. It never assumes JavaScript, npm, or any framework.
3. **Config-driven.** All project-specific behavior comes from a single JSON file.

PR Gate **is** a gate for human attention. It is **not** a linter, a test runner, or a
replacement for SonarQube — it does not inspect file _contents_, only _paths_.

## How it works

On each pull request, PR Gate:

1. Reads and validates `guardrails.prgate.json` at your repo root. Missing → it passes
   silently (you haven't opted in).
2. Compares the PR's changed file paths against your `protected` globs (minimatch syntax).
3. **If ≥1 protected file changed:** posts (or updates) a **single sticky comment** with
   a warning banner and a table — one row per matched file with a status badge
   (🟢 `CREATED` / 🟡 `MODIFIED` / 🔴 `REMOVED`) and a **View diff ↗** link.
4. **If none changed:** deletes any stale PR Gate comment and passes.
5. Sets the check status:
   - `is_hard_blocker: false` (default) → **always passes** (advisory comment only).
   - `is_hard_blocker: true` → **fails** (blocking merge via branch protection) until a
     user with **write access** applies the approval label; then it passes.

---

## Quick start

### 1. Add the workflow

Copy [`docs/templates/pr-gate.yml`](docs/templates/pr-gate.yml) to
`.github/workflows/pr-gate.yml`:

```yaml
name: PR Gate

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]

permissions:
  contents: read
  pull-requests: write

jobs:
  pr-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: CalixtoTheBugHunter/prgate@v1
```

> Pin to a full commit SHA (`CalixtoTheBugHunter/prgate@<sha>`) for stronger
> supply-chain safety.

### 2. Create `guardrails.prgate.json`

At your repo root:

```jsonc
{
  "guardrails": {
    "protected": ["tests/**", "**/*.spec.ts", ".github/workflows/**", ".eslintrc*"],
    "source_of_truth": [],
    "is_hard_blocker": false
  }
}
```

That's it. Open a PR that touches one of those paths and PR Gate will comment.

### Simplified agentic install

Don't want to pick paths by hand? **Tell your AI coding agent:**

> **configure prgate**

It will follow [`docs/prgate-install.md`](docs/prgate-install.md) — scanning your repo for
guardrail-type files, **presenting them to you as a checklist** (the human chooses; the
agent must not decide), copying the workflow template, writing `guardrails.prgate.json`,
and opening a PR for your approval.

---

## Configuration reference

`guardrails.prgate.json` at the repo root. The whole config lives under a single
top-level `guardrails` key. Unknown keys are ignored with a warning.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `protected` | `string[]` | `[]` | Glob patterns ([minimatch](https://github.com/isaacs/minimatch) syntax) matched against changed file paths. Empty ⇒ nothing is guarded (passes silently). |
| `source_of_truth` | `string[]` | `[]` | **POST-MVP.** Parsed and shape-validated, but **not enforced** in this version. |
| `is_hard_blocker` | `boolean` | `false` | `false` = advisory comment only. `true` = the check fails until the approval label is applied by a write-access user. |

### Glob examples

```jsonc
{
  "guardrails": {
    "protected": [
      "tests/**",              // everything under tests/
      "**/*.spec.ts",          // any .spec.ts, at any depth
      "**/*.test.*",           // any test file, any language/extension
      ".github/workflows/**",  // all CI workflows
      ".eslintrc*",            // .eslintrc.json, .eslintrc.js, ...
      "sonar-project.properties",
      "pyproject.toml"
    ]
  }
}
```

Matching is **path-based only** — glob path match of changed file paths. Nothing
content-level. The engine makes no language assumptions.

### Action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | `${{ github.token }}` | Token used to read the PR, post the comment, and verify labeler permissions. |
| `config-path` | `guardrails.prgate.json` | Path to the config, relative to the repo root. |
| `approval-label` | `prgate-approved` | Label a write-access user applies to unblock a hard-blocked PR. |

### Action outputs

| Output | Description |
|--------|-------------|
| `blocked` | `"true"` when the PR is currently blocked, `"false"` otherwise. |

---

## Making it blocking

Blocking is enforced by **you** adding PR Gate as a **required status check** in branch
protection. `is_hard_blocker` controls whether the job fails.

1. Set `"is_hard_blocker": true` in `guardrails.prgate.json`.
2. In **Settings → Branches → Branch protection rules**, mark the PR Gate check
   (the `pr-gate` job) as **required**.
3. Create the approval label (default `prgate-approved`) in your repo's labels.

**Unblocking:** a user with **write access** applies the `prgate-approved` label. The
`labeled` event re-runs the Action, which verifies the labeler's permission via the
GitHub API and passes. **A label from someone without write access does not unblock** —
the check re-verifies server-side, so the label alone is not enough.

### Permissions

```yaml
permissions:
  contents: read
  pull-requests: write   # post/update the comment
  checks: write          # optional; otherwise rely on job exit code + branch protection
```

> **Fork PRs:** GitHub restricts `pull-requests: write` for PRs from forks. PR Gate
> degrades gracefully — it logs a warning and does not crash — but it cannot post the
> comment on such PRs. Consider `pull_request_target` (with care) if you need this.

---

## Development

```bash
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run test        # vitest
pnpm run build       # bundle src/ → dist/index.js via @vercel/ncc
pnpm run all         # all of the above
```

`dist/` is a committed build artifact — GitHub runs `dist/index.js` directly. **Rebuild
and commit it whenever you change `src/`** (CI enforces this).

## Roadmap (POST-MVP, not built)

- `source_of_truth` handling (SPECs / E2E as sources of truth).
- MCP tools for dev-time checks.
- Python / Kotlin / Swift adapters (the engine is already language-agnostic).
- Non-GitHub CI providers.

## License

GPL-3.0-only — see [LICENSE](LICENSE).
