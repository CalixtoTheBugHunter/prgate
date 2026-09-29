---
name: create-issue
description: >-
  Author, rewrite, or close a GitHub issue for Fuzzy-Unlogic/prgate. Fires on
  "create an issue", "open an issue", "file an issue", "rewrite this issue",
  "close this issue", "write acceptance criteria", or any request to turn a bug
  report / feature idea into a tracked issue for this repo.
---

# create-issue

Author a prgate issue as **one complete act**: title, body, testable acceptance
criteria, and labels — all set at creation, nothing deferred to a later edit.

## Repo invariants (bake into every issue)

prgate is a **deterministic, language-agnostic** GitHub Action: it flags PRs that touch
project-declared "protected" files for mandatory human review. **Zero AI/heuristic/network
logic in the check** — only the GitHub API. Same PR + same config ⇒ same result. All
behavior is driven by `guardrails.prgate.json`, and that config file is **always guarded
implicitly** (`src/match.ts` → `withImplicitProtection`). Any issue proposing a change to
the engine (`src/*.ts`) must say how determinism, no-network, and config-driven behavior
survive. A heuristic, a network call beyond the GitHub API, or a language assumption is a
hard defect regardless of code quality.

## When this fires

| Situation | Action |
|-----------|--------|
| "Create / open / file an issue" | Author with the full template below |
| "Rewrite this issue" | Rebuild it to the template; keep the issue number |
| "Close this issue" | Run the close gate (§4) before closing |
| Desired behavior is genuinely undecided | Add an **OPEN QUESTION** block and stop (§3) |

## Rules

1. **Author in one act.** Set title, body, acceptance criteria, and labels at creation.
   Never open a stub "to fill in later." Title is a Conventional-Commit-style summary
   (e.g. `feat(match): guard renamed protected files`), imperative, no trailing period.

2. **Body template** (exactly these sections):
   - **Goal** — what changes and for whom, in 1–3 sentences.
   - **Acceptance criteria** — a numbered list; **each item checkable by inspection or a
     test** (name the file/behavior, not a vibe). Bad: "matching works well." Good:
     "`isProtected('a/b.spec.ts', ['**/*.spec.ts'])` returns the matching pattern."
   - **Out of scope** — what this issue deliberately does not do.
   - **Determinism note** — REQUIRED when the issue touches `src/*.ts`, `action.yml`, or
     the workflows: state how determinism / no-network / config-driven is preserved.

3. **Undecided behavior stops for a human.** Where the correct behavior is a real product
   decision (not a detail you can pick), add an **OPEN QUESTION** block listing the options
   and the trade-offs, and stop — do not guess and encode a guess as a criterion.

4. **Closing runs the gate backwards.** Before closing, post a table with one row per
   acceptance criterion and **evidence a reader can open**: `file:line`, a test name, a PR
   link, or a command + its output. **One unmet criterion blocks the close** — leave the
   issue open and say which criterion failed.

5. **Labels** — pick from the repo's existing set at creation; do NOT invent a `type:` /
   `area:` scheme:
   `bug`, `enhancement`, `documentation`, `accessibility`, `question`, `duplicate`,
   `invalid`, `wontfix`, `help wanted`, `good first issue`, `dependencies`, `javascript`,
   `github_actions`.

6. **Commands** — `gh issue create --repo Fuzzy-Unlogic/prgate ...`,
   `gh issue view <n> --repo Fuzzy-Unlogic/prgate`. There are no issue templates in this
   repo; the template above is the source of truth.

## Body template

```md
## Goal
<what changes, for whom>

## Acceptance criteria
1. <checkable by inspection or a named test>
2. <...>

## Out of scope
- <...>

## Determinism note   <!-- required if this touches src/*.ts, action.yml, or workflows -->
<how determinism / no-network / config-driven behavior is preserved>
```

OPEN QUESTION block (when applicable, replaces authoring the disputed criteria):

```md
## OPEN QUESTION — needs a human decision
**Question:** <the undecided behavior>
- **Option A:** <...> — trade-off: <...>
- **Option B:** <...> — trade-off: <...>
(Stopping here. No criteria written for this until decided.)
```

## Close gate table

```md
## Close verification
| # | Criterion | Evidence (openable) | Met? |
|---|-----------|---------------------|------|
| 1 | <text>    | `src/match.ts:67` / test `withImplicitProtection › appends...` / PR #NN | ✅ |
```

## Pre-flight checklist

- [ ] Title is imperative, Conventional-Commit-style, no trailing period.
- [ ] Every acceptance criterion is checkable by inspection or a named test.
- [ ] Determinism note present if the engine / action / workflows are touched.
- [ ] Labels chosen from the existing repo set only.
- [ ] Undecided behavior parked in an OPEN QUESTION block, not guessed.
- [ ] (Closing) Every criterion has openable evidence; none unmet.

## Related skills

- Implementing an authored issue → `../execute-issue/SKILL.md`
- Reviewing the resulting PR → `../review-pr/SKILL.md`
