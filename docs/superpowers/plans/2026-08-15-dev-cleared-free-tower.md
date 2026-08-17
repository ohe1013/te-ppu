# Development-Cleared Free Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make only the dedicated npm run dev administrator mode freely select any difficulty and tower floor while preserving normal ranked order everywhere else.

**Architecture:** Keep isDevClearedProgressEnabled as the sole capability gate and pass its result explicitly into AppRoot and TowerScreen. Add a score-run factory whose initial required floor matches an administrator-selected floor, plus a narrow TowerController reset for replacing stale in-memory suspensions without touching saved progress. Normal callers retain floor-one score runs, locked tower ordering, and existing back behavior.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Vite modes, Playwright.

## Global Constraints

- The approved design is docs/superpowers/specs/2026-08-15-dev-cleared-free-tower-design.md.
- The capability is true only when the existing dedicated Vite gate accepts DEV, MODE === 'dev-cleared', browser runtime, and VITE_DEV_ALL_CLEARED === 'true'.
- npm run dev:clean, production web, Android, Apps-in-Toss, E2E wiring, progress schema, leaderboard payloads, and floor-intro/native-back behavior must remain unchanged.
- Do not infer administrator behavior from an all-cleared ProgressState; only the explicit runtime capability may enable it.
- Do not inspect, modify, stage, or delete the user-owned tmp/ directory.
- Do not stop or alter a user-owned development server. Use only confirmed-free verification ports.
- Use apply_patch for edits and stage explicit tracked paths only.
- Every production behavior change requires an observed failing test before implementation.

---

## File map

- src/scoring/score-run-controller.ts: arbitrary-floor administrator score-run construction.
- src/scoring/score-run-controller.test.ts: arbitrary-floor and floor-one contracts.
- src/app/towerController.ts: no-save reset of transient match, series, and suspension state.
- tests/app/towerController.test.ts: reset safety and no-save behavior.
- src/ui/screens/TowerScreen.tsx: administrator tower presentation and enablement.
- src/ui/screens/TowerScreen.test.tsx: administrator behavior and normal lock regression.
- src/app/AppRoot.tsx: capability composition, selection, continuation, and difficulty switching.
- src/app/AppRoot.test.tsx: administrator orchestration and normal-mode isolation.
- src/main.tsx: passes the already-gated capability into AppRoot.
- tests/dev-modes/dev-cleared.spec.ts: real administrator browser behavior.
- tests/dev-modes/dev-clean.spec.ts: ordinary browser-development boundary.

---

### Task 1: Start a score run at an administrator-selected floor

**Files:**
- Modify: src/scoring/score-run-controller.ts:32-52
- Test: src/scoring/score-run-controller.test.ts:8-50

**Interfaces:**
- Consumes: Difficulty and Floor.
- Produces: ScoreRunController.startAtFloor(difficulty: Difficulty, requiredFloor: Floor): ScoreRunController.
- Preserves: ScoreRunController.start(difficulty) always starts at floor 1.

- [ ] **Step 1: Write the failing arbitrary-floor test**

Add this case beside the current floor-order test:

~~~ts
it('starts an administrator run at the requested floor without changing normal starts', () => {
  const administrator = ScoreRunController.startAtFloor('hard', 5);

  expect(administrator.snapshot).toMatchObject({
    difficulty: 'hard',
    requiredFloor: 5,
    score: 0,
    encountersWon: 0,
    phase: 'active',
  });
  expect(administrator.canSelectFloor(5)).toBe(true);
  expect(administrator.canSelectFloor(1)).toBe(false);

  const resolution = complete(administrator, {
    floor: 5,
    encounterIndex: 0,
    isOwl: false,
    result: 'win',
    durationTicks: 120,
  });
  expect(resolution).toMatchObject({
    kind: 'continued',
    snapshot: { requiredFloor: 5, encountersWon: 1 },
  });
  expect(ScoreRunController.start('hard').snapshot.requiredFloor).toBe(1);
});
~~~

- [ ] **Step 2: Run the test and verify RED**

Run:

~~~powershell
npm test -- src/scoring/score-run-controller.test.ts
~~~

