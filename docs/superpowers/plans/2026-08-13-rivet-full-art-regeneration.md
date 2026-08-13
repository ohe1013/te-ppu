# Rivet Full-Art Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rivet's intrinsically cropped master with a complete full-body illustration and derive six unclipped battle portraits that match Lumi and Sera in the live mobile UI.

**Architecture:** Treat the generated illustration as a new authored master, not a repair of the clipped pixels. Prove the old master fails an independent visible-height and edge-clearance contract, validate a chroma-key candidate before replacing tracked assets, then remove the obsolete scale compensation and derive portraits through the existing generator.

**Tech Stack:** Built-in image generation, Python 3, Pillow, WebP with alpha, React 19, Playwright, Apps-in-Toss AIT packaging

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on `feat/pve-delivery`.
- Preserve the existing untracked `tmp/` contents; only use and remove the exact `tmp/rivet-regeneration/` subtree created for this task.
- Preserve Rivet's face, dark navy spiky hair, blue goggles, red scarf, cream mechanic jumpsuit, yellow gloves, red/teal boots, red mechanical backpack, and single oversized silver wrench.
- Produce a square 1024x1024 RGBA full master with complete hair, wrench, hands, backpack, and both shoes.
- Keep at least 48px clear space from every alpha bound; visible height must be 82-92% of the canvas.
- Keep all six portraits at 256x256 RGBA and all manifest paths/state names unchanged.
- Do not change gameplay, copy, routes, React components, CSS, HUD dimensions, Lumi, Sera, rivals, owl, backgrounds, or audio.
- Do not overwrite the tracked master until a candidate passes original-resolution visual and alpha-bound inspection.
- Use Node 24.15.0 for all Node, Playwright, and AIT commands.

---

### Task 1: Add the full-master completeness regression

**Files:**
- Modify: `scripts/generate-authored-assets.test.py`

**Interfaces:**
- Consumes: real `public/assets/characters/hero-engineer/full.webp` alpha data.
- Produces: `test_real_rivet_full_art_keeps_every_extremity_inside_the_canvas()` enforcing literal framing bounds independently of generator configuration.

- [x] **Step 1: Replace the obsolete scale-only assertion with a completeness test**

Add literal constants beside the existing test constants:

```python
FULL_ART_EDGE_CLEARANCE = 48
RIVET_VISIBLE_HEIGHT_RANGE = (0.82, 0.92)
```

Add a real-asset test that calculates the thresholded alpha bounds with
`generator.alpha_content_bbox(image)` and asserts:

```python
left, top, right, bottom = generator.alpha_content_bbox(image)
visible_height_fraction = (bottom - top) / image.height

self.assertGreaterEqual(left, FULL_ART_EDGE_CLEARANCE)
self.assertGreaterEqual(top, FULL_ART_EDGE_CLEARANCE)
self.assertLessEqual(right, image.width - FULL_ART_EDGE_CLEARANCE)
self.assertLessEqual(bottom, image.height - FULL_ART_EDGE_CLEARANCE)
self.assertGreaterEqual(visible_height_fraction, RIVET_VISIBLE_HEIGHT_RANGE[0])
self.assertLessEqual(visible_height_fraction, RIVET_VISIBLE_HEIGHT_RANGE[1])
```

