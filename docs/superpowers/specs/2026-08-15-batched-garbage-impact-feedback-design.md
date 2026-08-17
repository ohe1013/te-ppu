# Batched Garbage Rows and Restrained Attack Impact Design

## Goal

Replace single-cell garbage drops with queued garbage rows while preserving the
current 1:1 cancellation rules. Strengthen attack feedback by coordinating the
existing projectile, portraits, board reaction, combo message, audio, and
haptics into one restrained presentation timeline.

The match simulation remains deterministic and continues at 60 ticks per
second during every presentation effect. Feedback must never pause commands,
piece gravity, AI updates, replay progression, or match completion.

## Current Behavior and Problem

`resolveAttackExchange` already offsets each side's outgoing attack against its
own queued incoming attack and then nets simultaneous overflow. Net overflow is
stored in the recipient's `incoming` count. The recipient can cancel it with a
later attack until its next lock and clear cycle reaches `garbage-drop`.

At that point, `dropGarbageBatch` currently turns each remaining attack unit
into one independent cell dropped into a random column. The new rule requires
one attack unit to mean one full garbage row with exactly one hole.

The presentation already contains most required ingredients, but they are not
perceived as one hit:

- `attack-sent` starts an attack projectile and attack sound.
- attacker portraits can select the `attack` image.
- recipient portraits only select `hit` when garbage later lands or freeze is
  applied, not when an attack reaches them.
- combo decoration is attached to line clear effects but its procedural
  fallback has no readable combo value.
- board, HUD, sound, and haptics have no shared launch-to-impact timeline.

The result communicates that an attack happened but not that it struck an
opponent.

## Product Rules

### Attack queue and cancellation

The attack formula, combo formula, item attacks, AI behavior, and
`resolveAttackExchange` arithmetic remain unchanged.

1. An outgoing attack first cancels the attacker's existing `incoming` count
   1:1.
2. Simultaneous remaining player and opponent attacks are netted 1:1.
3. Only net overflow produces `attack-sent` and is added to the recipient's
   `incoming` count.
4. Queued incoming remains cancellable until the recipient reaches its existing
   `garbage-drop` gate after locking and resolving a piece.
5. All incoming still present at that gate is applied in one batch in the same
   core step. There is no new delay and no immediate mid-piece board mutation.

A completely canceled attack does not produce an opponent hit cue because no
attack reached the opponent. A dedicated cancellation animation is outside this
feature.

### Garbage row structure

One incoming unit creates one garbage row:

- board width remains 10 cells;
- exactly 9 cells are garbage cells;
- exactly 1 cell is an empty hole;
- every row draws its hole independently from the existing recipient-specific,
  seeded garbage random stream;
- consecutive rows may use the same hole column;
- each successful row consumes exactly one garbage RNG draw.

Each row shifts all fixed board cells up by one stored row and appends the new
garbage row at the bottom. Item markers, piece kinds, and garbage identity move
with their cells.

### Batch and top-out behavior

The core applies rows sequentially inside a single batch operation so failure
is deterministic and partial progress is well-defined. Before inserting a row,
if any cell in the top stored row would be discarded, that row is not inserted
and the recipient immediately tops out. Rows already inserted earlier in the
same batch remain on the board. Remaining incoming is cleared because the match
has ended for that side.

The public presentation receives one batch event, not one event per row. The
event reports the number of successfully inserted rows and their hole columns
in bottom-insertion order. If the first row cannot be inserted, only `top-out`
is emitted. The event is named `garbage-raised` so presentation code no longer
needs to interpret a falling-cell payload as a rising-row payload:

```ts
type GarbageRaisedEvent = {
  readonly type: 'garbage-raised';
  readonly side: SideId; // recipient
  readonly amount: number;
  readonly holeColumns: readonly number[];
};
```

Replay data stores commands and configuration rather than presentation events,
so this event correction does not require a replay migration.

## Approaches Considered

### A. Shared event-derived impact cue (selected)

Map each net `attack-sent` event and its owning public snapshot to a single
presentation cue. A wall-clock presentation controller advances that cue
through launch, impact, and settle phases and supplies the same phase and
intensity to the HUD, portraits, canvas, audio, and haptics.