Expected: FAIL because startAtFloor does not exist.

- [ ] **Step 3: Implement the explicit factory**

Change the constructor and factories exactly along this boundary:

~~~ts
private constructor(difficulty: Difficulty, requiredFloor: Floor) {
  this.#state = {
    difficulty,
    score: 0,
    durationTicks: 0,
    requiredFloor,
    encounterIndex: 0,
    encountersWon: 0,
    owlDefeated: false,
    awaitingOwl: false,
    phase: 'active',
    reachedFloor: requiredFloor,
  };
}

static start(difficulty: Difficulty): ScoreRunController {
  return new ScoreRunController(difficulty, 1);
}

static startAtFloor(difficulty: Difficulty, requiredFloor: Floor): ScoreRunController {
  return new ScoreRunController(difficulty, requiredFloor);
}
~~~

- [ ] **Step 4: Verify GREEN**

~~~powershell
npm test -- src/scoring/score-run-controller.test.ts
npm run typecheck
~~~

Expected: all score-run tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

~~~powershell
git add -- src/scoring/score-run-controller.ts src/scoring/score-run-controller.test.ts
git commit -m "feat: start administrator runs at selected floors"
~~~

---

### Task 2: Reset transient tower battle state without saving

**Files:**
- Modify: src/app/towerController.ts:205-340
- Test: tests/app/towerController.test.ts:610-680

**Interfaces:**
- Produces: TowerController.resetBattleSession(): boolean.
- Contract: return false and change nothing during a live match; otherwise clear only selected floor, series, suspension, match helpers, and route. Never save or mutate ProgressState.

- [ ] **Step 1: Write failing reset tests**

~~~ts
it('resets a suspended battle in memory without changing or saving progress', async () => {
  const repository = new RecordingRepository();
  const controller = new TowerController(DEFAULT_PROGRESS, repository);
  controller.startFloor(1, 10);
  await controller.completeEncounter('WIN');
  controller.startEncounter(11);
  controller.abandonMatch();
  const progressBeforeReset = controller.progress;

  expect(controller.resetBattleSession()).toBe(true);
  expect(controller.route).toBe('TOWER');
  expect(controller.selectedFloor).toBeNull();
  expect(controller.currentSeries).toBeNull();
  expect(controller.suspendedBattle).toBeNull();
  expect(controller.progress).toEqual(progressBeforeReset);
  expect(repository.saved).toEqual([]);
});

it('refuses to reset transient state during a live match', () => {
  const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
  controller.startFloor(1, 10);

  expect(controller.resetBattleSession()).toBe(false);
  expect(controller.match).not.toBeNull();
  expect(controller.selectedFloor).toBe(1);
});
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm test -- tests/app/towerController.test.ts
~~~

Expected: FAIL because resetBattleSession does not exist.

- [ ] **Step 3: Implement the no-save reset**

Add near abandonMatch:

~~~ts
resetBattleSession(): boolean {
  if (this.currentMatch !== null || this.currentAi !== null) return false;
  this.currentSelectedFloor = null;
  this.currentSeriesState = null;
  this.currentSuspendedBattle = null;
  this.currentRoute = 'TOWER';
  return true;
}
~~~

Do not call persistCurrentProgress and do not alter currentProgress, pendingSave, save errors, profile, settings, or scores.

- [ ] **Step 4: Verify GREEN**

~~~powershell
npm test -- tests/app/towerController.test.ts
npm run typecheck
~~~

Expected: controller tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

~~~powershell
git add -- src/app/towerController.ts tests/app/towerController.test.ts
git commit -m "feat: reset transient administrator battles"
~~~

---

### Task 3: Render a freely selectable administrator tower

**Files:**
- Modify: src/ui/screens/TowerScreen.tsx:13-180
- Test: src/ui/screens/TowerScreen.test.tsx:170-240

**Interfaces:**
- Consumes: administratorFreeSelection?: boolean, default false.
- Produces: all enabled administrator difficulties and floors, cleared replay wording, and administrator status.
- Preserves: every normal TowerScreen branch when the prop is absent or false.

- [ ] **Step 1: Write the failing administrator presentation test**

Import createDevClearedProgress and add:

