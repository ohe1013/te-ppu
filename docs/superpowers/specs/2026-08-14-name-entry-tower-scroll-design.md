# Name Entry Controls and Tower Scroll Design

## Context

The touch flow covers three related requirements and follow-up defects.

1. The initials screen lets the player move a highlighted letter with the
   direction pad, but it has no visible action button that activates the
   highlighted key. The bottom controls contain only the direction pad and
   `BACK`, while `END` consumes space inside the letter grid.
2. The upper-left initials `BACK` control is visually present, but the header
   paints over its hit area at the same stacking level. A real coordinate tap
   resolves to the `HEADER` element and leaves the player on name entry.
3. The tower is a climb: floor 1 belongs at the bottom and floor 5 at the top.
   The first scroll implementation incorrectly changed the visual order to
   `1, 2, 3, 4, 5` from top to bottom instead of preserving the climb and
   positioning the viewport at the player's current floor.

The corrected change preserves the bottom-to-top tower, gives `BACK` a reliable
touch target, and makes the tower viewport open at the active progression point.

## Goals

- Keep direct letter tapping and add a complete direction-pad interaction path.
- Put `BACK` in the upper-left safe area of the initials screen.
- Ensure a physical touch on `BACK` reaches the button and returns to title.
- Give `DEL` the space currently shared by `DEL` and `END`.
- Put a visible `선택` action beside the direction pad and `END` directly below
  that action.
- Preserve floor 1 at the bottom and floor 5 at the top.
- Open the tower with the current progression floor visible near the bottom of
  the route, leaving upcoming floors visible above it.
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
vertical space on the 360x640 viewport. Because the header still spans the
screen width, `BACK` owns a higher stacking level than the header; transparent
header space must never intercept its touch target.

The lower control area uses two columns:

- the existing direction pad on the left;
- an action column on the right with the large `선택` button above `END`.

The action buttons use the existing arcade button styles and minimum touch
targets. Focus-visible outlines, pressed-key indication, Korean accessible
direction labels, and the `END` disabled state remain visible.

## Tower Design

### Order and initial position

The floor elements retain logical DOM order `1, 2, 3, 4, 5` for progression and
assistive-technology reading. The content wrapper uses a reversed visual column,
so the physical top-to-bottom order is `5, 4, 3, 2, 1`. Floor 1 therefore stays
at the foot of the tower and advancement moves upward.

`TowerScreen` derives one viewport target whenever it mounts or the active
target changes:

1. a suspended floor encounter uses that continuation floor;
2. a suspended owl encounter uses floor 5;
3. otherwise the active score run's `requiredFloor` is used.

After layout, the route sets only its own `scrollTop` so the target floor's
bottom edge sits near the route's bottom edge, clamped to the route's scroll
range. A new run therefore opens at floor 1, while a resumed floor-2 run opens
at floor 2. Upcoming floors remain above the current point. The effect does not
continuously fight manual scrolling; it runs only when the screen mounts or the
derived target changes.

The shaft and alternating left/right cards remain unchanged. Viewport placement
does not change which floor is unlocked or selected.

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
- `TowerScreen.tsx` retains floor rendering and logical order, derives the
  viewport target from existing continuation and `requiredFloor` props, and
  owns the one-time route alignment. No progression data API changes are
  required.
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

At the supported narrow mobile viewport, verify with real layout and touch
metrics that:

- the center of `BACK` resolves to the button, and a touch returns to title;
- tower nodes are physically ordered `5, 4, 3, 2, 1` from top to bottom;
- a new run opens with floor 1 visible at the lower end of the tower route;
- after floor 1 is cleared, returning to or resuming the tower opens with floor
  2 visible at the lower end;
- the tower route has `overflow-y: auto` and more scroll height than client
  height;
- scrolling the route can reveal every earlier or later tower section;
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
- `BACK` is visibly placed in the upper-left of the initials screen and a real
  touch returns to title.
- `DEL` occupies the old combined `DEL` and `END` width.
- `END` appears immediately below `선택` and is enabled only for three letters.
- The tower remains a bottom-to-top climb with floor 1 physically below floor 5.
- Entering or resuming the tower positions its internal viewport at the current
  progression floor.
- Only the floor route scrolls; the tower header and controls remain fixed.
- No visible scrollbar appears on the tower route.
- Existing progression, resume, Android back, and store-package behavior remain
  unchanged.