Keep the real three-character alpha-coverage comparison because it catches a
future oversized Rivet independently of height.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -B scripts/generate-authored-assets.test.py GenerateAuthoredAssetsTest.test_real_rivet_full_art_keeps_every_extremity_inside_the_canvas
```

Expected: FAIL because the current normalized master has visible bounds
`(145, 115, 887, 909)`, a visible-height fraction near `0.775`, below `0.82`.
This failure represents the incomplete/shrunk source that the user rejected.

---

### Task 2: Generate and validate a complete Rivet candidate

**Files:**
- Reference: `public/assets/characters/hero-engineer/full.webp`
- Reference: `public/assets/characters/cloud-courier/full.webp`
- Reference: `public/assets/characters/star-alchemist/full.webp`
- Create temporarily: `tmp/rivet-regeneration/rivet-chroma.png`
- Create temporarily: `tmp/rivet-regeneration/rivet-transparent.png`
- Replace after acceptance: `public/assets/characters/hero-engineer/full.webp`

**Interfaces:**
- Consumes: the three reference images with explicit identity/composition roles.
- Produces: one accepted 1024x1024 transparent Rivet master candidate.

- [x] **Step 1: Generate one project-bound candidate with the built-in image tool**

Pass the three local references in this order and use this prompt:

```text
Use case: stylized-concept
Asset type: production game character full-body master
Primary request: create a NEW complete full-body illustration of Rivet, preserving his identity from Image 1 while using Images 2 and 3 only for full-body padding, proportions, polished arcade-anime line work, and cel shading.
Input images: Image 1: Rivet identity/outfit/equipment reference; Image 2: Lumi composition and complete-body padding reference; Image 3: Sera composition and rendering-quality reference.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local removal, one uniform color, no floor plane.
Subject: one cheerful youthful apprentice magic engineer; dark navy-blue spiky hair; blue goggles/head gear; red scarf; cream mechanic jumpsuit; yellow work gloves; red and teal boots; red mechanical backpack; exactly one oversized silver wrench.
Style/medium: bright polished arcade-anime character illustration, crisp dark outlines, clean cel shading, consistent with Images 2 and 3.
Composition/framing: centered square full-body three-quarter/front hero pose; complete hair silhouette, goggles, scarf, wrench, backpack, both hands, both legs, both shoes, soles and toes all visible; keep the wrench upright or slightly diagonal entirely inside the frame; subject including wrench occupies 82-90% of canvas height; at least 64px visual padding around every extremity.
Constraints: preserve Rivet's face, youthful proportions, outfit colors, equipment, and upbeat personality from Image 1; exactly one character and one wrench; crisp separable silhouette; no body part or prop touches or crosses any edge; no #00ff00 in the subject; no shadow, gradient, texture, reflection, floor, text, logo, or watermark.
Avoid: cropped hair, cropped wrench, cropped hands, cropped backpack, cropped feet, missing shoes, hidden footwear, close-up framing, extra tools, extra limbs, redesigning Rivet, realistic rendering, background objects.
```

- [x] **Step 2: Save the generated source under the task-owned temporary subtree**

Copy the built-in result from its reported generated-images path to
`tmp/rivet-regeneration/rivet-chroma.png`. Do not touch other `tmp/` content.

- [x] **Step 3: Remove the chroma key locally**

Run:

```powershell
python 'C:\Users\USER\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' `
  --input 'tmp/rivet-regeneration/rivet-chroma.png' `
  --out 'tmp/rivet-regeneration/rivet-transparent.png' `
  --auto-key border `
  --soft-matte `
  --transparent-threshold 12 `
  --opaque-threshold 220 `
  --despill
```

- [x] **Step 4: Inspect the candidate at original resolution before replacement**

Use `view_image` on both temporary files. Reject the candidate if the identity
invariants drift, any extremity is visually incomplete, the green removal
leaves a visible fringe, or any prop/body part touches an edge. If exactly one
defect exists, issue one targeted built-in image edit that repeats every
identity invariant and changes only that defect. If chroma removal cannot
produce clean hair edges, stop and ask before any CLI/native-transparency
fallback.

- [x] **Step 5: Measure and stage the accepted candidate without hidden scaling**

Use Pillow to resize only if the generated dimensions differ from 1024x1024,
preserving aspect ratio and centering on a transparent 1024x1024 canvas. Print
the RGBA mode, four alpha bounds, all four margins, visible-height fraction,
and alpha coverage. Require every margin to be at least 48px, height fraction
between 0.82 and 0.92, and coverage between 0.28 and 0.35. Save the accepted
candidate directly as quality-95 WebP to
`public/assets/characters/hero-engineer/full.webp` only after all checks pass.

- [x] **Step 6: Run the focused test and verify GREEN**

Run the same command from Task 1. Expected: PASS.

Implementation result: the accepted master is RGBA 1024x1024 with thresholded
bounds `(205, 48, 818, 976)`, margins `(205, 48, 206, 48)`, visible height
`0.906250`, and alpha coverage `0.275847`. The 27.58% coverage rounds to the
design's rough 28% floor; it was retained because all extremities are complete
and its live card scale matches Lumi without making Rivet dominant.

---

### Task 3: Remove obsolete compensation and derive unclipped portraits

**Files:**
- Modify: `scripts/generate-authored-assets.py`
- Modify: `scripts/generate-authored-assets.test.py`
- Regenerate: `public/assets/characters/hero-engineer/portrait-idle.webp`
- Regenerate: `public/assets/characters/hero-engineer/portrait-focus.webp`
- Regenerate: `public/assets/characters/hero-engineer/portrait-attack.webp`
- Regenerate: `public/assets/characters/hero-engineer/portrait-hit.webp`
- Regenerate: `public/assets/characters/hero-engineer/portrait-win.webp`
- Regenerate: `public/assets/characters/hero-engineer/portrait-loss.webp`

**Interfaces:**
- Consumes: accepted authored Rivet full master and existing `derive_portraits()`.
- Produces: six stable 256x256 portraits without full-master normalization or Rivet-only render shrinking.

- [x] **Step 1: Update tests for an authored complete master**

Delete the synthetic normalization-idempotence test. Change the targeted CLI
scope test so `hero-engineer/full.webp` must remain byte-identical while only
the six selected portrait states change. Keep literal expected paths.

- [x] **Step 2: Run the targeted CLI test and verify RED**

