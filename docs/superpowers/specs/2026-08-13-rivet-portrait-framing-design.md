# Rivet Portrait Framing Design

**Status:** Approved for implementation on 2026-08-13.

## Problem

Rivet's six square battle portraits show substantially more character scale
than Lumi and Sera. The shared HUD and character portrait components render
all three players with the same `object-fit: cover` and centered positioning,
so the mismatch originates in Rivet's authored crop rather than runtime CSS.
The tight crop makes Rivet's hair and face feel clipped at mobile HUD sizes.

## Design

Keep Rivet's existing `full.webp` artwork and all runtime component styles.
Widen only Rivet's source crop by changing its normalized portrait frame size
from `0.56` to `0.72`. Keep the existing horizontal and vertical anchors so
the face remains centered, and regenerate the six existing states (`idle`,
`focus`, `attack`, `hit`, `win`, and `loss`) through
`scripts/generate-authored-assets.py`.

This preserves Rivet's identity and state overlays pixel-for-pixel apart from
the deterministic reframing. Lumi, Sera, rivals, the owl, and the demon king
must remain byte-identical.

## Regression Protection

The asset-generator test will calculate Rivet's crop against the real
nontransparent full-art bounds and require the square crop to retain at least
70 percent of the source's smaller visible dimension. The old `0.56` frame
must fail this test; the approved `0.72` frame must pass it.

Verification will cover the focused Python asset tests, asset validation,
source policy, TypeScript type checking, the relevant portrait-layout E2E
journey at 360x640 and 430x932, and direct visual inspection of all six output
portraits plus a real 360x640 match screenshot.

## Non-goals

- Do not redraw or AI-regenerate Rivet.
- Do not change portrait component CSS or HUD dimensions.
- Do not alter character gameplay, identity, manifest paths, or state names.
- Do not rewrite any other character assets.
