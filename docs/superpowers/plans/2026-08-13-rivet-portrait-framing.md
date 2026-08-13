# Rivet Character Scale Correction Plan

**Goal:** Match Rivet's full-art and battle-portrait scale to Lumi and Sera
without changing shared UI sizing.

**Architecture:** Keep the shared React/CSS renderers unchanged. Apply an
idempotent visible-alpha normalization to Rivet's full-art canvas, render his
existing wider portrait crop at a reduced subject scale, regenerate only his
six derivatives, and compare the real player assets in regression tests.

**Tech Stack:** Python 3, Pillow, React 19, Playwright, authored WebP assets

## Global Constraints

- Preserve Rivet's artwork and the 1024x1024 full-art canvas.
- Preserve every non-Rivet asset byte-for-byte.
- Keep all portrait outputs at exactly 256x256 with alpha.
- Keep existing manifest paths and portrait state keys unchanged.
- Use the deterministic asset generator; do not AI-redraw Rivet.

---

### Task 1: Lock the real cross-character scale regression

- [x] Add tests that compare visible-alpha coverage for the real Rivet, Lumi,
  and Sera full art and idle portraits.
- [x] Require a safe Rivet full-art top margin.
- [x] Add a synthetic idempotence test for full-art normalization.
- [x] Add a subprocess regression proving targeted generation changes exactly
  Rivet's seven assets and no others.
- [x] Verify RED: full art was 53.2% against a 34.8% upper bound; the idle
  portrait was 66.1% against a 60.8% upper bound.

### Task 2: Normalize and regenerate only Rivet

- [x] Normalize Rivet full art to 32% visible-alpha coverage on its existing
  centered transparent canvas.
- [x] Keep the `0.72` portrait crop and render its subject at 88% inside the
  unchanged 256x256 output.
- [x] Add targeted `--characters` generation and regenerate only
  `hero-engineer` full art plus the six portrait states.
- [x] Repeat generation and require all seven SHA-256 hashes to remain
  identical.

### Task 3: Verify and deliver

- [x] Run the complete Python generator suite, asset validation, source
  policy, TypeScript checking, Vitest, and delivery gates.
- [x] Run the portrait-layout E2E spec at 360x640 and 430x932.
- [x] At 360x640, visually compare all three players on character selection,
  floor identity, and battle HUD.
- [x] Build and verify the Apps-in-Toss artifact.
- [x] Confirm the diff contains only the generator, its tests and documents,
  Rivet full art, and six Rivet portraits; preserve untracked `tmp/`.
- [x] Commit as `fix: normalize Rivet character scale`, push the delivery
  branch, and update the existing pull request.
