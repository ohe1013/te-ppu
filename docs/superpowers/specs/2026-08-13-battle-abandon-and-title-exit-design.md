# Battle abandon and title exit design

## Status

Approved product design. The player may leave a live battle for the tower
without discarding victories from earlier opponents in the same floor series.
The current opponent restarts from a fresh board when the player returns. App
shutdown is a separate title-screen action.

## Confirmed problem

The match header currently labels its action `게임 나가기`, but confirmation
calls `platform.close()`. That closes the Apps-in-Toss view instead of leaving
the battle route. The route reducer does not accept `return-to-tower` from a
live match, and the existing `TowerController.abandonMatch()` is not connected
to the UI. The same dialog therefore combines two different intentions:
abandoning a battle and shutting down the app.

## Goals

1. Make the match action mean only `현재 전투 포기 -> 타워 복귀`.
2. Preserve opponents already defeated in the current floor's three-opponent
   series and preserve score confirmed before the current opponent began.
3. Discard the current opponent's board, AI state, and unconfirmed score.
4. Resume at the same opponent with a new board and seed when the player selects
   the active floor again.
5. Put the full app shutdown action on the title screen and keep native
   `closeView()` handling out of the battle-abandon path.

## Non-goals

- Do not remove the requirement to defeat all three opponents to clear a floor.
- Do not require the three opponents to be played in one uninterrupted sitting.
- Do not serialize or restore a live board, falling pair, AI plan, item state,
  timers, or random-stream position.
- Do not treat battle abandon as a loss and do not end the active score run.
- Do not persist an active score run across full app process termination.
- Do not change match rules, opponent order, score values, unlock rules, or
  leaderboard publication.
- Do not add another in-app shutdown action to the tower or match screen. The
  Apps-in-Toss native game close control remains available independently.

## Considered approaches

### 1. Encounter checkpoint and suspended-series resume — selected

Capture the score at the start of each opponent. On abandon, restore that score,
clear only the live match and AI, retain the floor series' `encounterIndex` and
`wins`, and route to the tower. Selecting the active floor reconstructs the
current opponent from a new seed.

This directly implements the approved behavior, prevents score farming, and
does not require board serialization.

### 2. Resolve abandon as a normal loss — rejected

This could reuse the existing match-completion path, but a loss ends the score
run and discards earlier wins in the series. It contradicts the approved resume
behavior.

### 3. Persist and restore the entire match — rejected

This would resume the exact board position, but it requires versioned snapshots
for core state, AI state, timers, inputs, item selection, and random streams.
The player explicitly selected a fresh restart of the current opponent.

## Player experience

### Leaving a battle

The match-header action is labelled `타워로 나가기`. It opens a centered,
focus-trapped confirmation dialog with the following copy:

- Title: `현재 전투를 포기할까요?`
- Description: `타워로 돌아갑니다. 이번 상대와 싸우며 얻은 점수와 전투 진행은 사라집니다.`
- Cancel: `계속하기`
- Confirm: `타워로 나가기`

Opening the dialog pauses both sides and resets held input. Cancel closes the
dialog and releases only the confirmation pause. Confirm performs a synchronous
in-app state transition; it does not show a native-close spinner, wait for a
save, call `closeWithTimeout()`, or call `platform.close()`.

For example, abandoning floor 2 opponent 2 returns to the tower with opponent 1
still defeated and with the score that existed immediately before opponent 2
started. The tower identifies floor 2 opponent 2 as the continuation point.
Selecting floor 2 opens that opponent's intro and starts a fresh match.

The hidden owl battle follows the same restart rule. Abandoning it returns to
the tower, where the active run is shown as waiting for the final battle;
selecting the active final-floor action returns to the owl reveal and then starts
a fresh owl match.

### Shutting down the app

The title screen gains a secondary `게임 종료` action. It opens the native-close
confirmation previously owned by the match screen:

- Title: `게임을 종료할까요?`
- Description without an active run: `게임 화면을 닫습니다.`
- Description with an active run: `앱을 다시 열면 현재 도전은 이어지지 않습니다.`
- Cancel: `계속하기`
- Confirm: `게임 종료 확인`

