# Rivet Character Scale Design

**Status:** Superseded on 2026-08-13 by
`2026-08-13-rivet-full-art-regeneration-design.md` after full-resolution review
confirmed that the source illustration itself was already cropped.

## Problem

The first correction widened Rivet's battle-portrait crop from `0.56` to
`0.72`, which stopped the tightest crop but did not make the three playable
characters the same visual size. Rivet's `full.webp` still occupied 53.2% of
its canvas while Lumi and Sera occupied 31.8% and 30.6%. The derived idle
portrait occupied 66.1%, compared with 57.8% and 48.9%.

Character selection, floor identity, results, and the ending use `full.webp`
directly. The HUD uses the portrait derivatives. The mismatch therefore has
to be corrected in both authored asset paths, not in shared runtime CSS.

## Design

Keep Rivet's artwork, identity, frame anchor, and the shared component styles.
Normalize Rivet's full art on its existing 1024x1024 transparent canvas to a
32% visible-alpha target, centered in both axes. The normalization only
shrinks oversized art and becomes a no-op once the target tolerance is met,
so repeated generator runs cannot keep shrinking the character.

Keep Rivet's widened `0.72` portrait crop, render that crop at 88% of the
standard 240px subject box, and center it in the unchanged 256x256 portrait
canvas. Apply state overlays after the subject is positioned so their frame
coordinates remain unchanged. Regenerate the six existing states (`idle`,
`focus`, `attack`, `hit`, `win`, and `loss`) through the targeted character
mode in `scripts/generate-authored-assets.py`.

Lumi, Sera, rivals, the owl, and the demon king must remain byte-identical.

## Regression Protection

The asset-generator tests load the real three player assets and compare their
visible-alpha coverage. Rivet's full art and idle portrait must remain within
three percentage points of the comparison players' range. The full-art test
also requires safe upper and lower framing plus a minimum visible height. A
synthetic test proves that full-art normalization is idempotent, and a
subprocess test requires targeted generation to change exactly Rivet's seven
assets while leaving every non-selected asset byte-identical.

Verification covers the focused Python asset tests, repeat-generation hashes,
asset validation, source policy, TypeScript type checking, the relevant
portrait-layout E2E journey at 360x640 and 430x932, and direct 360x640 visual
comparison of character selection, floor identity, and battle HUD for all
three playable characters.

## Non-goals

- Do not redraw or AI-regenerate Rivet.
- Do not change portrait component CSS or HUD dimensions.
- Do not alter character gameplay, identity, manifest paths, or state names.
- Do not rewrite any other character assets.
