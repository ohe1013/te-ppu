# Rivet Full-Art Regeneration Design

**Status:** Direction A approved by the user on 2026-08-13; detailed spec
awaiting user review before implementation.

**Supersedes:** `2026-08-13-rivet-portrait-framing-design.md` as the visual
source-of-truth for Rivet.

## Problem and Root Cause

Rivet's current master is semantically cropped before the game renders it:
the wrench exits through the top edge, both shoes are cut at the bottom edge,
and part of the hair/head detail is already missing. The previous scale and
crop corrections only placed this incomplete source inside a larger transparent
canvas. They could not restore pixels that were never present.

The character-selection card uses the full art with `object-fit: contain`, so
missing extremities remain visible even when the canvas has numerical margins.
The floor identity, result, and ending views also consume the same full master.
The battle HUD derives its six portraits from that master, which carries the
head crop into gameplay.

## Selected Approach

Regenerate Rivet as a new full-body illustration while preserving his current
identity. Use the existing Rivet image as the identity reference, and use Lumi
and Sera only as composition, scale, polish, and line-treatment references.
Do not extend the clipped source and do not redesign Rivet into a different
character.

### Identity Invariants

- Youthful apprentice magic engineer with the same face and upbeat expression.
- Dark navy-blue spiky hair and blue goggles/head gear.
- Red scarf, cream mechanic jumpsuit, yellow work gloves, and red/teal boots.
- Red mechanical backpack and one oversized silver wrench.
- Bright arcade-anime rendering, crisp dark outline, clean cel shading, and the
  same general palette as the current Rivet.
- No text, logo, watermark, floor, cast shadow, or extra character.

### Composition and Framing

- Square 1024x1024 master, centered full-body three-quarter/front pose.
- Entire hair silhouette, goggles, scarf, wrench, backpack, both hands, and
  both shoes must be visibly complete.
- No body part or prop may touch or cross a canvas edge.
- Keep at least 48px clear space around every visible extremity after
  background removal; target 64-96px where the pose permits.
- Visible content should occupy 82-92% of canvas height and roughly 28-35% of
  total alpha area, matching Lumi and Sera without making Rivet dominant.
- Reposition the wrench inside the silhouette, upright or slightly diagonal,
  rather than allowing it to extend beyond the top edge.
- Both feet must rest fully inside the frame with complete soles/toes.

## Generation and Asset Flow

Use the built-in image-generation path with three local references:

1. Current Rivet full art: identity, outfit, palette, equipment, and face.
2. Lumi full art: complete-body padding and compact readable silhouette.
3. Sera full art: line quality, cel shading, and centered full-body framing.

Generate on a perfectly flat solid `#00ff00` chroma-key background with no
shadow or green in the subject. Remove the key locally with the installed
`remove_chroma_key.py` helper, validate transparent corners and clean edges,
then produce the final 1024x1024 RGBA WebP at Rivet's existing manifest path.
The generated source is project-bound and must not remain only under the
default generated-images directory.

Do not overwrite the tracked master until the generated candidate passes
full-resolution visual inspection. If the first candidate breaks an identity
invariant or clips an extremity, make one targeted generation/edit iteration
that changes only that defect.

## Portrait Derivation

Regenerate Rivet's existing six states (`idle`, `focus`, `attack`, `hit`,
`win`, and `loss`) from the accepted full master. Retune the Rivet crop and
remove the previous compensating render-scale/normalization rules when the new
authored master makes them unnecessary.

Every 256x256 portrait must:

- show the complete hair silhouette and face;
- retain at least 16px clear space above the protected head region and at both
  face-side edges;
- keep the face readable at the actual 68px HUD size;
- use identical underlying framing across all six states; and
- preserve the existing state-overlay coordinates and manifest paths.

## Regression and Visual Acceptance

Before replacing production assets, add a failing real-asset regression that
requires Rivet's visible height to be within 82-92% of the full canvas and all
alpha bounds to retain at least 48px edge clearance. The current source must
fail the visible-height requirement.

After replacement:

- run the full asset-generator suite and repeat-generation hash check;
- confirm only Rivet's full master and six portraits change;
- inspect the transparent full master and every portrait at original size;
- compare Rivet, Lumi, and Sera at 360x640 on character selection, floor
  identity, and battle HUD;
- explicitly verify that hair, wrench, and both shoes are complete in selection
  and that the complete hair silhouette remains visible in the HUD;
- run asset validation, source policy, typecheck, unit tests, full mobile E2E,
  delivery gates, and explicit AIT package verification.

## Non-Goals

- No gameplay, character stats, copy, route, CSS, HUD-size, or manifest-path
  changes.
- No changes to Lumi, Sera, rivals, owl, backgrounds, or audio.
- No attempt to repair the clipped original through further canvas scaling.
