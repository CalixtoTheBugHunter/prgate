# Configure PR Gate (instructions for an AI agent)

You are an AI coding agent configuring **PR Gate** for this repository. PR Gate flags
pull requests that touch "protected" files (tests, lint config, CI, project config) so a
human must review them.

**Follow these steps in order. Do not skip the human-in-the-loop steps.**

---

## Non-negotiable rule

> **You MUST NOT decide on your own which files are protected. The human chooses.**
> Your job is to *discover candidates* and *present them as a checklist*. The human
> selects. Never auto-select, never "helpfully" pre-check everything.

---

## Step 1 — Scan the repo for guardrail-type files

Search the repository (paths only — do not read file contents to judge them) for the
categories below. Record what you find; do not act yet.

- **Lint / format / quality config:** `.eslintrc*`, `eslint.config.*`, `.prettierrc*`,
  `.stylelintrc*`, `biome.json`, `ruff.toml`, `.flake8`, `.rubocop.yml`,
  `checkstyle.xml`, `detekt.yml`, `.swiftlint.yml`, `sonar-project.properties`, etc.
- **CI / CD workflows:** everything under `.github/workflows/`, plus other CI configs if
  present (`.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/`, `Jenkinsfile`).
- **Test files / folders:** `test/`, `tests/`, `__tests__/`, `spec/`, `e2e/`, and
  glob-able test files: `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.*`.
- **Project / build config that gates quality:** `tsconfig*.json`, `package.json`
  (scripts), `pyproject.toml`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `Makefile`,
  `.editorconfig`, `renovate.json`, `dependabot.yml`.

Group your findings by category and, where sensible, propose a **glob** rather than a
long list of individual files (e.g. `tests/**` instead of 40 files).

## Step 2 — Present findings as a checklist and ask the human to choose

Show the human a poll / checklist like this and **wait for their selection**:

```
I found these guardrail candidates. Which should PR Gate protect? (check all that apply)

Tests
  [ ] tests/**
  [ ] **/*.spec.ts
CI
  [ ] .github/workflows/**
Lint / quality
  [ ] .eslintrc*
  [ ] sonar-project.properties
Project config
  [ ] tsconfig.json

Also: should PR Gate BLOCK merges on these files (is_hard_blocker), or just comment
(advisory)? [advisory / blocking]
```

Do not proceed until the human has told you which items to protect and whether it should
be blocking. **If they check nothing, do not invent protections — ask again or stop.**

## Step 3 — Ensure the workflow file exists (copy only)

If `.github/workflows/pr-gate.yml` does **not** exist, **copy** the template from
[`docs/templates/pr-gate.yml`](templates/pr-gate.yml) into `.github/workflows/pr-gate.yml`.

- **Copy only. Write no new workflow logic.** The only edit permitted is replacing
  `OWNER/pr-gate@v1` with the correct published action reference for this org.
- If the file already exists, leave it as-is.

## Step 4 — Write the approved selections into `guardrails.prgate.json`

Create `guardrails.prgate.json` at the repo root using **only the items the human
checked**:

```jsonc
{
  "guardrails": {
    "protected": [
      // exactly the globs/paths the human selected
    ],
    "source_of_truth": [],          // leave empty (POST-MVP, not enforced)
    "is_hard_blocker": false        // set true only if the human chose "blocking"
  }
}
```

If the human chose **blocking**, also remind them to:
- create the `prgate-approved` label in the repo, and
- mark the PR Gate check as a **required status check** in branch protection.

## Step 5 — Open a PR, with the human's approval first

1. Summarize exactly what you will commit (the config + the workflow file, if copied).
2. **Ask the human to approve before opening the PR.**
3. On approval, create a branch, commit the changes, and open a pull request describing
   what PR Gate will now protect and whether it is advisory or blocking.

---

**Reminder:** everything PR Gate does at runtime is deterministic path-glob matching.
There is no AI in the check itself — your role here is only the one-time setup, and the
human owns every protection decision.
