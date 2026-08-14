# Name Entry Controls and Tower Scroll Design

## Context

The Android build exposes two usability problems on a touch device.

1. The initials screen lets the player move a highlighted letter with the
   direction pad, but it has no visible action button that activates the
   highlighted key. The bottom controls contain only the direction pad and
   `BACK`, while `END` consumes space inside the letter grid.
2. The tower route intentionally uses `flex-direction: column-reverse` so
   floor 1 is physically lowest. The route clips its contents while the outer
   app shell scrolls, so entering the tower starts at floor 5 and moves the
   entire screen instead of just the floor list.

The approved change prioritizes predictable mobile interaction and progression
order over preserving the old bottom-to-top tower arrangement.

## Goals

- Keep direct letter tapping and add a complete direction-pad interaction path.
- Put `BACK` in the upper-left safe area of the initials screen.
- Give `DEL` the space currently shared by `DEL` and `END`.
- Put a visible `선택` action beside the direction pad and `END` directly below
  that action.
- Show floor 1 first whenever the tower screen opens.
- Keep the tower header, status, and difficulty controls fixed while only the
  tower route scrolls.
- Hide the tower scrollbar without disabling touch, wheel, keyboard, or
  assistive-technology scrolling.

## Non-goals

- Do not change profile persistence, route transitions, scoring, floor unlocks,
  encounter continuation, or battle behavior.
- Do not replace the shared direction-pad component or create a new general
  action-panel abstraction.
- Do not change tower artwork, rival order, or the five-floor progression
  contract.
- Do not remove direct tapping from the initials keyboard.

## Name Entry Design

### Keyboard model

The first four rows remain `A-F`, `G-L`, `M-R`, and `S-X`. The final row is:

- `Y` in logical column 1;
- `Z` in logical column 2;
- `DEL` spanning logical columns 3 through 6.

`END` leaves the navigable name-key grid. `NameKey` therefore represents only
letters and `DEL`, and `moveNameKey()` continues to choose the vertically
nearest key center without wrapping at row edges. Moving down from the right
side of the fourth row lands on the enlarged `DEL` key instead of `END`.

### Input behavior

- Tapping a letter or `DEL` directly both focuses and activates that key, as it
  does today.
- Tapping a direction button changes only the highlighted name key.
- Tapping `선택` activates the highlighted letter or `DEL`.
- Pressing Enter while the screen container owns focus mirrors `선택`.
- Pressing Backspace deletes the last character.
- Input remains capped at three uppercase ASCII letters.
- `END` is disabled until exactly three letters exist. Activating an enabled
  `END` calls `onComplete(draft)` once.
- Native activation remains intact when a real button owns DOM focus; the
  screen-level Enter handler must not double-activate `BACK`, `선택`, or `END`.

### Layout

`BACK` moves out of the bottom control cluster and sits at the upper-left edge
inside the existing safe-area padding. The header receives enough left
clearance that it never overlaps the back control without consuming extra
vertical space on the 360x640 viewport.

The lower control area uses two columns:

- the existing direction pad on the left;
- an action column on the right with the large `선택` button above `END`.

The action buttons use the existing arcade button styles and minimum touch
targets. Focus-visible outlines, pressed-key indication, Korean accessible
direction labels, and the `END` disabled state remain visible.

## Tower Design

### Order and initial position

The floor elements retain logical DOM order `1, 2, 3, 4, 5`, and the visual
layout uses the same top-to-bottom order. No mount-time scroll mutation is
needed: the route's natural `scrollTop = 0` position starts with floor 1.

The shaft and alternating left/right cards remain unchanged. This changes only
the progression direction on screen, not which floor is unlocked or selected.

### Scroll ownership

The tower screen occupies exactly one dynamic viewport and does not overflow
the outer app shell. Its fixed region contains:

- tower brand and upper-left return action;
- optional notice and active-run status;
- optional difficulty-lock notice;
- difficulty selector.

The route fills the remaining height with `min-height: 0` and owns vertical
overflow. It uses contained vertical panning so a swipe at either boundary does
not move the outer screen.

The scrollbar is hidden with standards-based Firefox styling and the WebKit
scrollbar pseudo-element. The route still supports touch `pan-y`, mouse wheel,
trackpad, keyboard, and programmatic scrolling.

## Component Boundaries

- `grid-navigation.ts` owns the key geometry and deterministic directional
  transitions.
- `NameEntryScreen.tsx` owns the draft, highlighted key, activation behavior,
  completion guard, and control placement.
- `TowerScreen.tsx` retains floor rendering and logical order; no progression
  data API changes are required.
- `screens.css` owns the safe-area placement, action-column layout, fixed tower
  viewport, route overflow, touch action, and hidden scrollbar.

No new runtime service, persistence field, or public application route is
introduced.

## Verification

### Unit and component tests

- Assert the final name-key row is `Y`, `Z`, and four-column `DEL`, with no
  navigable `END` key.
- Assert directional movement reaches the enlarged `DEL` deterministically and
  never returns `END`.
- Assert direct tapping still enters letters.
- Assert direction buttons plus `선택` enter the highlighted key and can invoke
  `DEL`.
- Assert `END` remains disabled before three letters and completes exactly once
  after three letters.
- Assert `BACK` remains independently operable and button-focused Enter does
  not also activate a name key.
- Assert tower nodes remain DOM-ordered `1` through `5`.

### Browser layout test

At the supported narrow mobile viewport, verify with real layout metrics that:

- floor 1 is the first visible floor on tower entry;
- the tower route has `overflow-y: auto` and more scroll height than client
  height;
- scrolling the route reveals later floors;
- the app shell itself does not change scroll position;
- the computed scrollbar remains hidden while route scrolling still works.

### Release regression

Run focused Vitest coverage, the existing full suite, typecheck, Android
contract tests, the signed APK verifier, AIT package verification, and the API
36 emulator smoke journey. The emulator evidence must still reach title,
initials entry, character selection, floor 1, and battle without a fatal
application log.

## Acceptance Criteria

- A touch-only player can enter three initials using either direct key taps or
  direction buttons followed by `선택`.
- `BACK` is visibly placed in the upper-left of the initials screen.
- `DEL` occupies the old combined `DEL` and `END` width.
- `END` appears immediately below `선택` and is enabled only for three letters.
- Entering the tower shows floor 1 before floors 2 through 5.
- Only the floor route scrolls; the tower header and controls remain fixed.
- No visible scrollbar appears on the tower route.
- Existing progression, resume, Android back, and store-package behavior remain
  unchanged.