~~~tsx
it('keeps every cleared floor and difficulty selectable in administrator mode', () => {
  const cleared = createDevClearedProgress();

  render(
    <TowerScreen
      administratorFreeSelection
      continuation={null}
      difficultySelectionLocked
      notice={null}
      onSelectFloor={() => undefined}
      progress={cleared}
      requiredFloor={1}
      runActive
      runScore={0}
    />,
  );

  expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
    '관리자 테스트 · 모든 층 선택 가능',
  );
  for (const floor of [1, 2, 3, 4, 5]) {
    const button = screen.getByRole('button', { name: String(floor) + '층 선택' });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('클리어 완료 · 재도전 가능');
  }
  for (const difficulty of ['easy', 'normal', 'hard']) {
    expect(document.querySelector<HTMLButtonElement>(
      '.difficulty-selector__option[data-difficulty="' + difficulty + '"]',
    )).toBeEnabled();
  }
  expect(screen.queryByText(/진행 순서 잠김/)).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~powershell
npm test -- src/ui/screens/TowerScreen.test.tsx
~~~

Expected: FAIL because the prop does not exist and floors 2 through 5 remain disabled.

- [ ] **Step 3: Implement administrator-only presentation**

Add and default the prop:

~~~ts
readonly administratorFreeSelection?: boolean;
~~~

Derive administrator status:

~~~ts
const administratorRunStatus = continuation?.kind === 'floor'
  ? '관리자 테스트 · ' + continuation.floor + '층 '
    + (continuation.encounterIndex + 1) + '번째 상대 이어하기 · 모든 층 선택 가능'
  : continuation?.kind === 'owl'
    ? '관리자 테스트 · 최종전 이어하기 · 모든 층 선택 가능'
    : '관리자 테스트 · 모든 층 선택 가능';
~~~

When the capability is true, render that string in tower-run-status and calculate:

~~~ts
const unlocked = administratorFreeSelection
  || (historicallyUnlocked && (!runActive || floor === requiredFloor));
const status = administratorFreeSelection
  ? cleared ? '클리어 완료 · 재도전 가능' : '관리자 선택 가능'
  : runActive
    ? floor === requiredFloor ? '현재 도전 층' : '진행 순서 잠김 · 다음 ' + requiredFloor + '층'
    : cleared ? '클리어 완료 · 재도전 가능' : unlocked ? '도전 가능' : '잠김';
~~~

Ignore difficultySelectionLocked for button disabling and its notice only when administratorFreeSelection is true. Do not alter normal branches.

- [ ] **Step 4: Verify GREEN and the normal lock regression**

~~~powershell
npm test -- src/ui/screens/TowerScreen.test.tsx
~~~

Expected: the administrator case and existing active-run lock case both pass.

- [ ] **Step 5: Commit**

~~~powershell
git add -- src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx
git commit -m "feat: expose free administrator tower selection"
~~~

---

### Task 4: Compose administrator selection in AppRoot

**Files:**
- Modify: src/app/AppRoot.tsx:97-104, 211-220, 398-410, 590-610, 850-895
- Test: src/app/AppRoot.test.tsx:385-418, 1460-1640

**Interfaces:**
- Consumes: AppRootProps.devClearedMode?: boolean, ScoreRunController.startAtFloor, TowerController.resetBattleSession, TowerScreen.administratorFreeSelection.
- Produces: arbitrary floor replacement, same-continuation resume, and unrestricted administrator difficulty switching.
- Preserves: devClearedMode defaults false and every normal restriction.

- [ ] **Step 1: Extend the test renderer**

Add devClearedMode = false as the final renderGame parameter and pass it into AppRoot. Add this wrapper using the existing helper dependencies:

~~~ts
function renderAdministratorGame(repository: ProgressRepository) {
  return renderGame(
    repository,
    createTestPlatform(),
    createAssetManager(),
    createAudioPort(),
    () => '2026-08-10T12:34:56.000Z',
    () => undefined,
    createLocalLeaderboardRepository(),
    undefined,
    true,
  );
}
~~~

The AppRoot call inside renderGame receives devClearedMode={devClearedMode}; existing callers remain unchanged. Add the floor attribute to the test-only TestMatch section so the new tests do not depend on translated heading copy:

~~~tsx
<section
  data-encounter-kind={specialEncounter === undefined ? 'floor' : 'owl'}
  data-floor={floor}
  data-testid="match-screen"
>
~~~

Keep all existing TestMatch attributes between these shown attributes.

- [ ] **Step 2: Write failing AppRoot behavior tests**

Import createDevClearedProgress and add:

~~~tsx
it('starts any selected administrator floor with a matching score run', async () => {
  const user = userEvent.setup();
  renderAdministratorGame(new TestProgressRepository(createDevClearedProgress()));

  await enterTower(user);
  expect(screen.getByRole('button', { name: '5층 선택' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '5층 선택' }));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));

  expect(await screen.findByTestId('match-screen')).toHaveAttribute('data-floor', '5');
  expect(screen.getByTestId('match-encounter')).toHaveTextContent('0:0');
  expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
});
~~~

