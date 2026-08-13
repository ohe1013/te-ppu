# Battle Abandon and Title Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return a live battle to the tower while preserving earlier opponents and confirmed score, restart the same opponent from a fresh board, and move full app shutdown to the title screen.

**Architecture:** `ScoreRunController` owns an opponent-scoped score transaction, while `TowerController` owns a detached suspended-battle target. `AppRoot` coordinates both controllers and pure route events; match UI only requests battle abandon, and title UI alone owns the native app-close confirmation.

**Tech Stack:** React 19, TypeScript 7, Vitest 4, Testing Library, Playwright 1.62, Vite 8, Apps-in-Toss Web Framework 2.10.8.

## Global Constraints

- All three opponents are still required to clear a floor, but they do not need to be played in one uninterrupted sitting.
- Preserve prior-opponent victories and score confirmed before the current opponent began.
- Discard the live board, AI state, item/timer state, random-stream position, and score earned during the abandoned opponent.
- Restart the suspended opponent with a new seed; never serialize or restore a live match.
- Battle abandon is not a loss, does not end the score run, does not save progress, and never calls `platform.close()`.
- Only the title-screen `게임 종료` action calls `platform.close()` through the existing 400 ms timeout and retry behavior.
- Active score runs remain session-only and are not persisted across full app process termination.
- Preserve the unrelated untracked `tmp/` directory.

---

### Task 1: Add an opponent-scoped score transaction

**Files:**
- Modify: `src/scoring/score-run-controller.ts`
- Test: `src/scoring/score-run-controller.test.ts`
- Modify: `src/app/AppRoot.tsx`

**Interfaces:**
- Consumes: existing `ScoreRunController.start()`, `recordEvents()`, and `completeMatch()`.
- Produces: `beginMatch(): void` and `abandonMatch(): void`; `recordEvents()` and `completeMatch()` require an active match checkpoint.

- [ ] **Step 1: Write the failing score rollback test**

Add a helper that begins each existing completed match, then add a focused rollback test:

```ts
function complete(
  run: ScoreRunController,
  outcome: Parameters<ScoreRunController['completeMatch']>[0],
) {
  run.beginMatch();
  return run.completeMatch(outcome);
}

it('rolls back only the active opponent score and allows a fresh restart', () => {
  const run = ScoreRunController.start('easy');
  run.beginMatch();
  run.recordEvents([{ type: 'lines-cleared', side: 'player', amount: 1 }]);
  run.completeMatch({
    floor: 1,
    encounterIndex: 0,
    isOwl: false,
    result: 'win',
    durationTicks: 300,
  });
  const confirmed = run.snapshot;

  run.beginMatch();
  run.recordEvents([{ type: 'lines-cleared', side: 'player', amount: 4 }]);
  expect(run.snapshot.score).toBeGreaterThan(confirmed.score);
  run.abandonMatch();

  expect(run.snapshot).toEqual(confirmed);
  run.beginMatch();
  expect(run.snapshot).toEqual(confirmed);
});
```

Update every existing direct `recordEvents()` or `completeMatch()` test call to start a match first. Add assertions that duplicate `beginMatch()`, `recordEvents()` without a checkpoint, `completeMatch()` without a checkpoint, and `abandonMatch()` without a checkpoint throw `RangeError`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- src/scoring/score-run-controller.test.ts
```

Expected: FAIL because `beginMatch` and `abandonMatch` do not exist.

- [ ] **Step 3: Implement the private checkpoint**

Add a nullable private score checkpoint and exact lifecycle methods:

```ts
readonly #state: MutableScoreRunState;
#matchScoreCheckpoint: number | null = null;

beginMatch(): void {
  this.#assertActive();
  if (this.#matchScoreCheckpoint !== null) {
    throw new RangeError('A score-run match is already active.');
  }
  this.#matchScoreCheckpoint = this.#state.score;
}

abandonMatch(): void {
  this.#assertActiveMatch();
  this.#state.score = this.#matchScoreCheckpoint!;
  this.#matchScoreCheckpoint = null;
}

#assertActiveMatch(): void {
  this.#assertActive();
  if (this.#matchScoreCheckpoint === null) {
    throw new RangeError('No score-run match is active.');
  }
}
```

Call `#assertActiveMatch()` before `recordEvents()` and before outcome validation in `completeMatch()`. After a valid outcome is accepted, clear the checkpoint exactly once before returning a continued or ended resolution. An invalid out-of-order outcome must leave the checkpoint active so the caller may abandon it safely.

