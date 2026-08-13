# Rivet Portrait Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Rivet's six battle portraits so his face is not oversized or visually clipped compared with Lumi and Sera.

**Architecture:** Keep the shared React/CSS portrait renderer unchanged and correct the deterministic authored crop at its source. Increase only Rivet's normalized crop size, regenerate only Rivet's six derivatives, and guard the minimum retained source area with a real-asset regression test.

**Tech Stack:** Python 3, Pillow, React 19, Playwright, authored WebP assets

## Global Constraints

- Preserve `public/assets/characters/hero-engineer/full.webp` unchanged.
- Preserve every non-Rivet portrait byte-for-byte.
- Keep all portrait outputs at exactly 256x256 with alpha.
- Keep existing manifest paths and portrait state keys unchanged.
- Use the repository's deterministic asset generator; do not AI-redraw Rivet.

---

### Task 1: Widen and regenerate Rivet's portrait crop

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
- Consumes: `alpha_content_bbox(image)` and `portrait_crop_box(bbox, frame)` from the existing generator.
- Produces: the unchanged six-file Rivet portrait contract at a wider `0.72` normalized crop size.

- [ ] **Step 1: Add the failing real-asset crop regression**

Add a test that loads Rivet's full art, obtains its visible bounds, calculates
the configured crop, and independently asserts:

```python
minimum_crop_size = round(min(source_width, source_height) * 0.70)
self.assertGreaterEqual(crop_box[2] - crop_box[0], minimum_crop_size)
```

The production change this catches is Rivet returning to the overly tight
`0.56` crop that made him dominate the HUD portrait.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
python scripts/generate-authored-assets.test.py -k test_rivet_portrait_crop_keeps_character_scale_below_the_approved_limit
```

Expected: one assertion failure because the current crop retains only 56
percent, below the independent 70-percent minimum.

- [ ] **Step 3: Apply the minimal source fix**

Change only Rivet's frame entry:

```python
"hero-engineer": (0.50, 0.18, 0.72),
```

- [ ] **Step 4: Regenerate only Rivet's six portrait derivatives**

Invoke the existing `derive_portraits(("hero-engineer",),
force_derived_portraits=True)` entry point so no other character file is
rewritten.

- [ ] **Step 5: Verify GREEN and asset contracts**

Run:

```powershell
python scripts/generate-authored-assets.test.py
npm run check:assets
npm run check:source-policy
npm run typecheck
```

Expected: all commands exit 0; the asset validator reports authored assets;
the source-policy checker reports zero findings.

- [ ] **Step 6: Verify mobile rendering**

Run the portrait-layout E2E spec with Node 24.15.0 at both configured mobile
projects, capture a 360x640 Rivet match, and inspect all six generated WebPs.
The face and hair must remain readable inside the portrait plate without
changing the 68px HUD plate.

- [ ] **Step 7: Confirm scope and commit**

Run `git diff --check` and `git status --short`. Confirm only the generator,
its test, the two design/plan documents, and six Rivet portraits changed;
preserve the existing untracked `tmp/` directory. Commit with:

```powershell
git add docs/superpowers/specs/2026-08-13-rivet-portrait-framing-design.md
git add docs/superpowers/plans/2026-08-13-rivet-portrait-framing.md
git add scripts/generate-authored-assets.py scripts/generate-authored-assets.test.py
git add public/assets/characters/hero-engineer/portrait-*.webp
git commit -m "fix: reframe Rivet battle portraits"
```