Add the different-floor replacement case:

~~~tsx
it('replaces a suspended administrator floor without changing saved clears', async () => {
  const user = userEvent.setup();
  const repository = new TestProgressRepository(createDevClearedProgress());
  renderAdministratorGame(repository);

  await enterTower(user);
  await user.click(screen.getByRole('button', { name: '2층 선택' }));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  await user.click(screen.getByRole('button', { name: '타워로 나가기' }));
  await screen.findByTestId('tower-screen');
  await user.click(screen.getByRole('button', { name: '4층 선택' }));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));

  expect(await screen.findByTestId('match-screen')).toHaveAttribute('data-floor', '4');
  expect(screen.getByTestId('match-encounter')).toHaveTextContent('0:0');
  expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
  await user.click(screen.getByRole('button', { name: '타워로 나가기' }));
  await screen.findByTestId('tower-screen');
  expect(screen.getAllByText('클리어 완료 · 재도전 가능')).toHaveLength(5);
  expect(repository.saves).toEqual([]);
});
~~~

Add the same-opponent continuation case:

~~~tsx
it('resumes the same suspended administrator opponent', async () => {
  const user = userEvent.setup();
  renderAdministratorGame(new TestProgressRepository(createDevClearedProgress()));

  await enterTower(user);
  await user.click(screen.getByRole('button', { name: '3층 선택' }));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  await user.click(screen.getByRole('button', { name: '타워로 나가기' }));
  await screen.findByTestId('tower-screen');
  await user.click(screen.getByRole('button', { name: /3층 1번째 상대부터 계속/ }));
  expect(await screen.findByTestId('floor-intro-screen')).toHaveAttribute(
    'data-encounter-index',
    '0',
  );
  await user.click(screen.getByRole('button', { name: '대전 시작' }));

  expect(await screen.findByTestId('match-screen')).toHaveAttribute('data-floor', '3');
  expect(screen.getByTestId('match-encounter')).toHaveTextContent('0:0');
});
~~~

Add the difficulty-reset case:

~~~tsx
it('switches administrator difficulty after progress and starts the next test at zero', async () => {
  const user = userEvent.setup();
  renderAdministratorGame(new TestProgressRepository(createDevClearedProgress()));

  await enterMatch(user, 2, 0);
  await finishWin(user);
  await user.click(within(screen.getByTestId('result-screen')).getByRole('button'));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  await user.click(screen.getByRole('button', { name: '타워로 나가기' }));
  await screen.findByTestId('tower-screen');
  await user.click(screen.getByRole('button', { name: '쉬움' }));

  expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
  for (const floor of [1, 2, 3, 4, 5]) {
    expect(screen.getByRole('button', { name: String(floor) + '층 선택' })).toBeEnabled();
  }
  await user.click(screen.getByRole('button', { name: '4층 선택' }));
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
});
~~~

- [ ] **Step 3: Run AppRoot tests and verify RED**

~~~powershell
npm test -- src/app/AppRoot.test.tsx
~~~

Expected: FAIL because AppRoot ignores the capability and high floors remain locked.

- [ ] **Step 4: Implement the capability**

Extend and default AppRootProps:

