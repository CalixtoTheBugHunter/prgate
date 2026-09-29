---
name: review-pr
description: >-
  Review, assess, or "approve" a pull request for Fuzzy-Unlogic/prgate with an
  adversarial posture. Fires on "review PR #N", "review this PR", "assess this
  change", "can this merge?", "look at the diff", or any request to judge whether
  a PR satisfies its issue's acceptance criteria for this repo.
---

# review-pr

Review adversarially — try to **refute** the PR, not confirm it. An agent's review is a
**self-check, not the approval a merge needs**; say so explicitly.

## Repo invariants (check the DIFF against each)

prgate is a **deterministic, language-agnostic** GitHub Action; the check uses **only the
GitHub API** — no AI, no heuristics, no other network. Same PR + same config ⇒ same result.
All behavior is config-driven via `guardrails.prgate.json`, which is **always guarded
implicitly**. A diff that introduces a heuristic, a network call beyond the GitHub API, or
a language/framework assumption is a **hard defect regardless of code quality**.

## When this fires

| Situation | What you do |
|-----------|-------------|
| "Review / assess PR #N" | Run the full checklist below, report findings |
| "Can this merge?" | Report findings + state the review is not the approval |
| "Approve this PR" | You do not approve; produce the self-check and hand to a human |

## Rules

1. **Criteria table from the ISSUE, not the PR body.** Read the linked issue's acceptance
   criteria. One row per criterion, each pointing at a location **in the diff** that
   satisfies it. **A criterion evidenced only by prose (in the PR description) is NOT met.**

2. **Interrogate the tests.** Each test must assert the specified behavior and **fail if
   that behavior regressed**. Flag: tests that pass either way (assert nothing meaningful),
   tests needing network or credentials (the check must stay hermetic — GitHub API only),
   and any criterion with **no** test. Mentally invert the change: would a test go red?

3. **Invariant check on the diff:**
   - Determinism — no time/random/order-dependent logic in the check path.
   - Network — nothing beyond the GitHub API (`@actions/github` octokit).
   - Config-driven — behavior flows from `guardrails.prgate.json`, not hardcoded specials.
   - Language-agnostic — path/glob reasoning only; no JS/npm/framework assumptions.
   - `dist/` — **must not be committed on `main`** (it's gitignored; built on release tags).
   - Protected-file changes acknowledged — edits to `.github/workflows/**`,
     `guardrails.prgate.json`, `action.yml`, `tsconfig.json`, `biome.json`,
     `scripts/check-comments.mjs`, or `src/config.ts` / `src/match.ts` / `src/blocker.ts`
     trip prgate's own gate; the PR should acknowledge the sticky comment / human-review.

4. **Comment discipline.** In `src/` and `test/`, only `// TODO:` lines and JSDoc on
   exported functions are allowed (`scripts/check-comments.mjs`). Flag any other comment —
   it will fail `lint:ci` anyway, but call it out.

5. **CI must be green.** Confirm the required checks passed: `lint:ci`, `typecheck`, `test`,
   `build` (from `.github/workflows/ci.yml`). A skipped, missing, or failing required check
   is a finding — not a pass.

6. **Evidence and boundaries.** Every finding cites openable evidence (`file:line`, test
   name, CI check, `gh` command + output). **Never push fixes to the branch under review** —
   report; the author fixes. State plainly that this review is a self-check and that a human
   must run the change before it's considered done; record the one-line human outcome.

## Commands

```bash
gh pr view <n> --repo Fuzzy-Unlogic/prgate
gh pr diff <n> --repo Fuzzy-Unlogic/prgate
gh pr checks <n> --repo Fuzzy-Unlogic/prgate     # lint:ci / typecheck / test / build
```

## Output template

```md
## Review of PR #<n>  (self-check — NOT the merge approval)

### Acceptance criteria (from issue #<m>)
| # | Criterion | Evidence in diff | Met? |
|---|-----------|------------------|------|
| 1 | <text>    | `src/match.ts:81` | ✅ / ❌ |

### Tests
- Criterion #<n>: test `<name>` — fails on regression? ✅ / ❌ (why)
- Gaps: <criteria with no test / tests that pass either way / network-dependent tests>

### Invariants (diff)
- Determinism ✅/❌ · GitHub-API-only ✅/❌ · Config-driven ✅/❌ · Language-agnostic ✅/❌
- dist/ not committed ✅/❌ · Protected-file changes acknowledged ✅/❌

### CI
- lint:ci ✅ · typecheck ✅ · test ✅ · build ✅  (or the failing/missing check)

### Findings (most severe first)
1. <finding> — evidence: <file:line / check / command output>

**Verdict:** self-check complete. A human must review + run the change to approve/merge.
```

## Pre-flight checklist

- [ ] Criteria read from the issue, not the PR body.
- [ ] Every criterion mapped to a location in the diff (prose ≠ met).
- [ ] Each test would fail if its behavior regressed; gaps flagged.
- [ ] Invariants checked on the diff; `dist/` not committed.
- [ ] CI checks (lint:ci, typecheck, test, build) confirmed green.
- [ ] Findings cite openable evidence; no fixes pushed to the branch.
- [ ] Stated the review is a self-check; human run-through recorded.

## Related skills

- Criteria authoring → `../create-issue/SKILL.md`
- Implementing the change → `../execute-issue/SKILL.md`