In `AppRoot`, call `scoreRun.beginMatch()` only after `TowerController.startFloor()`,
`startEncounter()`, or `startOwlMatch()` succeeds and before dispatching the
matching route. This updates the existing production consumer in the same task
as the new required controller contract, so the repository never has a commit
where normal match scoring throws solely because the caller was not migrated.

- [ ] **Step 4: Run the score tests and verify GREEN**

Run:

```powershell
npm test -- src/scoring/score-run-controller.test.ts src/scoring/score-rules.test.ts
```

Expected: both files PASS with no warnings.

- [ ] **Step 5: Commit the score transaction**

```powershell
git add -- src/scoring/score-run-controller.ts src/scoring/score-run-controller.test.ts src/app/AppRoot.tsx
git commit -m "feat: checkpoint score per battle"
```

---

### Task 2: Preserve and resume the suspended battle target

**Files:**
- Modify: `src/app/towerController.ts`
- Modify: `src/app/app-route.ts`
- Test: `tests/app/towerController.test.ts`
- Test: `src/app/app-route.test.ts`

**Interfaces:**
- Consumes: `FloorSeriesState`, `TowerController.currentSeries`, and existing `return-to-tower` routing.
- Produces: exported `SuspendedBattle`, `TowerController.suspendedBattle`, `TowerController.abandonMatch(): SuspendedBattle | null`, `resume-floor`, and `resume-owl` route events.

- [ ] **Step 1: Write failing controller and reducer tests**

Add floor-series coverage after the first opponent has been completed and the second has started:

```ts
it('suspends the current opponent at the tower without saving', async () => {
  const repository = new RecordingRepository();
  const controller = new TowerController(DEFAULT_PROGRESS, repository);
  controller.startFloor(1, 10);
  await controller.completeEncounter('WIN');
  controller.startEncounter(11);

  expect(controller.abandonMatch()).toEqual({
    kind: 'floor',
    series: { floor: 1, encounterIndex: 1, wins: 1 },
  });
  expect(controller.route).toBe('TOWER');
  expect(controller.suspendedBattle).toEqual({
    kind: 'floor',
    series: { floor: 1, encounterIndex: 1, wins: 1 },
  });
  expect(controller.match).toBeNull();
  expect(controller.ai).toBeNull();
  expect(repository.saved).toEqual([]);
});
```

Add equivalent owl coverage and detached-snapshot coverage. Add reducer tests:

```ts
expect(reduceRoute(
  { name: 'match', floor: 2, encounterIndex: 1, wins: 1, seed: 7 },
  { type: 'return-to-tower' },
)).toEqual({ name: 'tower' });

expect(reduceRoute(
  { name: 'tower' },
  { type: 'resume-floor', series: { floor: 2, encounterIndex: 1, wins: 1 } },
)).toEqual({ name: 'floor-intro', floor: 2, encounterIndex: 1, wins: 1 });

expect(reduceRoute(
  { name: 'tower' },
  { type: 'resume-owl' },
)).toEqual({ name: 'owl-reveal' });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/app/towerController.test.ts src/app/app-route.test.ts
```

Expected: FAIL because suspension state and resume events are missing, and a live match still rejects `return-to-tower`.

- [ ] **Step 3: Implement suspended battle ownership**

Add the exported type and a detached getter:

```ts
export type SuspendedBattle =
  | { readonly kind: 'floor'; readonly series: FloorSeriesState }
  | { readonly kind: 'owl' };

private currentSuspendedBattle: SuspendedBattle | null = null;

get suspendedBattle(): SuspendedBattle | null {
  const suspended = this.currentSuspendedBattle;
  return suspended?.kind === 'floor'
    ? { kind: 'floor', series: { ...suspended.series } }
    : suspended;
}
```

Make `abandonMatch()` return `null` unless a live floor or owl match with AI exists. For a valid floor match, capture a cloned current series; for an owl match, capture `{ kind: 'owl' }`. Clear match/AI, set `currentRoute = 'TOWER'`, and store the target without saving. Clear the suspended target when a new floor series starts, when the suspended floor encounter restarts, when the owl restarts, when difficulty/profile state resets the run, and when the battle completes.

Allow `startOwlMatch()` when the suspended target is owl even though the controller route is `TOWER`; consume the target only after match creation succeeds.

- [ ] **Step 4: Implement pure resume routes**

Extend `AppRouteEvent` exactly as follows:

```ts
| { type: 'resume-floor'; series: FloorSeriesState }
| { type: 'resume-owl' }
```

