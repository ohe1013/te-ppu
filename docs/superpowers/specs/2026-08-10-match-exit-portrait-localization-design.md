# Match exit, modal, portrait, navigation, and Korean UI design

## Status

Approved implementation specification. The user selected Rivet
(`hero-engineer`) as the visual reference for the selectable player roster.
The requested scope is a focused correction of the current delivery branch:
faster native exit handling, correctly centered match overlays, consistent
character art and portrait framing, a reversible tower entry, and Korean-first
player-facing copy.

## Confirmed problems and root causes

1. Match overlays are rendered as direct children of `.screen-shell`.
   `.screen-shell > :not(.screen-backdrop)` has greater specificity than
   `.modal-overlay`, so it changes the overlay from `position: fixed` to
   `position: relative`. The exit dialog and resume countdown therefore enter
   the match grid instead of covering the viewport.
2. `closeWithTimeout()` defers the native `closeView()` call through a promise
   microtask and waits 1,200 ms before reporting a bridge that never settles.
   The installed Apps-in-Toss implementation documents direct button-handler
   invocation, so the native request must be issued synchronously from the
   confirmation click.
3. Every HUD uses one generic portrait position, while several existing rival
   portrait files were derived from the center of full-body art. Dynamic poses
   such as the quartermaster place the face away from that geometric center,
   leaving the authored square portrait clipped before CSS renders it.
4. The route reducer already defines `return-to-title`, but the `tower` route
   does not accept it and `TowerScreen` exposes no corresponding control. After
   `START RUN` reaches the tower, the player therefore cannot return to the
   initial screen without reloading.
5. The title, tower, and match HUD expose avoidable English labels even though
   the surrounding story and controls are Korean.

## Goals

1. Invoke Apps-in-Toss close immediately from the user's confirmation and show
   a retry state quickly when the bridge does not settle.
2. Keep settings, exit confirmation, and resume countdown centered over the
   viewport at both supported portrait sizes.
3. Redraw Lumi and Sera in Rivet's bold cel-animation style while preserving
   their identities, colors, roles, and gameplay parity.
4. Reframe every playable and rival battle portrait around the face without
   changing existing rival full art.
5. Let the player return from the tower to the title and resume the same active
   score run without losing score or progression.
6. Make visible title, tower, and match copy Korean-first. Retain English only
   where it is part of the three-letter arcade initials or an internal ID.

## Non-goals

- Do not change board rules, AI strength, attack resolution, score formulas,
  floor order, encounter order, or Firestore leaderboard contracts.
- Do not change the equal performance of Rivet, Lumi, and Sera.
- Do not redraw existing rivals, the demon king, or the owl full art.
- Do not remove the exit confirmation or the three-second resume countdown.
- Do not add a new run-abandon flow, browser history router, or server feature.
- Do not copy third-party characters, artwork, or exact UI compositions.

## User experience

### Exit confirmation

The first `게임 나가기` press opens a centered confirmation dialog and pauses
the match. `계속하기` closes the dialog and releases only the
`exit-confirmation` pause reason.

Pressing `게임 나가기` inside the dialog calls `platform.close()` synchronously
in the same click call stack. The UI enters a short `closing` state and ignores
duplicate confirmation presses. A bridge rejection is shown immediately. A
bridge that remains pending for 400 ms changes to `failed` and exposes the same
confirmation button as a retry. Each retry makes exactly one new native close
request. A late completion from an expired attempt must not overwrite the
current attempt's state.

The browser and E2E platform continue to count a close request without trying
to close the developer's tab. Production Apps-in-Toss builds continue to call
the framework's `closeView()` once per confirmed attempt.

### Overlay placement

`AppRoot` owns one overlay host inside `#app-shell`, after the active screen and
inside `SafeAreaProvider`. `ModalOverlay` portals into that host when it exists
and falls back to inline rendering only for isolated component tests. This
keeps safe-area CSS variables available while removing overlays from the
`.screen-shell` grid and its child selector.

The overlay host does not create a visible box or intercept input by itself.
Each active overlay remains a fixed, full-viewport layer with safe-area
padding, a dim scrim, and a centered bounded surface. The exit and settings
dialogs retain focus trapping, Escape behavior, focus restoration, and
`aria-modal`. The countdown remains non-interactive and clears only when the
lifecycle coordinator publishes `null`.

### Tower back and active-run resume

The tower header gains a compact `처음으로` button. It dispatches the existing
`return-to-title` route event and does not mutate the score-run controller,
selected character, score, difficulty, or floor progress.

When an active score run exists, the title's primary action reads `도전 계속`
and dispatches `resume-run`, which returns directly to the tower without
starting a new score run or replaying name and character selection. When no run
is active, the action reads `도전 시작` and preserves the current onboarding
flow. Explicitly completing or replacing a run retains the existing score-run
rules; merely visiting the title never abandons a run.

### Korean-first copy

The following visible copy changes are required:

| Current copy | Korean-first copy |
| --- | --- |
| `START RUN` | `도전 시작` or `도전 계속` |
| `THE GEARLIGHT TOWER` | `기어라이트 타워` |
| `RUN ACTIVE` | `도전 중` |
| `NEXT 1F` | `다음 1층` |
| `SCORE` | `점수` |
| `EASY / NORMAL / HARD` | `쉬움 / 보통 / 어려움` |
| `HIDDEN BOSS` | `숨겨진 보스` |
| `READY / DANGER` | `준비 / 위험` |
| `NEXT` | `다음 블록` |
| `ROW / FREEZE / SWAP` | `행 제거 / 빙결 / 교체` |

