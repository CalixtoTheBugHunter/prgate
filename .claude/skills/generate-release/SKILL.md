---
name: generate-release
description: >-
  Cut a prgate release for Fuzzy-Unlogic/prgate: bump the version, validate, tag,
  watch the release workflow build dist/, then hand the human a pre-filled GitHub
  "new release" URL to finish the Marketplace publish. Fires on "cut a release",
  "release prgate", "publish a new version", "tag v1.x", "ship a release".
---

# generate-release

Perform every automatable step of a prgate release, then stop and hand the human a
**pre-filled GitHub "new release" URL** — creating the GitHub Release and publishing to the
Marketplace is a **human-only** step this skill never does for them.

## How releases actually work here (from `.github/workflows/release.yml`)

Pushing a tag `vX.Y.Z` (stable) or `vX.Y.Z-<pre>` (pre-release) triggers the Release
workflow, which:
1. Verifies the tag matches `package.json` `version` (fails otherwise).
2. Runs `typecheck` + `test` + `build`.
3. Force-adds the gitignored `dist/`, commits `build: bundle dist/ for <tag>`, and
   force-points the tag at that commit (so `dist/index.js` exists on the ref consumers use).
4. **Stable** tags also move the floating major tag `vN`. **Pre-releases (any `-identifier`,
   e.g. `-alpha`) do NOT move `vN`** — consumers opt in by pinning the exact tag.

The workflow does **not** create the GitHub Release or publish to the Marketplace. That is
the manual step the URL below is for. (`dist/` is gitignored on `main` and exists only on
release tags — never commit it yourself.)

## Steps

1. **Preconditions.** On `main`, clean working tree, up to date with `origin/main`. Read the
   current version from `package.json` AND the latest tag (`git tag`, `gh release list
   --repo Fuzzy-Unlogic/prgate`). **They can drift** (e.g. `package.json` at `1.1.0-alpha`
   while the latest tag is `v1.1.1-alpha`) — when reconciling, treat the **target tag's
   `package.json`** as the source of truth for the number you're about to publish.

2. **Decide the next version — ASK, never guess.** Ask the human for major/minor/patch and
   any pre-release identifier (e.g. `-alpha`). Confirm explicitly whether it's a
   **pre-release** (default; leaves `vN` where it is) or the **first stable** (moves the
   floating `vN` tag) — call out that this is the significant difference.

3. **Bump `package.json`** to the exact target version (no leading `v`). Sync the lockfile
   if the bump changes it. Commit `chore(release): v<VERSION>`. This is the commit the tag
   points at, so the workflow's `tag == package.json` check passes.

4. **Pre-validate locally:** run `pnpm run all` (mirrors what `release.yml` does). **Abort on
   any failure** — do not tag a red build.

5. **Push, then tag:** push the commit to `main`, then
   `git tag v<VERSION> && git push origin v<VERSION>` → triggers `release.yml`.

6. **Watch the release run** until it succeeds, so `dist/` is on the tag before the human
   publishes: `gh run watch --repo Fuzzy-Unlogic/prgate` (or
   `gh run list --workflow release.yml --repo Fuzzy-Unlogic/prgate`).

7. **Emit the pre-filled Marketplace release URL** (below). Instruct the human to open it,
   tick **"Publish this Action to the GitHub Marketplace"**, set the **pre-release** checkbox
   if this is a pre-release, and click **Publish**. Then stop.

## The URL to generate

- Base: `https://github.com/Fuzzy-Unlogic/prgate/releases/new`
- Query params (URL-encode each value): `tag=v<VERSION>`, `title=PR Gate v<VERSION>`,
  and `body=` the block below, where `<PREV_TAG>` is the previous release tag:

```md
## What's changed
- <one bullet per notable commit from `git log <PREV_TAG>..v<VERSION> --pretty=%s`; or a single blank "- " if none / to let the human fill it>

## Usage
```yaml
- uses: Fuzzy-Unlogic/prgate@v<VERSION>
```

**Full changelog:** https://github.com/Fuzzy-Unlogic/prgate/compare/<PREV_TAG>...v<VERSION>
```

Encode robustly with `jq`'s `@uri`:

```bash
enc() { jq -rn --arg s "$1" '$s|@uri'; }
VER="<VERSION>"        # e.g. 1.2.0-alpha (no leading v)
PREV_TAG="<PREV_TAG>"  # e.g. v1.1.1-alpha
BODY="$(git log "${PREV_TAG}..v${VER}" --pretty='- %s')
"   # then wrap in the What's changed / Usage / Full changelog block above
URL="https://github.com/Fuzzy-Unlogic/prgate/releases/new?tag=$(enc "v$VER")&title=$(enc "PR Gate v$VER")&body=$(enc "$BODY")"
echo "$URL"
```

`@uri` renders spaces as `%20`; GitHub decodes `%20` identically to a `+`. If you want
byte-identical output to the owner's example, post-process `%20` → `+`. Print the final URL
as a clickable link and **stop for the human to finish**.

## Pre-flight checklist

- [ ] On `main`, clean tree, up to date with origin.
- [ ] `package.json` version vs latest tag reconciled (target tag's package.json wins).
- [ ] Next version + pre-release-vs-stable confirmed with the human (never guessed).
- [ ] `package.json` bumped to exact target (no leading `v`); lockfile synced; committed.
- [ ] `pnpm run all` green locally before tagging.
- [ ] Commit pushed, then tag pushed; `release.yml` run watched to success (dist/ on tag).
- [ ] `dist/` never committed by hand.
- [ ] Pre-filled URL emitted; human told to tick Marketplace + pre-release box and Publish.

## Related skills

- Deciding what goes in a release → `../create-issue/SKILL.md`
- Verifying merged PRs before release → `../review-pr/SKILL.md`