From `match` and `owl-match`, accept only `return-to-tower`. From `tower`, translate `resume-floor` to the exact `floor-intro` fields and `resume-owl` to `owl-reveal`. Extend the invalid-event table so every new event remains referentially stable on unsupported routes.

- [ ] **Step 5: Run domain tests and verify GREEN**

Run:

```powershell
npm test -- tests/app/towerController.test.ts src/app/app-route.test.ts src/progression/series.test.ts
```

Expected: all selected files PASS.

- [ ] **Step 6: Commit suspended-series routing**

```powershell
git add -- src/app/towerController.ts tests/app/towerController.test.ts src/app/app-route.ts src/app/app-route.test.ts
git commit -m "feat: suspend battles at the tower"
```

---

### Task 3: Wire battle abandon through AppRoot and the tower UI

**Files:**
- Create: `src/ui/match/BattleAbandonConfirmation.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `src/ui/match/match-layout.css`

**Interfaces:**
- Consumes: Task 1 `beginMatch()/abandonMatch()`, Task 2 `SuspendedBattle` and resume route events.
- Produces: required `MatchRouteViewProps.onAbandon: () => void`, required `MatchScreenProps.onAbandon: () => void`, and `TowerContinuation` presentation data.

- [ ] **Step 1: Write the failing AppRoot resume integration test**

Expose `onAbandon` in `TestMatch` with an `타워로 나가기` test button. Add a floor-2-opponent-2 scenario that emits score events before and during the suspended opponent:

```ts
await advanceRunToFloor(user, 2);
await enterMatch(user, 2, 0);
await user.click(screen.getByRole('button', { name: 'emit score events' }));
await finishWin(user);
await continueToNextEncounter(user);
const confirmedScore = screen.getByTestId('run-score').textContent;
await user.click(screen.getByRole('button', { name: 'emit score events' }));
expect(screen.getByTestId('run-score')).not.toHaveTextContent(confirmedScore ?? '');

await user.click(screen.getByRole('button', { name: '타워로 나가기' }));

expect(await screen.findByTestId('tower-screen')).toBeVisible();
expect(screen.getByTestId('tower-run-status')).toHaveTextContent('2층 2번째 상대');
expect(screen.getByTestId('tower-run-status')).toHaveTextContent(confirmedScore ?? '');
await user.click(screen.getByRole('button', { name: '2층 2번째 상대부터 계속' }));
expect(await screen.findByTestId('floor-intro-screen')).toBeVisible();
expect(screen.getByText('유리 예언자 프리즘')).toBeVisible();
await user.click(screen.getByRole('button', { name: '대전 시작' }));
expect(screen.getByTestId('match-encounter')).toHaveTextContent('1:1');
```

Also assert that tower -> `처음으로` -> `도전 계속` retains the same continuation and that a retained stale match callback cannot add score or finish after abandon.

- [ ] **Step 2: Write the failing match confirmation test**

Change the lifecycle test to provide `onAbandon={vi.fn()}` and assert:

```ts
fireEvent.click(screen.getByRole('button', { name: '타워로 나가기' }));
expect(loop.setPaused).toHaveBeenCalledWith('exit-confirmation', true);
expect(screen.getByText('이번 상대와 싸우며 얻은 점수와 전투 진행은 사라집니다.'))
  .toBeVisible();
