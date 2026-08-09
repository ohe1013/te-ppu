# Tower overlays, upward route, owl twist, and difficulty design

## Status

Proposed implementation specification. The user selected the hidden owl-boss
approach (B): the demon king remains the final encounter of floor 5, then the
owl is revealed as a hidden final opponent. Defeating the owl unlocks the next
difficulty.

## Goals

1. Make the settings dialog, exit confirmation, and resume countdown feel like
   one reliable overlay system on every supported viewport.
2. Make each `NEXT` preview communicate the actual falling-block shape without
   relying on color or an authored image being available.
3. Make the tower read from floor 1 at the bottom to floor 5 at the top, with
   the route and floor cards visually inside the tower structure.
4. Preserve the deliberate three-encounter order on every floor, including a
   recognizable floor boss at encounter 3.
5. Add a clear story payoff: the owl mascot is the hidden tower architect and
   becomes a playable final opponent after the demon king.
6. Add Easy, Normal, and Hard difficulty progression. Easy is the default;
   each next difficulty is unlocked only after defeating the owl on the current
   difficulty. Difficulty changes both the visual palette and AI strength.

## Non-goals

- Do not randomize encounter order. The authored floor order is part of the
  story and the third encounter remains the floor boss.
- Do not replace the existing board rules, piece rules, attack resolution, or
  authored character identity system.
- Do not copy Puyo Puyo 2 artwork, characters, UI assets, or exact composition.
  The reference is limited to readable opponent identity, compact previews,
  reaction emphasis, and attack feedback.
- Do not add online matchmaking or server-backed progression.

## User experience

### Match overlays

Introduce a shared modal presentation contract used by all match overlays:

- a fixed viewport layer with safe-area padding;
- a dimmed scrim;
- a centered panel with a stable maximum width;
- `role="dialog"`, `aria-modal="true"`, labelled heading, and focus return;
- Escape closes only an idle dismissible dialog;
- closing or countdown states disable accidental underlying interaction;
- the layer must not be positioned from the header button or clipped by the
  match content container.

`SettingsPanel` becomes a centered settings dialog rather than a fixed
top-right popover. Its trigger remains in the match header, but the dialog is
rendered as a sibling overlay so safe areas and small screens cannot move it
away from the viewport or clip it.

`ExitConfirmation` uses the same shell and retains its existing close timeout,
retry, focus trap, and `idle/closing/failed` states. Its content and buttons
remain unchanged except for the shared layout and visual treatment.

The lifecycle resume UI uses the same scrim and centered panel. While the match
is backgrounded, it shows a large `3`, `2`, and `1` in sequence, remains
non-interactive, and disappears only when the lifecycle coordinator releases
the background pause. The current deterministic lifecycle timer remains the
source of truth; the UI only renders its callback value.

### NEXT preview

Each preview item will contain:

- a small four-cell grid showing the actual tetromino geometry;
- a visible piece label (`I`, `J`, `L`, `O`, `S`, `T`, or `Z`) for fast
  recognition and accessibility;
- the existing tile asset as an optional visual enhancement when loaded;
- item indication that does not obscure the shape.

The geometry is defined once in a presentation map, not inferred from the
piece color. Missing assets must still render a recognizable shape. The
existing `data-kind`, `data-item`, and test IDs remain stable.

### Tower route

The floor list keeps logical DOM order `1, 2, 3, 4, 5` for keyboard and screen
reader navigation, but the visual route uses a reversed vertical layout so
floor 1 is at the bottom and floor 5 is at the top. The central route is a
contained tower shaft:

- remove the loose external rope treatment;
- add a central shaft/frame with a tower silhouette or authored tower art
  clipped inside the route bounds;
- place the alternating floor cards and markers inside that shaft;
- keep the floor 5 boss visually closest to the crown/top of the tower;
- use connector segments that terminate at the floor markers rather than
  floating outside the cards.

The route remains scrollable on small screens. The active/unlocked floor must
remain visually distinct from cleared and locked floors. Floor progress copy
must show `1/3`, `2/3`, or `3/3` without restoring the old oversized telemetry
blocks.

### Story and hidden owl fight

The normal floor journey remains:

```text
TOWER -> FLOOR_INTRO -> MATCH -> RESULT
       -> next FLOOR_INTRO (encounters 1 and 2)
       -> RESULT for floor boss (encounter 3)
```

After a win against floor 5's demon king, the app enters a dedicated owl
reveal screen. The reveal reframes the owl mascot as the tower architect who
used the demon king as a decoy and has been steering every floor.

