# Unique Tower Rivals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tower's seven repeated encounter characters with seven
new authored rivals so all fifteen regular encounters have unique identities.

**Architecture:** Keep progression generic and data-driven. Add the new IDs to
the existing manifest/type pipeline, author one full-body master per ID, derive
the standard six portrait states through the existing generator, and replace
only the duplicate encounter rows.

**Tech Stack:** TypeScript 7, React 19, Vitest, Python 3, Pillow, WebP with alpha,
built-in image generation, Vite, Playwright, Apps-in-Toss AIT packaging

## Global Constraints

- Work only in `.worktrees/delivery` on `feat/pve-delivery`.
- Do not inspect, modify, stage, or remove the existing untracked `tmp/` tree.
- Keep the eight existing opponent masters and the owl assets unchanged.
- Use one generated 1024x1024 full-body master and six derived 256x256 portraits
  for every new rival.
- Do not add rival-specific rendering branches or change gameplay/save rules.

### Task 1: Lock the uniqueness requirement

**Files:**
- Modify: `tests/progression/encounters.test.ts`
- Create: design and implementation documents for this change

- [ ] Add a regression that flattens all five encounter lists, requires exactly
  fifteen entries, and requires fifteen unique character IDs.
- [ ] Run only that test and confirm it fails against the current eight-ID roster.

### Task 2: Extend the asset and manifest contracts

**Files:**
- Modify: `src/assets/types.ts`
- Modify: `src/assets/manifest.ts`
- Modify: `src/assets/test-fixtures/complete-manifest.ts`
- Modify: `scripts/validate-assets.mjs`
- Modify related asset tests when their literal catalog changes

- [ ] Add `spark-slime`, `frost-smith`, `storm-harpy`, `brass-minotaur`,
  `cinder-witch`, `chain-knight`, and `night-archivist` everywhere the authored
  character catalog is declared or parsed.
- [ ] Add failing manifest/validator assertions before production manifest edits.

### Task 3: Author and validate seven full-body masters

**Files:**
- Create: `public/assets/characters/<new-id>/full.webp` for all seven IDs

- [ ] Use the existing rivals as style/composition references and issue one
  built-in image-generation call per distinct character.
- [ ] Generate each subject on a uniform chroma field, remove it with the
  installed helper, and normalize only canvas size/format.
- [ ] Inspect each source and final at original resolution; require complete
  head, feet, prop, transparent corners, and a readable distinct silhouette.

### Task 4: Derive portrait states and wire the roster

**Files:**
- Modify: `scripts/generate-authored-assets.py`
- Modify: `public/assets/manifest.json`
- Modify: `src/progression/encounters.ts`
- Create: six portrait WebPs below each new character directory

- [ ] Register the seven lieutenant portrait specs and derive `idle`, `smug`,
  `attack`, `hit`, `panic`, and `defeat` from each accepted full master.
- [ ] Add all full/portrait paths to the manifest.
- [ ] Replace only the seven repeated encounter rows with the new IDs, names,
  titles, and story lines.
- [ ] Run the uniqueness test and focused asset tests to GREEN.

### Task 5: Verify runtime presentation and delivery

**Files:**
- Temporary task-owned capture/spec files only; remove them before commit
- Rebuild: `artifacts/ait/game.ait`

- [ ] Run image dimension/alpha diagnostics for all 49 new files.
- [ ] Run the portrait generator twice and require stable hashes.
- [ ] Run progression tests, asset tests, asset validation, source policy,
  typecheck, full Vitest, web build, and delivery gates.
- [ ] Exercise a 360x640 tower-to-match path for the new opponents and inspect
  representative floor-intro and battle captures.
- [ ] Build the AIT artifact and explicitly verify
  `artifacts/ait/game.ait`.

### Task 6: Review and commit

- [ ] Inspect `git diff`, confirm no existing character or `tmp/` content changed,
  and stage only task-owned files.
- [ ] Commit with `feat: add unique tower rivals`.