~~~ts
readonly devClearedMode?: boolean;

export function AppRoot({
  createMatchSeed = createDefaultMatchSeed,
  devClearedMode = false,
  nowIso = currentIso,
  renderMatch = (props) => <MatchScreen {...props} />,
  services,
}: AppRootProps) {
~~~

Add:

~~~ts
function startScoreRunAtFloor(floor: Floor): void {
  if (controller === null) return;
  matchIdentityRef.current = null;
  scoreRunRef.current = ScoreRunController.startAtFloor(
    controller.progress.selectedDifficulty,
    floor,
  );
  completionPendingRef.current = false;
  completionTokenRef.current += 1;
  setResultSavePending(false);
  setResultSaveFailed(false);
  refreshControllerView();
}
~~~

Keep the existing startScoreRun on ScoreRunController.start for ordinary title entry.

In selectDifficulty, reject a non-pristine run only when devClearedMode is false. After an accepted administrator difficulty change, reset the score run with ScoreRunController.start(difficulty).

Pass:

~~~tsx
administratorFreeSelection={devClearedMode}
difficultySelectionLocked={!devClearedMode
  && scoreRunSnapshot !== null
  && !isPristineRun(scoreRunSnapshot)}
~~~

Keep same-floor and owl continuation branches first. Replace only the non-continuation branch:

~~~ts
if (devClearedMode) {
  if (!controller.resetBattleSession()) return;
  startScoreRunAtFloor(floor);
}
dispatchRoute({ type: 'select-floor', floor });
~~~

- [ ] **Step 5: Verify GREEN and normal isolation**

~~~powershell
npm test -- src/app/AppRoot.test.tsx src/ui/screens/TowerScreen.test.tsx src/scoring/score-run-controller.test.ts tests/app/towerController.test.ts
npm run typecheck
~~~

Expected: administrator tests pass; existing historical-lock, difficulty-lock, suspended-opponent, floor-intro, and native-back tests remain green.

- [ ] **Step 6: Commit**

~~~powershell
git add -- src/app/AppRoot.tsx src/app/AppRoot.test.tsx
git commit -m "feat: compose administrator tower replay runs"
~~~

---

### Task 5: Wire and prove the real development modes

**Files:**
- Modify: src/main.tsx:15-45
- Modify: tests/dev-modes/dev-cleared.spec.ts:19-55
- Modify: tests/dev-modes/dev-clean.spec.ts:9-27

**Interfaces:**
- Consumes: the already-gated devClearedProgress boolean.
- Produces: AppRoot devClearedMode wiring and real browser boundary evidence.
- Preserves: explicit E2E service overrides and every non-dev-cleared mode.

- [ ] **Step 1: Strengthen browser behavior before wiring**

In dev-cleared.spec.ts, after entering the tower, keep the existing persistence checks and use:

~~~ts
for (const difficulty of ['easy', 'normal', 'hard']) {
  await page.locator(
    '.difficulty-selector__option[data-difficulty="' + difficulty + '"]',
  ).click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', difficulty);
  await expect(page.locator('.tower-node--cleared')).toHaveCount(5);
  for (const floor of [1, 2, 3, 4, 5]) {
    await expect(page.getByRole('button', { name: String(floor) + '층 선택' })).toBeEnabled();
  }
}
await expect(page.getByTestId('tower-run-status')).toContainText(
  '관리자 테스트 · 모든 층 선택 가능',
);
await page.getByRole('button', { name: '5층 선택' }).click();
await page.getByRole('button', { name: '대전 시작' }).click();
await expect(page.getByTestId('match-screen')).toHaveAttribute('data-floor', '5');
~~~

In dev-clean.spec.ts, after entering the tower add:

~~~ts
await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
await expect(page.getByRole('button', { name: '2층 선택' })).toBeDisabled();
await expect(page.getByTestId('tower-run-status')).not.toContainText('관리자 테스트');
~~~

- [ ] **Step 2: Run browser tests and verify RED**

Confirm ports 4175 and 4176 are free, then run:

~~~powershell
npm run test:dev-modes
~~~

Expected: dev-cleared fails because main.tsx has not passed the capability; dev-clean remains green.

- [ ] **Step 3: Wire the gated capability**

Change only the AppRoot call:

~~~tsx
<AppRoot
  devClearedMode={devClearedProgress}
  services={services}
  renderMatch={renderMatch}
/>
~~~

Do not add a second environment read and do not infer from progress.

- [ ] **Step 4: Verify GREEN**

~~~powershell
npm run test:dev-modes
npm test -- src/app/dev-cleared-mode.test.ts src/app/app-services.test.ts src/app/AppRoot.test.tsx src/ui/screens/TowerScreen.test.tsx src/scoring/score-run-controller.test.ts tests/app/towerController.test.ts
npm run typecheck
~~~

Expected: both browser projects pass; cleared mode enters floor 5; clean mode keeps floor 2 locked.

- [ ] **Step 5: Commit**

~~~powershell
git add -- src/main.tsx tests/dev-modes/dev-cleared.spec.ts tests/dev-modes/dev-clean.spec.ts
git commit -m "test: prove free administrator tower mode"
~~~

---

### Task 6: Final review, verification, and delivery

**Files:**
- Verify only: all tracked changes from this plan.
- Preserve: tmp/, the linked worktree, and user-owned development processes.

**Interfaces:**
- Consumes: Tasks 1 through 5.
- Produces: reviewed commits, fresh verification evidence, pushed feat/pve-delivery, and updated PR #6.

- [ ] **Step 1: Review against the approved design**

Capture the plan base and review the full range:

~~~powershell
$planBase = (git log -1 --format=%H -- docs/superpowers/plans/2026-08-15-dev-cleared-free-tower.md).Trim()
git diff --stat "$planBase..HEAD"
git diff "$planBase..HEAD"
~~~

Check that only devClearedMode enables free selection; normal all-cleared progress cannot bypass order; arbitrary-floor runs accept matching outcomes; the same suspended opponent resumes while a different floor replaces it; difficulty switching resets only the administrator run; no back, schema, storage-key, or production-mode behavior changed.

Fix every Critical or Important finding with a regression test.

- [ ] **Step 2: Run full application verification**

~~~powershell
npm test
npm run typecheck
npm run test:dev-modes
~~~

Expected: zero failures and both development-mode projects pass.

- [ ] **Step 3: Run E2E without disturbing a user server**

Inspect port 5173. If free:

~~~powershell
npm run test:e2e
~~~

If user-owned, leave it untouched and create this ignored SDD scratch config with the exact checkout path and a confirmed-free port (5174 below):

~~~ts
import { defineConfig } from '@playwright/test';
import path from 'node:path';

const repoRoot = 'C:\\Users\\USER\\Desktop\\workspace\\git\\te-ppu\\.worktrees\\delivery';

export default defineConfig({
  testDir: path.join(repoRoot, 'tests/e2e'),
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e -- --port 5174',
    cwd: repoRoot,
    port: 5174,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'portrait-360x640',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'portrait-430x932',
      use: {
        browserName: 'webkit',
        viewport: { width: 430, height: 932 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
~~~

Run:

~~~powershell
npm exec -- playwright test -c .superpowers/sdd/2026-08-15-dev-cleared-free-tower/playwright.e2e-5174.config.ts
~~~

Expected: the same 56 tests pass and port 5174 is free afterward. Delete only this plan's ignored SDD scratch directory after final review.

- [ ] **Step 4: Run delivery gates and builds**

~~~powershell
npm run test:delivery-gates
npm run build:web
npm run build:android:web
npm run build:ait
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
~~~

Expected: all commands exit 0 and the explicit verifier prints AIT_OK.

- [ ] **Step 5: Inspect repository state**

~~~powershell
git diff --check
git status --short --branch
git log --oneline --decorate -12
~~~

Expected: no tracked changes; only the pre-existing untracked tmp/ may appear.

- [ ] **Step 6: Push and confirm the existing PR**

~~~powershell
git push origin feat/pve-delivery
git rev-parse HEAD
git ls-remote origin refs/heads/feat/pve-delivery
~~~

Confirm PR #6 is open against master and its head SHA equals local and remote feat/pve-delivery. Keep the linked worktree for feedback.