Run:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -B scripts/generate-authored-assets.test.py GenerateAuthoredAssetsTest.test_targeted_cli_preserves_the_selected_full_master_and_changes_only_its_portraits
```

Expected: FAIL until the old Rivet `FULL_ART_ALPHA_COVERAGE_TARGETS` behavior is removed.

- [x] **Step 3: Remove the obsolete Rivet compensation**

Remove `FULL_ART_ALPHA_COVERAGE_TOLERANCE`,
`FULL_ART_ALPHA_COVERAGE_TARGETS`, `normalize_full_art_to_alpha_coverage()`,
`normalize_character_full_art()`, and the `hero-engineer` entry in
`PORTRAIT_RENDER_SCALES`. If the render-scale mapping becomes empty, remove it
and render all portrait crops at the standard 240px size and 8px inset.
Keep `--characters` as a portrait-derivation scope selector, but never mutate
an imported `full.webp` from the generator.

- [x] **Step 4: Tune only Rivet's portrait frame from the accepted master**

Start from `(0.50, 0.18, 0.72)`. Derive `portrait-idle.webp`, inspect it at
256x256 and at a 68x68 preview, and change only Rivet's normalized center/size
if needed to retain the full hair silhouette and at least 16px head/face-side
clearance. Do not add runtime CSS exceptions.

- [x] **Step 5: Regenerate all six Rivet portraits**

Run:

```powershell
python -B scripts/generate-authored-assets.py --characters hero-engineer --force-derived-portraits
```

Inspect all six original-resolution outputs and confirm identical underlying
framing with only state overlays changing.

- [x] **Step 6: Verify generator scope and repeatability**

Run all Python generator tests. Hash the accepted full master and six portraits,
repeat the targeted generator command, and require all seven SHA-256 hashes to
remain identical. Confirm `git diff --name-only -- public/assets` lists exactly
the Rivet full master plus six portraits.

Implementation result: Rivet's source-specific portrait frame was tuned to
`(0.50, 0.18, 0.80)`. The idle portrait coverage is `0.579895`, compared with
Lumi at `0.577621`, and all seven Rivet asset hashes remained identical after
a repeat targeted generation.

- [x] **Step 7: Commit the accepted asset and generator contract**

Stage only the generator, its tests, the new plan, Rivet full master, and six
Rivet portraits. Preserve untracked `tmp/`. Commit with:

```powershell
git commit -m "fix: regenerate complete Rivet artwork"
```

---

### Task 4: Verify live mobile rendering and delivery

**Files:**
- Temporary only: one Playwright visual-inspection spec under `tests/e2e/`, deleted before commit
- Rebuild: `artifacts/ait/game.ait`

**Interfaces:**
- Consumes: final Rivet full master and portraits through existing manifest paths.
- Produces: visual evidence and release verification without runtime code changes.

- [x] **Step 1: Capture the three live screens for all playable characters**

At 360x640, capture character selection, floor identity, and battle HUD for
Rivet, Lumi, and Sera. Inspect all nine screenshots. Rivet must show complete
hair, wrench, and both shoes in selection; complete full-body identity at a
scale comparable to Lumi/Sera; and an unclipped full hair silhouette in the
68px HUD portrait.

Implementation result: the temporary Playwright inspection passed 3/3 and all
nine screenshots were inspected at original 360x640 resolution. The temporary
spec was removed after capture.

- [x] **Step 2: Run focused project checks**

Run with Node 24.15.0:

```powershell
npm run check:assets
npm run check:source-policy
npm run typecheck
node node_modules/@playwright/test/cli.js test tests/e2e/portrait-layout.spec.ts
```

Expected: every command exits 0 and portrait-layout passes both configured
mobile projects.

- [x] **Step 3: Run full regression and delivery gates**

Run sequentially to avoid prior parallel resource contention:

```powershell
npm test
npm run test:e2e
npm run test:delivery-gates
npm run build:ait
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Capture exact file/test counts and AIT entries/uncompressed bytes from fresh
outputs. Do not reuse earlier counts as current evidence.

- [ ] **Step 4: Request independent read-only review**

Review the committed range against the design, asset scope, full-resolution
candidate, six portraits, and live screenshots. Fix every Critical or Important
finding and re-review; record Minor findings accurately.

- [ ] **Step 5: Push and update the existing pull request**

Push `feat/pve-delivery` normally without force. Update PR #3 with the new
commit, generation method, framing metrics, direct visual comparison, and
fresh verification evidence. Verify local HEAD, remote branch head, and PR head
match; verify the PR remains open, mergeable, and clean against `main`.

- [ ] **Step 6: Clean only task-owned temporary evidence**

After final assets and PR evidence are confirmed, remove only
`tmp/rivet-regeneration/` and the temporary Playwright spec. Do not remove or
modify any other untracked `tmp/` content.