Visible floor indicators use `층`, not `F`. Existing character names and story
copy remain Korean. Accessibility labels for these controls and states use the
same Korean terminology. A-Z on the three-letter initials keyboard remains
unchanged because it is an intentional arcade input mechanic. Tetromino kind
letters remain internal metadata and are not rendered as visible text.

## Character art direction

### Rivet reference

Rivet is the sole style reference for the selectable roster:

- thick dark-blue outer contours;
- clean cel-shaded color regions instead of soft rendered gradients;
- bright, saturated accent colors;
- compact classic TV-animation facial proportions;
- readable tool and costume silhouettes at mobile size;
- transparent background with no text, frame, logo, or scenery.

Lumi keeps blue-and-white courier clothing, cloud scarf, wing motif, satchel,
and friendly youthful identity. Sera keeps purple alchemist clothing, star
motifs, potion equipment, and confident identity. Their silhouettes and
palettes remain recognizable, but their line weight, rendering, face language,
and material treatment must match Rivet rather than the current soft anime
rendering.

Each character keeps one transparent full-body master and the six existing
portrait states: `idle`, `focus`, `attack`, `hit`, `win`, and `loss`. Portrait
state effects may remain deterministic overlays, but the base face framing and
art style must be consistent with the corresponding full-body master.

### Portrait framing

The asset generator gains an explicit per-character portrait framing table.
Each entry defines a normalized face center and square crop scale relative to
the nontransparent full-art bounds. Every playable character, owl, lieutenant,
and demon-king ID in the manifest must have a framing entry.

Generated portraits remain 256 by 256 pixels with an eight-pixel transparent
safe margin. The face and hair silhouette must remain inside that margin in the
idle state. Existing rival full art is unchanged; only portrait derivatives
are replaced. The HUD renders the square portrait directly, so a shared CSS
`object-position` is no longer responsible for correcting authored crops.

## State and component design

### Route events

The existing `AppRouteEvent` union gains
`{ readonly type: 'resume-run' }`. The existing `return-to-title` event is also
accepted from `tower`, in addition to its current presentation routes.
`resume-run` is accepted only from `title`; `AppRoot` exposes it only when
`scoreRunRef.current?.snapshot.phase === 'active'`. Invalid route-event
combinations remain referentially stable.

### Close contract

`closeWithTimeout()` keeps the public signature but changes two guarantees:

```ts
function closeWithTimeout(
  close: () => Promise<void>,
  timeoutMs?: number,
): Promise<void>;
```

- `close()` has been invoked before `closeWithTimeout()` returns;
- the default timeout is exactly 400 ms.

Synchronous throws, promise rejections, successful resolution, timeout, and a
later retry remain independently testable outcomes.

### Asset compatibility

Character IDs, manifest paths, schema version, portrait-state keys, and asset
manager interfaces remain unchanged. Replacing the WebP files therefore does
not change saved profiles or runtime loading. The source generator remains the
reproducible authority for derived portraits.

## Verification plan

Unit and component tests must establish the regression before implementation
and then verify:

- `closeWithTimeout()` invokes the close callback synchronously and times out
  at 400 ms;
- duplicate confirmation is ignored and retry performs exactly one new close;
- `ModalOverlay` uses the app overlay host when present;
- tower `return-to-title` and title `resume-run` preserve the active score-run
  snapshot;
- invalid route events remain stable;
- title, tower, difficulty, HUD state, next queue, score, and item labels render
  the approved Korean copy;
- the portrait framing table covers every manifest character and emits exact
  256-by-256 assets with the safe margin.

E2E tests run at 360x640 Chromium and 430x932 WebKit and verify:

- exit, settings, and countdown overlay bounds are centered in the viewport
  and do not consume a match-grid row;
- a hanging close request reaches retry state within the 400 ms contract;
- tower-to-title-to-tower navigation preserves the displayed score and next
  playable floor;
- no disallowed visible English labels remain on title, tower, or match;
- both HUD portraits remain visible and bounded after loading authored assets.

Visual verification includes contact sheets for Rivet, Lumi, Sera, and all
existing rival idle portraits. Review checks line style consistency for the
selectable roster and confirms that no face or hair silhouette is clipped.

After focused tests pass, run typecheck, the full Vitest suite, both Playwright
projects, Python asset-tool tests, asset validation, source-policy checks, web
and AIT builds, delivery gates, and explicit AIT package verification. Report
the dependency-audit release limitation separately; this UI correction does
not change that release decision.

## Rejected alternatives

- A CSS filter or outline pass over Lumi and Sera was rejected because it does
  not change their soft rendering, anatomy, or facial language enough to match
  Rivet.
- Replacing Lumi and Sera with existing tower rivals was rejected because it
  discards the approved three-player identities and their story roles.
- Fixing only `.screen-shell` selector specificity was rejected as the sole
  modal solution because future screen-level selectors could regress direct
  child overlays again; a dedicated host gives overlays explicit ownership.
- Shortening the timeout without invoking `closeView()` synchronously was
  rejected because it changes only the error timing, not the native request
  path.
