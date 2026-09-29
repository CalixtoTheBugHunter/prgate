---
name: execute-issue
description: >-
  Implement a GitHub issue for Fuzzy-Unlogic/prgate under declared modes
  (Research → Plan → Execute → Review). Fires on "implement issue #N", "work on
  this issue", "start on #N", "build the feature in this issue", or any request
  to write code that satisfies an authored issue's acceptance criteria.
---

# execute-issue

Implement an issue under **declared modes**. State the mode before acting in it. Never edit
in Research; never start Execute without an approved Plan.

**Research → (Innovate, brief/optional) → Plan → Execute → Review**

## Repo invariants (must survive every change)

prgate is a **deterministic, language-agnostic** GitHub Action; the check uses **only the
GitHub API** — no AI, no heuristics, no other network. Same PR + same config ⇒ same result.
All behavior comes from `guardrails.prgate.json`, and that config file is **always guarded
implicitly** (`src/match.ts`). A change that adds a heuristic, a network call beyond the
GitHub API, or a language/framework assumption is a **hard defect regardless of code
quality** — stop and flag it, don't ship it.

## Toolchain (from the real repo)

- pnpm 10, Node 24 in CI (`engines.node >=20`). Package `pr-gate`, GPL-3.0-only.
- `pnpm run all` = `lint && typecheck && test && build`.
  - `lint` = Biome + custom comment linter (`scripts/check-comments.mjs`)
  - `typecheck` = `tsc --noEmit`; `test` = `vitest run`; `build` = esbuild bundle
    `src/index.ts` → `dist/index.js`.
- `dist/` is gitignored on `main` (kept out of PR diffs). **Never commit `dist/`** — it is
  built only on release tags by `release.yml`.

## Comment discipline (enforced by `scripts/check-comments.mjs` over `src/` and `test/`)

Only two comment forms pass the linter:
1. `// TODO: ...` single-line comments.
2. JSDoc (`/** ... */`) that is the **leading comment of an exported function**.

Everything else fails CI — plain `//` notes, non-JSDoc `/* */` blocks, JSDoc on
types/interfaces/consts, JSDoc on non-exported symbols. So: no history, no issue/PR
numbers, no narration. A JSDoc comment should explain the non-obvious (an invariant or
hidden constraint) of the exported function it heads.

## When this fires

| Mode | You may... | You may NOT... |
|------|-----------|----------------|
| Research | read the issue, the relevant `src/*.ts` + its test, invariants | edit, propose, or plan |
| Innovate | briefly weigh approaches (optional) | commit to one silently |
| Plan | write a numbered, file-by-file plan tied to criteria | edit files |
| Execute | implement the approved plan exactly | add unrequested changes |
| Review | self-check criteria, run `pnpm run all` | fix findings in place |

## Rules

1. **Research first.** Before the first edit, read the issue's acceptance criteria, the
   `src/*.ts` you'll touch and its matching `test/*.test.ts`, and the invariants above. No
   proposals, no edits. Output a short findings summary.

2. **Plan, then get approval.** Produce a numbered plan, **file by file**, each step tied to
   a specific acceptance criterion. **Execute never starts without human approval of the
   plan.** If reality forces a deviation mid-Execute, stop, return to Plan, and get the
   revised plan approved.

3. **Execute the plan exactly.** No unrequested improvements, no adjacent fixes, no
   drive-by refactors. Spotted a real adjacent problem? Record it as a **new issue**
   (`../create-issue/SKILL.md`), don't fix it here. Comments obey the discipline above.

4. **Review is a self-check, not approval.** Verify each criterion against the diff; run
   `pnpm run all` and report the actual result; confirm determinism / no-network /
   config-driven still hold. **Do not fix findings inside Review** — a fix is a new
   Plan + Execute cycle.

5. **Human functional verification before commit/push/PR.** Exercise the criteria against
   real behavior (run `vitest`; where relevant, drive the Action against a sample PR or
   config). Hand the human a short run-through, wait for confirmation, and record the
   one-line outcome on the issue.

6. **Commits & PR.**
   - Conventional Commit title; scope from the area touched (e.g. `feat(match): ...`,
     `fix(blocker): ...`, `docs: ...`).
   - PR body: `Closes #<n>`, a summary, and an explicit confirmation the invariants hold.
   - Editing `.github/workflows/**`, `guardrails.prgate.json`, `action.yml`,
     `tsconfig.json`, `biome.json`, `scripts/check-comments.mjs`, or `src/config.ts` /
     `src/match.ts` / `src/blocker.ts` will **trip prgate's own PR Gate** (they're in
     `guardrails.prgate.json` / guarded implicitly). Expect the sticky comment and the
     human-review requirement — that's working as designed.

## Output templates

Research:
```md
### Research
- Issue criteria: <numbered restatement>
- Files in scope: src/<f>.ts (+ test/<f>.test.ts), ...
- Invariant impact: <determinism / no-network / config-driven / language-agnostic>
```

Plan (needs approval before Execute):
```md
### Plan
1. src/<file>.ts — <change> — satisfies criterion #<n>
2. test/<file>.test.ts — <test asserting the behavior> — proves criterion #<n>
```

Review:
```md
### Review (self-check)
| # | Criterion | Evidence in diff | Met? |
|---|-----------|------------------|------|
`pnpm run all`: <lint / typecheck / test / build results>
Invariants: determinism ✅ · GitHub-API-only ✅ · config-driven ✅ · language-agnostic ✅
```

## Pre-flight checklist

- [ ] Mode declared before each phase; no edits during Research.
- [ ] Plan approved by a human before any edit.
- [ ] Only requested changes made; adjacent issues filed, not fixed.
- [ ] Comments limited to `// TODO:` or JSDoc on exported functions.
- [ ] `dist/` NOT staged or committed.
- [ ] `pnpm run all` run and its real result reported.
- [ ] Invariants confirmed intact; human functional verification recorded on the issue.
- [ ] PR body has `Closes #<n>` + invariant confirmation.

## Related skills

- Where criteria come from → `../create-issue/SKILL.md`
- Reviewing the PR you open → `../review-pr/SKILL.md`