Only this in-app title action calls `platform.close()` through the existing
400 ms bridge timeout and retry behavior. Apps-in-Toss builds call
`closeView()`. Browser and E2E platforms retain their existing developer-preview
contract and do not attempt to close the tab.

## State ownership and flow

### Score-run checkpoint

`ScoreRunController` owns a private current-match checkpoint. Starting a floor
or owl match records the score before any events from that opponent. Player
events continue to update the visible run score during play.

Completing the match commits the live score and clears the checkpoint before
the existing win/loss resolution advances or ends the run. Abandoning the match
restores the checkpoint and clears it. Duration remains unchanged because the
controller already records duration only on match completion.

The controller rejects starting a second match while a checkpoint is active,
completing without a live checkpoint, or abandoning without a live checkpoint.
This keeps duplicate and stale callbacks from mutating the run.

### Tower series suspension

For a floor match, `TowerController.abandonMatch()` clears `currentMatch` and
`currentAi`, changes its route to `TOWER`, and retains `currentSelectedFloor`
and `currentSeriesState`. No progress repository write occurs.

For the owl match, abandon clears live match and AI state but retains the
already-earned final-floor completion and an owl-resume target. The next owl
match is created from a new seed.

`AppRoot` owns the coordinated transition. It first invalidates the current
match identity, then rolls back the score checkpoint, abandons the matching
tower-controller battle, refreshes the controller view, and dispatches the
route back to the tower. A late score event or completion callback from the
unmounted match fails the existing identity check and is ignored.

### Route resume

The route reducer accepts `return-to-tower` from both `match` and `owl-match`.
When the active floor is selected from the tower, `AppRoot` reads the retained
floor series and dispatches a dedicated resume event containing its exact
`floor`, `encounterIndex`, and `wins`. That event opens `floor-intro` without
resetting the series to opponent 1. An owl-resume event opens `owl-reveal`.

The continuation target is held by the score-run and tower controllers rather
than only by the current React route, so visiting the title and choosing
`도전 계속` does not lose it.

## Component boundaries

- `MatchScreen` receives an `onAbandon` callback. It no longer maps its dialog
  confirmation to `PlatformPort.close()`.
- The current `ExitConfirmation` is split by intent. A synchronous battle
  confirmation owns battle copy and pause cancellation; an app-exit
  confirmation owns bridge pending, failure, retry, and success states.
- `TitleScreen` owns the visibility of its app-exit confirmation and receives
  the app-close callback from `AppRoot`.
- `TowerScreen` receives the suspended encounter or owl target needed to display
  `2번째 상대부터 계속` or `최종전 계속`, and highlights the corresponding rival
  instead of always highlighting the first one.

## Error and race handling

- Battle abandon has no network or persistence dependency and returns to the
  tower immediately.
- Duplicate battle confirmation clicks are ignored by the synchronous route
  transition and match-identity invalidation.
- If the match has already completed or its identity is stale, abandon performs
  no score rollback and no controller mutation.
- Native app close retains its existing 400 ms rejection/timeout retry state.
- A native-close failure never changes the score run, series, or route.

## Verification

Automated coverage must prove:

1. Route reduction returns from floor and owl matches to the tower and resumes
   the exact suspended target.
2. Score earned before the current opponent is retained, score earned during an
   abandoned opponent is rolled back, and restarting that opponent cannot farm
   the discarded score.
3. `TowerController` clears match/AI state without saving and retains floor,
   encounter index, and wins for opponents 1, 2, and 3.
4. Floor 2 opponent 2 can be abandoned, shown on the tower, and restarted from
   a fresh board while opponent 1 remains complete.
5. Owl abandon returns to the tower and restarts the owl battle from its reveal.
6. Match confirmation never calls `platform.close()`.
7. Title app-exit cancel makes no close request; confirm makes exactly one; a
   hanging bridge exposes retry within the existing timeout contract.
8. Both supported portrait projects keep the battle and title dialogs centered,
   keyboard-focus trapped, and fully usable.

After focused unit and integration tests, run typecheck, the full Vitest suite,
both Playwright portrait projects, asset validation, source-policy checks, the
web build, the AIT build, and explicit AIT artifact verification. Actual native
view dismissal remains a real-device/private-QR verification item.
