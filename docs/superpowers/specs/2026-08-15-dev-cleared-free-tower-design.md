# Development-Cleared Free Tower Design

## Goal

Make `npm run dev` a practical administrator test mode: every difficulty and tower floor remains visibly cleared and can be selected in any order. Keep the ranked floor-order rules, navigation rules, and persistence behavior unchanged everywhere else.

## User-visible behavior

- The existing `ADM` / `hero-engineer` cleared profile remains the administrator profile.
- Easy, Normal, and Hard remain unlocked, with Hard selected initially.
- Floors 1 through 5 and the owl remain marked cleared on every difficulty.
- The administrator tower does not replace cleared labels with `next floor` locks when a fresh test run starts.
- Every floor can be selected from the administrator tower regardless of the score run's current required floor.
- Selecting a floor starts a test run whose expected first encounter is that floor's first opponent. The normal three-opponent series and the floor-five owl transition remain unchanged after the match begins.
- Returning to the tower from a live match preserves the current opponent. Selecting the same continuation resumes that opponent from its score checkpoint; selecting a different floor discards only the in-memory administrator test run and starts from the newly selected floor.
- The tower shows an explicit `관리자 테스트 · 모든 층 선택 가능` status instead of implying that floors 2 through 5 are locked behind floor 1.
- Difficulty selection remains available from the administrator tower. Changing difficulty clears the in-memory test run and leaves free floor selection enabled.

## Scope boundary

This behavior is enabled only by the already-gated development-cleared mode. It must not be inferred from a progress record merely because that record has every floor cleared; a legitimate player who completed the game still follows the normal ranked-run order.

The following behavior remains unchanged:

- `npm run dev:clean`
- web production builds
- Android builds
- Apps-in-Toss builds
- E2E mode and explicit test service overrides
- floor-intro and device-back navigation rules
- progression schema and saved clear records
- the three-opponent series, owl battle, score calculation, and result screens

No production-visible administrator menu or unlock control is added.

## Architecture

The existing `isDevClearedProgressEnabled` result remains the single source of truth. `main.tsx` passes that explicit boolean both to service composition and to `AppRoot`; `AppRoot` defaults the capability to false for every existing caller and test.

`TowerScreen` receives a narrowly named administrator free-selection capability. When false, it keeps the current ranked-run lock calculation. When true, it:

- keeps every floor card enabled,
- keeps cleared styling and replay wording,
- leaves the difficulty selector enabled, and
- renders the administrator test status instead of the ordinary next-floor status.

The score-run model gains an explicit way to start at a selected floor. The existing production factory continues to start at floor 1, while the administrator path creates or replaces an in-memory score run whose `requiredFloor` matches the chosen floor. This keeps match completion assertions, encounter scoring, and the floor-five owl transition internally consistent instead of merely bypassing the tower button's disabled state.

When an administrator chooses a floor, `AppRoot` follows this order:

1. If the selected card represents the current suspended floor or owl battle, preserve the score run and resume it.
2. Otherwise, discard any different suspended in-memory battle without changing saved progress.
3. Start a new administrator score run at the selected floor.
4. Open the existing floor-intro route at opponent 1.

The existing floor-intro `대전 시작` action remains responsible for creating the actual match. Going back from the first intro returns to the freely selectable administrator tower; no general back-navigation behavior changes.

## State and persistence

Free selection is runtime-only. It adds no field to `ProgressState`, local storage, backups, score records, or leaderboard payloads.

The development-cleared profile continues to use its dedicated storage namespace. Real matches played in administrator mode may update that isolated development profile through the existing save path, but this design does not fabricate a score or alter normal browser data. Reloading still restores the isolated cleared profile, while the in-memory test run starts fresh.

## Error handling

- A floor selection that cannot create a matching score run must leave the user on the tower rather than opening an intro that cannot start.
- Switching away from a suspended administrator battle clears only that in-memory suspension; it must not remove historical floor or owl clears.
- Existing save failures continue through the current save-error and retry behavior.
- The dedicated Vite `MODE === 'dev-cleared'`, browser runtime, development build, and explicit flag checks remain mandatory before the capability can be true.

## Testing

Use test-driven development and prove each boundary with behavior-level tests:

1. `ScoreRunController` can start at an arbitrary valid floor, accepts that floor's encounter outcomes, and leaves the existing floor-one factory unchanged.
2. `TowerScreen` enables all five cleared floor cards and shows administrator wording only when the capability is true; normal active runs retain their current locks.
3. `AppRoot` can select and start floor 5 directly in administrator mode while the same progress in normal mode still starts a ranked run at floor 1.
4. Returning from a live administrator match preserves the same opponent continuation, while choosing another floor resets only the administrator run.
5. Administrator difficulty switching remains available and resets the in-memory test run consistently.
6. The real `npm run dev` browser test verifies that all difficulties and all floor cards are selectable. The `dev:clean` browser test continues to prove ordinary behavior.
7. Existing floor-intro and native-back tests remain unchanged and passing.

Before delivery, run focused tests, the development-mode Playwright suite, type checking, the full Vitest suite, the existing E2E suite on an available port, delivery gates, and all web/Android/AIT builds with explicit AIT verification.

## Delivery

Commit and push the change on `feat/pve-delivery`, updating the existing pull request. Preserve the linked delivery worktree, the user-owned `tmp/` directory, and any user-owned development server.