This adds a small presentation boundary but makes timing explicit, testable,
and easy to tune without touching core combat.

### B. Independent CSS reactions

Let every existing component watch `eventBatches` and start its own animation.
This is initially smaller, but duplicated event consumption and independent
timers will drift. Catch-up frames can also trigger different components in a
different order.

### C. New asset-heavy effects

Add several particle sheets, screen flashes, and larger full-screen camera
shake. This could look more spectacular, but requires new art and atlas work,
costs more on mobile WebViews, and conflicts with the requested restrained
impact.

## Presentation Architecture

### Pure cue mapping

A focused presentation module maps event batches into `AttackFeedbackCue`
values. It does not mutate match state and depends only on the event and its
owning batch snapshot:

```ts
type AttackFeedbackCue = {
  readonly id: string;
  readonly source: SideId;
  readonly target: SideId;
  readonly amount: number;
  readonly combo: number;
  readonly intensity: 'light' | 'medium' | 'strong';
  readonly comboLabel: string | null;
};
```

The stable ID includes the batch tick and event index. Catch-up batches are
sorted by tick and original order. Cues are consumed FIFO, and a later render
cannot restart an already handled cue.

Intensity is determined by the stronger of the net attack amount and combo:

| Tier | Attack amount | Combo | Local displacement | Impact duration |
| --- | --- | --- | --- | --- |
| light | 1 | below 2 | 2 px | 120 ms |
| medium | 2 to 3 | 2 | 4 px | 150 ms |
| strong | 4 or more | 3 or more | 6 px maximum | 180 ms |

The combo label is null below combo 2 and otherwise uses the transient arcade
form `N COMBO!`. It is never added as permanent telemetry.

### Timeline

The presentation controller owns wall-clock time only. It never calls the match
pause API.

1. **Launch, 150 ms:** the source portrait uses `attack`, the source plate moves
   forward by at most 2 px, and the projectile uses a fast ease-out path toward
   the target.
2. **Impact, tier duration:** the target portrait uses `hit`; only the target
   HUD plate and target board receive a short damped displacement; one outline
   ring fades at the contact point. Attack audio and one haptic cue fire at the
   start of this phase.
3. **Settle, 100 ms:** local offsets return to zero and transient labels fade.

Only one attack cue is active at a time. Queued cues are retained rather than
overwritten. Terminal portrait states override attack feedback so a finishing
attack cannot replace the final win, loss, or defeat pose.

The local displacement is deterministic and contains no random jitter. There
is no full-screen shake, repeated flashing, gameplay hit stop, zoom, or camera
rotation.

### Portrait behavior

Active attack feedback temporarily overrides non-terminal portrait memory:

- source during launch: `attack`;
- target during impact: `hit`;
- terminal state: always wins;
- freeze application: continues to use `hit` through existing portrait memory;
- garbage row application: no second large portrait reaction.

Removing the later garbage-driven portrait hit avoids showing the same net
attack as two major character hits. Garbage application still has its own board
and sound feedback.

### Board and HUD behavior

The attack displacement is local to the target's board container and HUD plate.
The other board, controls, page shell, and canvas root remain still. A single
outline pulse uses opacity rather than repeated flashes.

When a garbage batch is applied, the final board is presented from a temporary
vertical offset equal to the number of successfully inserted rows and moves to
zero over one short animation. This reconstructs the pre-batch visual position:
old cells begin where they were, new garbage rows begin below the board, and all
rows rise together. Board content is clipped to its own rectangle. The shift is
capped to the board height for pathological test states.

The garbage rise receives one small upward settle and one `land` sound per
batch. It does not replay attack shake, combo text, attack audio, or haptics for
each row.

### Audio and haptics

Non-attack feedback remains immediate. `attack-sent` audio and haptics move to
the shared impact boundary so visual contact, sound, and touch happen together.
Existing sound intensity and strong-attack BGM ducking remain the authority.

One attack cue produces at most one haptic call. Optional audio or platform
failures remain isolated and cannot interrupt the timeline or simulation.