The reveal's primary action starts a special hidden owl match. This is a bonus
match after floor 5, so every floor still has exactly three authored
encounters. The owl match uses the normal match board and opponent reaction
presentation, but its opponent identity is the owl asset and its own
encounter copy. A loss returns to the owl reveal with a retry action. A win
marks the current difficulty's owl challenge as cleared, persists progression,
and enters the ending screen.

The ending screen acknowledges the cleared difficulty and exposes the next
difficulty when one is available. If Hard is cleared, it shows the completed
tower result without offering a nonexistent fourth difficulty.

### Difficulty selection

The tower screen gains a compact difficulty selector above the route:

- `EASY` is selected and unlocked in a new save;
- `NORMAL` unlocks after the Easy owl match;
- `HARD` unlocks after the Normal owl match;
- locked choices show why they are unavailable;
- switching difficulty preserves each difficulty's own floor progress;
- the selected difficulty is persisted, but a fresh save always selects Easy.

Each difficulty has a distinct visual palette exposed through a root
`data-difficulty` attribute and CSS variables. The palette changes the stage
background, tower accents, and danger/highlight colors while preserving
contrast and readable text.

The AI profile API accepts both floor and difficulty. Easy preserves the
current floor profiles. Normal and Hard progressively reduce reaction delay
and increase tactical lookahead/risk-aware weighting. The exact modifier is
centralized in the AI profile layer and tested as monotonic strength, rather
than scattered through the match loop.

## State and route design

### Progress schema

Progress moves from schema version 2 to version 3. The active difficulty is
separate from per-difficulty tower progress:

```ts
type Difficulty = 'easy' | 'normal' | 'hard';

interface DifficultyRunProgress {
  highestUnlockedFloor: Floor;
  clearedFloors: ClearedFloors;
  owlDefeated: boolean;
}

interface ProgressState {
  schemaVersion: 3;
  selectedDifficulty: Difficulty;
  unlockedDifficulties: Record<Difficulty, boolean>;
  difficultyProgress: Record<Difficulty, DifficultyRunProgress>;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}
```

The v2 migration maps the existing floor state into Easy, keeps settings, sets
Easy as selected and unlocked, and initializes Normal/Hard as locked with
floor 1 unavailable until unlocked. Corrupt-save backup and existing save
retry semantics remain intact.

`TowerController` reads and writes the active difficulty's run progress. Floor
completion only advances the active difficulty. The owl victory is idempotent:
replaying a cleared difficulty cannot revoke its unlocks.

The app route gains explicit states for the special encounter, conceptually:

```text
OWL_REVEAL -> OWL_MATCH -> OWL_RESULT -> ENDING
```

The route carries the selected difficulty but does not duplicate the whole
progress object. Existing floor routes continue carrying floor, encounter
index, wins, and match seed.

### Asset contract

Reuse the existing owl common asset for the reveal and opponent plate. Add
only the minimum manifest/type entry needed for a special opponent identity;
procedural fallbacks must show the owl name and role when an image is missing.
No generated or authored asset should be required for the route to function.

## Verification plan

Unit tests:

- overlay focus, Escape, safe-area layout contract, and countdown state
  transitions;
- all seven NEXT shapes render geometry and remain identifiable without image
  assets;
- tower route preserves logical order while visual floor coordinates rise;
- each floor's encounter order is unchanged and boss index remains `2`;
- v2 progress migrates to v3 with Easy selected and independent difficulty
  defaults;
- floor wins advance only the selected difficulty;
- owl victory unlocks exactly the next difficulty and is idempotent;
- AI profiles become stronger from Easy to Normal to Hard.

Integration/E2E tests:

- open settings, exit confirmation, and resume countdown at portrait mobile
  dimensions and assert centered overlay bounds;
- verify visible shaped NEXT previews;
- verify floor 1 is below floor 5 in the tower route;
- complete floor 5, observe owl reveal, complete owl match, select Normal, and
  observe the changed difficulty palette;
- confirm Easy and Normal retain independent floor progress after switching.

Run the repository's existing typecheck, unit, E2E, asset, source-policy,
build, and delivery gates after implementation. Record the actual runtime
version and any environment-specific release limitation separately from the
functional result.

## Rejected alternatives

- Randomizing all three encounters was rejected because authored floor bosses
  and the narrative climb need a stable final opponent.
- A story-only owl reveal was rejected because it does not satisfy the user's
  request to defeat the owl before unlocking the next difficulty.
- Making the owl replace the demon king was rejected because it weakens the
  existing floor-boss identity and would change the established three-fight
  floor contract.