fireEvent.click(screen.getByRole('button', { name: '타워로 나가기 확인' }));
expect(onAbandon).toHaveBeenCalledOnce();
expect(platform.close).not.toHaveBeenCalled();
```

Expected component copy uses `타워로 나가기 확인` as the accessible confirmation name even though the visible action text may remain `타워로 나가기`.

- [ ] **Step 3: Run integration/UI tests and verify RED**

Run:

```powershell
npm test -- src/app/AppRoot.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/TowerScreen.test.tsx
```

Expected: FAIL because `onAbandon`, battle-specific copy, score rollback orchestration, and continuation UI are not wired.

- [ ] **Step 4: Implement the synchronous battle confirmation**

Create `BattleAbandonConfirmation` with required props:

```ts
export interface BattleAbandonConfirmationProps {
  readonly icon?: LoadedImageRef;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
}
```

Reuse the existing modal host/classes and focus behavior, but do not import `closeWithTimeout`. Use the approved Korean title, warning, cancel label, and confirm accessible name. Escape cancels; Tab/Shift+Tab stay trapped; confirmation invokes `onConfirm` once synchronously.

Replace `MatchScreen`'s current `ExitConfirmation` with this component, rename the header action to `타워로 나가기`, and invoke the required `onAbandon` prop. Keep pause and input-reset behavior unchanged.

- [ ] **Step 5: Coordinate the transactional abandon in AppRoot**

The successful start paths already call `scoreRun.beginMatch()` from Task 1.
Pass `onAbandon` to both floor and owl render paths.

Add one synchronous coordinator that validates the current identity and route, then performs this order without awaits:

```ts
function abandonMatch(identity: RankedMatchIdentity): void {
  if (controller === null || !isCurrentMatch(identity) || completionPendingRef.current) return;
  matchIdentityRef.current = null;
  identity.scoreRun.abandonMatch();
  const suspended = controller.abandonMatch();
  if (suspended === null) return;
  refreshControllerView();
  dispatchRoute({ type: 'return-to-tower' });
}
```

Keep stale `onFinished` and `onScoreEvents` closures harmless through `isCurrentMatch()`.

When selecting the active tower floor, inspect `controller.suspendedBattle`: dispatch `resume-floor` with its detached series, dispatch `resume-owl` for the owl target, or use the existing `select-floor` event when no target exists.

- [ ] **Step 6: Present the continuation on the tower**

Export a UI-only type:

```ts
export type TowerContinuation =
  | { readonly kind: 'floor'; readonly floor: Floor; readonly encounterIndex: EncounterIndex }
  | { readonly kind: 'owl' }
  | null;
```

Add `continuation: TowerContinuation` to `TowerScreenProps`. For a floor continuation, render `도전 중 · 2층 2번째 상대 · 점수 001450`, set `CharacterStrip.activeIndex` to the retained index, and label the enabled card `2층 2번째 상대부터 계속`. For owl, render `도전 중 · 최종전 계속` and label the floor-5 action `최종전 계속`. Preserve current labels when continuation is null.

- [ ] **Step 7: Run the focused integration/UI tests and verify GREEN**

Run:

```powershell
npm test -- src/app/AppRoot.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/TowerScreen.test.tsx
```

Expected: all selected files PASS; match confirmation never increments a platform close spy.

- [ ] **Step 8: Commit the battle-to-tower flow**

```powershell
git add -- src/ui/match/BattleAbandonConfirmation.tsx src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/match/match-layout.css
git commit -m "feat: return suspended battles to tower"
```

---

### Task 4: Move native app shutdown to the title

**Files:**
- Rename: `src/ui/match/ExitConfirmation.tsx` -> `src/ui/match/AppExitConfirmation.tsx`
- Modify: `src/ui/screens/TitleScreen.tsx`
- Modify: `src/ui/screens/TitleScreen.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- Consumes: existing `closeWithTimeout()` and `PlatformPort.close()`.
- Produces: `TitleScreenProps.onExit: () => Promise<void>` and title-owned app-exit dialog state.

- [ ] **Step 1: Write the failing title shutdown tests**

Update existing title fixtures with `onExit`. Change the action-count assertion from three to four and add:

```ts
it('confirms app shutdown only from the title and warns about an active run', async () => {
  const user = userEvent.setup();
  const onExit = vi.fn(async () => undefined);
  render(
    <TitleScreen
      commonAssets={null}
      notice={null}
      onChangePlayer={vi.fn()}
      onExit={onExit}
      onOpenRanking={vi.fn()}
      onStartRun={vi.fn()}
      progress={DEFAULT_PROGRESS}
      runActive
    />,
  );

  await user.click(screen.getByRole('button', { name: '게임 종료' }));
  expect(screen.getByText('앱을 다시 열면 현재 도전은 이어지지 않습니다.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '계속하기' }));
  expect(onExit).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '게임 종료' }));
  await user.click(screen.getByRole('button', { name: '게임 종료 확인' }));
  expect(onExit).toHaveBeenCalledOnce();
});
```

Retain the current hanging-close fake-timer test under the renamed component and update expected copy to `게임 종료 확인`.

- [ ] **Step 2: Run title and lifecycle tests and verify RED**

Run:

```powershell
npm test -- src/ui/screens/TitleScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx src/app/AppRoot.test.tsx
```

Expected: FAIL because the title has no exit action or callback.

- [ ] **Step 3: Rename and retarget the native-close dialog**

Rename the component and exports to `AppExitConfirmation`. Keep duplicate suppression, focus trapping, 400 ms timeout, failure retry, and closing status. Change hard-coded copy to:

```text
게임을 종료할까요?
게임 종료 확인
게임을 종료하지 못했습니다. 다시 시도해 주세요.
게임을 종료하는 중입니다.
```

Accept `description: string` so `TitleScreen` can distinguish active and inactive runs.

- [ ] **Step 4: Add the title action and AppRoot wiring**

Add required `onExit` to `TitleScreenProps`, local dialog visibility state, a secondary `게임 종료` menu button, and `AppExitConfirmation`. Pass `runActive ? '앱을 다시 열면 현재 도전은 이어지지 않습니다.' : '게임 화면을 닫습니다.'` as description.

In `AppRoot`, pass a stable callback that returns `services.platform.close()`. Do not clear `scoreRunRef`, controller progress, or route before calling the platform.

- [ ] **Step 5: Run title/native-close tests and verify GREEN**

Run:

```powershell
npm test -- src/ui/screens/TitleScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx src/app/AppRoot.test.tsx src/platform/close-with-timeout.test.ts
```

Expected: all selected files PASS, including retry at exactly 400 ms.

- [ ] **Step 6: Commit title-only app shutdown**

```powershell
git add -- src/ui/match/ExitConfirmation.tsx src/ui/match/AppExitConfirmation.tsx src/ui/screens/TitleScreen.tsx src/ui/screens/TitleScreen.test.tsx src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/screens.css
git commit -m "feat: move app shutdown to title"
```

---

### Task 5: Update end-to-end coverage and run delivery gates

**Files:**
- Modify: `tests/e2e/lifecycle-controls.spec.ts`
- Modify: `tests/e2e/app-flow.spec.ts` if title/tower selectors need shared coverage
- Modify: `docs/qa/apps-in-toss-private-qr.md`

**Interfaces:**
- Consumes: final player-visible labels, E2E `closeCount`, `setCloseMode()`, and the existing private-QR evidence table.
- Produces: regression coverage for immediate tower return and title-only native close.

- [ ] **Step 1: Replace the obsolete match-close E2E assertion**

Change the lifecycle scenario to assert that cancel stays in the match, confirm reaches the tower, and `closeCount` remains zero:

```ts
await page.getByRole('button', { name: '타워로 나가기' }).click();
await page.getByRole('button', { name: '타워로 나가기 확인' }).click();
await expect(page.getByTestId('tower-screen')).toBeVisible();
expect(await page.evaluate(() => window.__TE_PPU_E2E__.closeCount)).toBe(0);
```

Add an integrated opponent-2 resume case using the existing E2E finish binding or the AppRoot integration fixture. It must observe the tower continuation label and the same opponent after a fresh start.

- [ ] **Step 2: Move close timeout E2E coverage to the title**

From the initial title, set close mode to `hang`, open `게임 종료`, confirm `게임 종료 확인`, and retain the existing `<800 ms` failure assertion. Set close mode back to `resolve`, retry, and assert exactly two close requests.

- [ ] **Step 3: Run both portrait E2E projects**

Run:

```powershell
npm run test:e2e
```

Expected: all tests PASS in `portrait-360x640` and `portrait-430x932`; overlays remain viewport-centered and no match abandon invokes native close.

- [ ] **Step 4: Update the QR checklist**

In `docs/qa/apps-in-toss-private-qr.md`, split the existing exit row into two observable checks:

1. Match `타워로 나가기` returns immediately to the tower and restarts the retained opponent.
2. Title `게임 종료` confirms and dismisses the Apps-in-Toss view through native `closeView()`.

Keep native dismissal marked `PENDING_EXTERNAL` until a real-device/private-QR video is attached.

- [ ] **Step 5: Run the full automated verification set**

Run each command separately and record exact results:

```powershell
npm run typecheck
npm test
npm run check:assets
npm run check:source-policy
npm run build:web
npm run test:e2e
npm run build:ait
npm run test:delivery-gates
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Expected: every local command exits 0 and explicit artifact verification prints `AIT_OK`. Do not report actual native dismissal as verified without private-QR device evidence.

- [ ] **Step 6: Review the final diff and commit E2E/QA changes**

```powershell
git diff --check
git status --short
git add -- tests/e2e/lifecycle-controls.spec.ts tests/e2e/app-flow.spec.ts docs/qa/apps-in-toss-private-qr.md
git commit -m "test: cover resumable battle exits"
```

Only add `tests/e2e/app-flow.spec.ts` if it actually changed. Preserve `tmp/` and any other unrelated user files.
