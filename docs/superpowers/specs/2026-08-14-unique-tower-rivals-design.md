# Unique Tower Rivals Design

**Status:** Approved for autonomous implementation on 2026-08-14. The user
explicitly asked for the reused rivals to become unique characters and asked
not to be interrupted for design approval.

## Problem

The tower contains fifteen encounter slots, but seven slots reuse an opponent
already seen on another floor. Repeated portraits make later floors feel
under-populated and weaken the sense that each floor is a new place.

## Selected Direction

Keep the eight existing opponents in their first or signature slots and replace
only the seven repeated slots. Every regular tower encounter will then have a
different `characterId`, full-body master, and state portrait set. The owl
challenge remains separate from the fifteen regular encounters.

| Slot | New ID | Display name | Visual role |
| --- | --- | --- | --- |
| 2F-3 | `spark-slime` | 전광 슬라임 볼트 | Round electric experiment escaped from a glass coil harness |
| 3F-2 | `frost-smith` | 서리 대장장이 브룸 | Broad ice-forge artisan with a blocky crystal hammer |
| 3F-3 | `storm-harpy` | 폭풍 하피 제피라 | Lean sky duelist with solid wing-blades and wind ribbons |
| 4F-2 | `brass-minotaur` | 황동 미노타우로스 브라스 | Heavy furnace guardian with brass armor and piston horns |
| 4F-3 | `cinder-witch` | 잿불 마녀 신더 | Triangular fire caster with a coal-black mantle and ember staff |
| 5F-1 | `chain-knight` | 사슬 기사 카덴 | Tall castle jailer with a shield-like chain reel |
| 5F-2 | `night-archivist` | 밤의 기록관 베스퍼 | Floating royal scribe with a crescent book and violet seals |

The silhouettes deliberately alternate round, broad, lean, heavy, triangular,
tall, and floating so the roster remains readable at the 68px battle portrait
size. Each palette also belongs to its floor while remaining distinct from the
existing opponent in that floor.

## Art Contract

- Produce one 1024x1024 RGBA full-body WebP per new rival.
- Match the existing polished arcade-anime rendering: dark crisp outline,
  saturated color, clean cel shading, readable face, and simple opaque shapes.
- Keep the entire character and signature prop inside the frame with generous
  transparent padding. No text, logo, watermark, floor, cast shadow, or scenery.
- Generate on a perfectly flat `#00ff00` chroma-key field, then remove the key
  locally and inspect the alpha result before it becomes a production asset.
- Derive six 256x256 RGBA WebP portraits per rival using the existing lieutenant
  states: `idle`, `smug`, `attack`, `hit`, `panic`, and `defeat`.
- State variants share one crop and identity; existing overlays provide the
  expression/action emphasis without inventing separate inconsistent masters.

## Generation Prompt Set

Each master used the built-in image generator with this shared direction:
"Original mobile puzzle-battle rival, polished Japanese arcade character art,
complete centered full body and signature prop, crisp thick deep-navy outline,
clean cel shading, readable face, strong silhouette, square 1024 canvas, flat
`#00ff00` background only, no text, logo, watermark, scenery, floor, cast
shadow, cropped anatomy, or frame contact."

The seven subject prompts were:

- `spark-slime`: round cyan electric slime experiment inside a copper coil
  harness, tiny conductor baton, playful sparks, mischievous grin.
- `frost-smith`: broad navy-and-ice artisan, crystal beard and eyebrows,
  oversized blocky translucent hammer, sturdy boots and apron.
- `storm-harpy`: lean teal sky duelist, solid feather wing-blades, swept silver
  hair, taloned boots, yellow wind ribbons and confident expression.
- `brass-minotaur`: heavy red-brown furnace guardian, brass plate armor, piston
  horns, glowing orange vents, broad planted stance and massive gauntlets.
- `cinder-witch`: triangular coal-black mantle, ember-orange hair, pointed hat,
  glowing coal familiar and crooked fire staff, sly caster pose.
- `chain-knight`: tall cobalt castle jailer, narrow visor, shield-like chain
  reel, heavy links, long armored silhouette and disciplined stance.
- `night-archivist`: floating violet royal scribe, crescent spellbook, ink-blue
  robes, gold trim, luminous seals and calm severe expression.

## Data and Loading Contract

Extend `FloorOpponentId`, the authored manifest schema/parser/fixture, the
public manifest, the asset validator, and the portrait generator with the seven
IDs. Update only the seven repeated entries in `FLOOR_ENCOUNTERS`, including
their story copy. Generic asset loading and battle rendering should continue to
work without character-specific runtime branches.

The progression contract becomes:

- five floors;
- three ordered encounters per floor;
- fifteen distinct regular `characterId` values across those encounters;
- `demon-king` remains floor 5 encounter 3; and
- the owl finale remains outside the regular fifteen-opponent set.

## Acceptance Criteria

- A catalog regression proves all fifteen regular encounter IDs are unique.
- Asset validation proves every new full master and every declared portrait
  exists, decodes, has the required dimensions, and contains transparency.
- The typecheck, focused progression/asset tests, full unit suite, source policy,
  web build, and AIT package verification pass from fresh commands.
- At 360x640, the tower/floor-intro/battle path loads the new rivals without a
  missing-asset fallback, clipped head/feet, or oversized portrait.
- No existing character art, gameplay rules, save schema, audio, or user-owned
  untracked files are changed.