### Reduced motion and performance

The presentation controller observes `prefers-reduced-motion`.

With reduced motion enabled:

- board and HUD displacement are zero;
- the projectile uses a brief source-to-target crossfade rather than travel;
- portrait changes, the single outline pulse, combo label, audio, and enabled
  haptics remain;
- garbage rows appear with a short opacity transition rather than a vertical
  translation.

DOM animation is limited to `transform` and `opacity`. Pixi presentation changes
use container position and alpha. No animation changes layout dimensions. The
controller retains at most one active attack and a FIFO queue derived from
published event batches. It never drops an attack cue, and removes each queued
entry as soon as that cue settles.

The effect follows the guidance in the GDC session [Juice It or Lose
It](https://gdcvault.com/play/1016487/Juice-It-or-Lose), the restrained layered
feedback described by [Making Combat Suck
Less](https://www.gamedeveloper.com/design/making-combat-suck-less), the
[web.dev animation performance
guide](https://web.dev/articles/animations-guide), and MDN's
[`prefers-reduced-motion`
reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

## Isolation and Flexibility

The implementation keeps three policies separate:

1. a pure board primitive raises one row for a supplied hole column;
2. a seeded batch function selects holes and orchestrates top-out and events;
3. a presentation-only cue mapper and timeline choose visual intensity and
   timing.

Changing future garbage timing, hole selection, active-piece behavior, attack
thresholds, or motion amplitude will therefore not require rewriting attack
cancellation arithmetic.

## Error Handling

- Invalid incoming and attack counts continue to normalize to non-negative
  integers at the attack boundary.
- Generated hole columns must be integers within board width. The seeded helper
  is the only production source. Pure row insertion returns an explicit failure
  result with the original board when supplied an invalid hole, rather than
  throwing or corrupting board length.
- Presentation payloads with invalid or zero amounts produce no cue.
- Missing portrait or atlas assets retain existing idle/procedural fallbacks.
- Audio, haptic, animation-frame, and motion-query failures do not mutate or
  pause the match.
- All transient presentation work is canceled on unmount.

## Test Strategy

### Core

- one raised row has nine garbage cells and one exact hole;
- row insertion is immutable and preserves cell kinds, markers, and garbage
  identity while shifting;
- every successful row consumes one recipient-specific seeded RNG draw;
- independent rows can repeat a hole and remain deterministic for a seed;
- N pending attacks create N rows and one batch event at the existing recipient
  garbage gate;
- 1:1 queued cancellation and simultaneous netting are unchanged;
- a first-row overflow emits only top-out;
- partial batch overflow keeps successful rows, reports their holes once, and
  emits top-out;
- player and opponent streams remain symmetric and independent;
- replay determinism and match invariants remain valid.

### Presentation

- cue mapping identifies source, target, net amount, owning-snapshot combo, and
  all three exact intensity thresholds;
- fully canceled attacks produce no cue;
- catch-up batches preserve FIFO order and are not replayed on rerender;
- launch, impact, and settle deadlines are exact and do not pause the match;
- terminal portraits override transient attack and hit poses;
- only the target HUD and board move during impact;
- combo text appears only from combo 2;
- garbage batches rise together and produce one sound;
- audio and haptics fire once at impact and optional failures are isolated;
- reduced motion removes translations while preserving non-motion feedback;
- unmount cancels every pending frame or timer.

### Verification

Run focused core, render, match-screen, portrait, sound, haptic, and replay
tests first, followed by the full unit suite, typecheck, production build, and
the repository's delivery checks. A mobile portrait smoke test must confirm
that light, medium, and strong reactions remain readable without obscuring the
boards or controls.

## Non-goals

- changing attack, combo, scoring, item, or AI formulas;
- changing the 1:1 cancellation window;
- applying garbage while an active piece is falling;
- adding a cancellation-specific animation;
- adding new character or particle bitmap assets;
- introducing full-screen shake, repeated flashes, gameplay hit stop, zoom, or
  camera rotation;
- adding permanent combo or incoming telemetry to the HUD.
