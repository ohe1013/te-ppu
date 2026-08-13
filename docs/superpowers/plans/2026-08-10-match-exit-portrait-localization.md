# Match Exit, Portrait, and Korean UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make match exit respond promptly, center every overlay at supported mobile sizes, preserve and resume an active tower run from the title, make the title/tower/match journey Korean-first, and align Lumi, Sera, and every battle portrait with Rivet's established visual language.

**Architecture:** Keep route state in `reduceRoute`, active score-run state in `ScoreRunController`, and native close behavior behind `closeWithTimeout`. Add one app-level portal host inside the Safe Area tree so overlays are independent of screen layout. Keep full-body art as the source of truth and derive deterministic 256-by-256 portrait states through an explicit per-character framing table.

**Tech Stack:** React 19.2.8, TypeScript 7.0.2, Vitest 4.1.10, Testing Library, Playwright 1.62.1, Pillow, Vite 8.2.0, Apps-in-Toss Web Framework 2.10.8.

## Global Constraints

- Work only in the existing linked worktree `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on branch `feat/pve-delivery`.
- Do not create another worktree. At execution start, invoke `superpowers:using-git-worktrees`, confirm the existing worktree is suitable, and continue there.
- Invoke `superpowers:test-driven-development` before production changes. Every behavior change below starts with a failing focused test, then the smallest implementation, then refactoring.
- Invoke `superpowers:systematic-debugging` for any unexpected failure instead of guessing at a fix.
- Invoke the `imagegen` skill before either character-generation call in Task 5 and follow its output-path and transparency workflow exactly.
- Invoke `superpowers:requesting-code-review` after the task commits, then `superpowers:verification-before-completion` before any completion claim.
- Preserve the untracked `tmp/` directory exactly as found. Do not read, write, stage, delete, or move it.
- Do not add dependencies or change package versions.
- Use Node `>=24.15.0 <25`; stop and report the mismatch if `node --version` is outside that range.
- Preserve game rules, AI strength, attack resolution, score formulas, floor order, encounter order, equal player-character performance, Firestore schemas, manifest IDs, and manifest paths.
- Keep A-Z visible on the three-letter initials keyboard. Tetromino kind letters may remain internal `data-*` and accessibility metadata but must not become visible labels.
- Existing rival full-body art is immutable. Only Lumi and Sera full-body masters may be replaced; all roster portrait derivatives may be regenerated.
- Support both 360x640 and 430x932 portrait viewports, including safe-area padding.
- Treat the known production dependency-audit finding as a separate release limitation. Do not weaken the audit or describe that expected failure as a functional regression.

## File Responsibility Map

| Area | Files | Responsibility |
| --- | --- | --- |
| Native exit | `src/platform/close-with-timeout.ts`, `src/platform/close-with-timeout.test.ts`, `src/ui/match/ExitConfirmation.tsx`, `src/ui/match/lifecycle-ui.test.tsx`, `tests/e2e/lifecycle-controls.spec.ts` | Synchronous native close request, 400 ms timeout, duplicate suppression, one-call retry |
| Overlay host | `src/app/AppRoot.tsx`, `src/app/AppRoot.test.tsx`, `src/ui/match/ModalOverlay.tsx`, `src/ui/match/lifecycle-ui.test.tsx`, `src/ui/screens/screens.css`, `tests/e2e/lifecycle-controls.spec.ts` | Portal ownership, viewport centering, safe-area containment, inline isolated-test fallback |
| Run navigation | `src/app/app-route.ts`, `src/app/app-route.test.ts`, `src/app/AppRoot.tsx`, `src/app/AppRoot.test.tsx`, `src/ui/screens/TitleScreen.tsx`, `src/ui/screens/TitleScreen.test.tsx`, `src/ui/screens/TowerScreen.tsx`, `src/ui/screens/TowerScreen.test.tsx`, `tests/e2e/app-flow.spec.ts` | Tower-to-title route, active-run preservation, title resume action |
| Korean-first UI | `src/ui/screens/TitleScreen.tsx`, `src/ui/screens/TitleScreen.test.tsx`, `src/ui/screens/TowerScreen.tsx`, `src/ui/screens/TowerScreen.test.tsx`, `src/ui/screens/MatchScreen.tsx`, `src/ui/screens/MatchScreen.test.tsx`, `src/ui/match/BattleHud.tsx`, `src/ui/match/BattleHud.test.tsx`, `tests/e2e/helpers.ts`, `tests/e2e/app-flow.spec.ts` | Approved visible Korean copy and accessible labels |
| Character art | `public/assets/characters/cloud-courier/full.webp`, `public/assets/characters/star-alchemist/full.webp` | Rivet-style full-body masters while preserving Lumi/Sera identity |
| Portrait framing | `scripts/generate-authored-assets.py`, `scripts/generate-authored-assets.test.py`, `public/assets/characters/*/portrait-*.webp`, `src/ui/match/BattleHud.tsx`, `src/ui/match/BattleHud.test.tsx`, `src/ui/match/match-layout.css`, `src/ui/screens/screens.css` | Explicit face crops, safe margins, deterministic state derivatives, centered rendering |
| Delivery proof | `tests/e2e/app-flow.spec.ts`, `tests/e2e/lifecycle-controls.spec.ts`, generated `artifacts/ait/game.ait` | Cross-screen behavior, mobile geometry, package verification |

---

### Task 1: Make the native close request synchronous and fail fast

**Files:**

- Modify: `src/platform/close-with-timeout.test.ts`
- Modify: `src/platform/close-with-timeout.ts`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `tests/e2e/lifecycle-controls.spec.ts`

- [ ] **Step 1: Add the close-contract regression tests.**

  In `src/platform/close-with-timeout.test.ts`, change the default-timeout boundary from 1,200 ms to 400 ms and add a synchronous-invocation assertion before advancing any microtasks:

  ```ts
  it('invokes close synchronously and rejects after the 400 ms default', async () => {
    vi.useFakeTimers();
    let invoked = false;

    const pending = closeWithTimeout(() => {
      invoked = true;
      return new Promise<void>(() => undefined);
    });

    expect(invoked).toBe(true);
    await vi.advanceTimersByTimeAsync(399);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow('CLOSE_TIMEOUT');
  });
  ```

  Keep the existing success, rejection, duplicate-confirmation, and retry coverage. In `src/ui/match/lifecycle-ui.test.tsx`, assert that two confirmation clicks while `onConfirm` is pending call it once, and that clicking retry after the timeout calls it exactly once more.

- [ ] **Step 2: Tighten the browser-level timeout assertion.**

  In the hanging-close case in `tests/e2e/lifecycle-controls.spec.ts`, remove the fixed `1_201` ms wait. Start a timer immediately before the confirmation click, wait for the retry/error state, and assert that it appears in less than 800 ms:

  ```ts
  const startedAt = Date.now();
  await page.getByRole('button', { name: '게임 나가기 확인' }).click();
  await expect(page.getByRole('status')).toContainText('다시 시도');
  expect(Date.now() - startedAt).toBeLessThan(800);
  ```

  Keep the existing bridge-call count assertion so rapid repeat clicks cannot issue duplicate native requests.

- [ ] **Step 3: Run the focused RED tests.**

  Run:

  ```powershell
  npm test -- src/platform/close-with-timeout.test.ts src/ui/match/lifecycle-ui.test.tsx
  npx playwright test tests/e2e/lifecycle-controls.spec.ts --grep "hanging close"
  ```

  Expected RED evidence:

  - the synchronous assertion fails because `close()` currently runs in a promise microtask;
  - the 400 ms boundary test fails because the default is 1,200 ms;
  - the E2E error state misses the 800 ms limit.

- [ ] **Step 4: Implement the minimum close-contract change.**

  In `src/platform/close-with-timeout.ts`, set `DEFAULT_CLOSE_TIMEOUT_MS` to `400`. Start the timer before the bridge call, invoke `close()` directly inside `try/catch`, and subscribe to the returned promise without deferring the call:

  ```ts
  const DEFAULT_CLOSE_TIMEOUT_MS = 400;

  export function closeWithTimeout(
    close: () => Promise<void>,
    timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
  ): Promise<void> {
    const duration = Number.isFinite(timeoutMs)
      ? Math.max(0, Math.floor(timeoutMs))
      : DEFAULT_CLOSE_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error === undefined) resolve();
        else reject(error);
      };
      const timer = setTimeout(() => finish(new Error('CLOSE_TIMEOUT')), duration);

      let request: Promise<void>;
      try {
        request = close();
      } catch (error) {
        finish(error);
        return;
      }
      void request.then(() => finish(), (error: unknown) => finish(error));
    });
  }
  ```

  Do not add a second timeout in `ExitConfirmation`; its existing pending and success refs remain the single duplicate-request guard.

- [ ] **Step 5: Run GREEN verification for Task 1.**

  Run:

  ```powershell
  npm test -- src/platform/close-with-timeout.test.ts src/ui/match/lifecycle-ui.test.tsx
  npx playwright test tests/e2e/lifecycle-controls.spec.ts --grep "hanging close"
  npm run typecheck
  ```

  Expected: all focused tests pass, the close callback is observed synchronously, timeout failure appears at 400 ms, and retry increments the native call count by one.

- [ ] **Step 6: Commit Task 1.**

  ```powershell
  git add src/platform/close-with-timeout.ts src/platform/close-with-timeout.test.ts src/ui/match/lifecycle-ui.test.tsx tests/e2e/lifecycle-controls.spec.ts
  git commit -m "fix: make native close fail fast"
  ```

---

### Task 2: Center overlays through a dedicated app-level portal host

**Files:**

- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/match/ModalOverlay.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `tests/e2e/lifecycle-controls.spec.ts`

- [ ] **Step 1: Add RED tests for portal ownership.**

  In `src/ui/match/lifecycle-ui.test.tsx`, append an overlay host before rendering and prove the overlay becomes its direct child:

  ```tsx
  const host = document.createElement('div');
  host.id = 'modal-root';
  host.dataset.modalRoot = '';
  document.body.append(host);

  const view = render(
      <ModalOverlay testId="test-overlay">
        <div>overlay content</div>
      </ModalOverlay>,
    );

  try {
    expect(screen.getByTestId('test-overlay').parentElement).toBe(host);
  } finally {
    view.unmount();
    host.remove();
  }
  ```

  Add a second isolated-component test without a host and assert the same overlay still renders inline. This preserves component-test and server-render safety.

- [ ] **Step 2: Add RED tests for the app host and viewport geometry.**

  In `src/app/AppRoot.test.tsx`, after boot reaches the title, assert there is exactly one host inside `#app-shell` and after the active screen:

  ```ts
  const shell = screen.getByTestId('app-shell');
  const host = shell.querySelector('[data-modal-root]');
  expect(host).not.toBeNull();
  expect(shell.querySelectorAll('[data-modal-root]')).toHaveLength(1);
  expect(shell.lastElementChild).toBe(host);
  ```

  In `tests/e2e/lifecycle-controls.spec.ts`, open the exit dialog and resume countdown at both configured projects. For each overlay, evaluate:

  ```ts
  const geometry = await page.locator('.modal-overlay').evaluate((overlay) => {
    const overlayRect = overlay.getBoundingClientRect();
    const surface = overlay.querySelector<HTMLElement>('.modal-overlay__surface');
    if (surface === null) throw new Error('missing modal surface');
    const surfaceRect = surface.getBoundingClientRect();
    return {
      position: getComputedStyle(overlay).position,
      overlayRect: {
        left: overlayRect.left,
        top: overlayRect.top,
        right: overlayRect.right,
        bottom: overlayRect.bottom,
      },
      centerDeltaX: Math.abs(
        surfaceRect.left + surfaceRect.width / 2 - window.innerWidth / 2,
      ),
      centerDeltaY: Math.abs(
        surfaceRect.top + surfaceRect.height / 2 - window.innerHeight / 2,
      ),
    };
  });
  expect(geometry.position).toBe('fixed');
  expect(geometry.overlayRect.left).toBe(0);
  expect(geometry.overlayRect.top).toBe(0);
  expect(geometry.overlayRect.right).toBe(page.viewportSize()!.width);
  expect(geometry.overlayRect.bottom).toBe(page.viewportSize()!.height);
  expect(geometry.centerDeltaX).toBeLessThanOrEqual(1);
  expect(geometry.centerDeltaY).toBeLessThanOrEqual(1);
  ```

- [ ] **Step 3: Run the focused RED tests.**

  Run:

  ```powershell
  npm test -- src/ui/match/lifecycle-ui.test.tsx src/app/AppRoot.test.tsx
  npx playwright test tests/e2e/lifecycle-controls.spec.ts
  ```

  Expected RED evidence: `ModalOverlay` remains under `.screen-shell`, the app has no overlay host, and computed overlay positioning is `relative` because `.screen-shell > :not(.screen-backdrop)` overrides `.modal-overlay`.

- [ ] **Step 4: Add the host inside the Safe Area subtree.**

  In `src/app/AppRoot.tsx`, place the host immediately after `{content}` and before `</main>`:

  ```tsx
  {content}
  <div data-modal-root id="modal-root" />
  ```

  Do not mount it outside `AppRoot`; inherited safe-area custom properties must remain available to portaled overlays.

- [ ] **Step 5: Portal `ModalOverlay` when the host exists.**

  Import `createPortal` from `react-dom`, assign the current JSX to `overlay`, and use an inline fallback only when `document` or the host is unavailable:

  ```tsx
  import { type MouseEvent, type ReactNode } from 'react';
  import { createPortal } from 'react-dom';

  const overlay = (
    <div
      aria-label={ariaLabel}
      aria-live={role === 'status' ? 'assertive' : undefined}
      className={`modal-overlay${className === undefined ? '' : ` ${className}`}`}
      data-testid={testId}
      onMouseDown={handlePointerDown}
      role={role}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  const host = document.querySelector<HTMLElement>('[data-modal-root]');
  return host === null ? overlay : createPortal(overlay, host);
  ```

  Preserve dismissal targeting, roles, live-region behavior, dialog focus trapping, Escape handling, and focus restoration.

- [ ] **Step 6: Make the screen selector safe for inline fallback.**

  In `src/ui/screens/screens.css`, replace the over-broad selector with:

  ```css
  .screen-shell > :not(.screen-backdrop):not(.modal-overlay) {
    position: relative;
    z-index: 1;
  }
  ```

  Keep `.modal-overlay { position: fixed; inset: 0; }` and its safe-area padding in `src/ui/match/match-layout.css` unchanged.

- [ ] **Step 7: Run GREEN verification for Task 2.**

  Run:

  ```powershell
  npm test -- src/ui/match/lifecycle-ui.test.tsx src/app/AppRoot.test.tsx
  npx playwright test tests/e2e/lifecycle-controls.spec.ts
  npm run typecheck
  ```

  Expected: one host is present, all in-app overlays portal to it, isolated rendering still works, and dialog/countdown centers are within one CSS pixel of the viewport center at 360x640 and 430x932.

- [ ] **Step 8: Commit Task 2.**

  ```powershell
  git add src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/match/ModalOverlay.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/screens.css tests/e2e/lifecycle-controls.spec.ts
  git commit -m "fix: center match overlays in app host"
  ```

---

### Task 3: Return to the title and resume the same active run

**Files:**

- Modify: `src/app/app-route.ts`
- Modify: `src/app/app-route.test.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/TitleScreen.tsx`
- Modify: `src/ui/screens/TitleScreen.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `tests/e2e/app-flow.spec.ts`

- [ ] **Step 1: Add reducer RED tests.**

  In `src/app/app-route.test.ts`, add these three route contracts:

  ```ts
  it('returns from tower to title', () => {
    expect(reduceRoute({ name: 'tower' }, { type: 'return-to-title' }))
      .toEqual({ name: 'title' });
  });

  it('resumes an active run from title', () => {
    expect(reduceRoute({ name: 'title' }, { type: 'resume-run' }))
      .toEqual({ name: 'tower' });
  });

  it('keeps invalid resume events referentially stable', () => {
    const route: AppRoute = { name: 'tower' };
    expect(reduceRoute(route, { type: 'resume-run' })).toBe(route);
  });
  ```

- [ ] **Step 2: Add component RED tests for both controls.**

  In `src/ui/screens/TitleScreen.test.tsx`, render once with `runActive={false}` and once with `runActive`. At this task boundary, assert the primary label switches from the existing `START RUN` to `도전 계속`, and each click invokes `onStartRun` once. Task 4 changes the inactive label to `도전 시작` together with the rest of the Korean copy.

  In `src/ui/screens/TowerScreen.test.tsx`, pass `onBack={vi.fn()}`, click the `처음으로` button, and assert the callback is called once. Keep floor and difficulty controls unchanged.

- [ ] **Step 3: Add an AppRoot RED test for snapshot preservation.**

  Use the existing `enterMatch`, `completeFloor`, and returning-profile helpers in `src/app/AppRoot.test.tsx`:

  ```ts
  it('returns to title and resumes the same active score run', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await completeFloor(user);
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      'RUN ACTIVE · NEXT 2F · SCORE 005000',
    );

    await user.click(screen.getByRole('button', { name: '처음으로' }));
    expect(await screen.findByTestId('title-screen')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 계속' }));

    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      'RUN ACTIVE · NEXT 2F · SCORE 005000',
    );
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeEnabled();
  });
  ```

  Task 4 changes these two status expectations to `도전 중 · 다음 2층 · 점수 005000`. Task 3 must first prove with the current status format that score `005000` and required floor `2` survive the round trip.

  Add two state-integrity cases around player replacement:

  - after an active run reaches the title, opening `PLAYER CHANGE` and pressing `BACK` must leave `도전 계속` available and restore the same tower status;
  - after an active run reaches the title, completing a new three-letter profile and character selection must clear the old run, show `START RUN` at this task boundary, and start the replacement player's next run at floor 1 with score `000000`.

- [ ] **Step 4: Add an E2E RED journey.**

  In `tests/e2e/app-flow.spec.ts`, add a test named `resumes the same active run after visiting the title`. Seed a returning profile, complete floor 1 with the existing E2E match hook, capture `tower-run-status`, return with `처음으로`, click `도전 계속`, and compare the restored status to the captured text. Also assert floor 2 remains enabled and floor 1 remains disabled for the active run.

- [ ] **Step 5: Run the focused RED tests.**

  Run:

  ```powershell
  npm test -- src/app/app-route.test.ts src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.test.tsx src/app/AppRoot.test.tsx
  npx playwright test tests/e2e/app-flow.spec.ts --grep "resumes the same active run"
  ```

  Expected RED evidence: `resume-run` is absent, tower ignores `return-to-title`, both controls are absent, and AppRoot currently starts a fresh score run whenever the title primary action is clicked.

- [ ] **Step 6: Implement the route events.**

  In `src/app/app-route.ts`, add the new event:

  ```ts
  | { type: 'resume-run' }
  ```

  Accept it only in the title case and accept `return-to-title` in the tower case:

  ```ts
  case 'title':
    if (event.type === 'resume-run') return { name: 'tower' };
    // existing title events remain unchanged

  case 'tower':
    if (event.type === 'return-to-title') return { name: 'title' };
    return event.type === 'select-floor'
      ? { name: 'floor-intro', floor: event.floor, encounterIndex: 0, wins: 0 }
      : route;
  ```

  Do not infer run state inside the reducer; AppRoot remains responsible for exposing `resume-run` only when a score run is active.

- [ ] **Step 7: Add the title and tower component contracts.**

  Add to `TitleScreenProps`:

  ```ts
  readonly runActive?: boolean;
  ```

  Default it to `false` and render:

  ```tsx
  {runActive ? '도전 계속' : 'START RUN'}
  ```

  Task 4 replaces the inactive branch with `도전 시작`.

  Add to `TowerScreenProps`:

  ```ts
  readonly onBack?: () => void;
  ```

  Default it to a no-op and add a compact header button:

  ```tsx
  <button className="secondary-button tower-screen__back" onClick={onBack} type="button">
    처음으로
  </button>
  ```

- [ ] **Step 8: Wire active-run preservation in AppRoot.**

  Compute:

  ```ts
  const runActive = scoreRunSnapshot?.phase === 'active';
  ```

  Pass `runActive` to `TitleScreen`. Its primary callback must resume without calling `startScoreRun()`:

  ```ts
  onStartRun={() => {
    if (runActive) {
      dispatchRoute({ type: 'resume-run' });
      return;
    }
    const hasProfile = controller.progress.profile !== null;
    if (hasProfile) startScoreRun();
    dispatchRoute({ type: 'start-run', hasProfile });
  }}
  ```

  Replace the current always-clearing title helper with two explicit operations:

  ```ts
  function showTitle(): void {
    setProfileSaveStatus('idle');
    dispatchRoute({ type: 'return-to-title' });
  }

  function finishRunAndShowTitle(): void {
    clearScoreRun();
    showTitle();
  }
  ```

  Use `showTitle` for tower back, ranking back, and cancellation from name/character screens. Use `finishRunAndShowTitle` only after the ending. Loss handling continues through `finishEndedRun()`. When a `change-player` profile save succeeds, call `clearScoreRun()` before returning to title because replacing the player explicitly abandons the old active run; cancelling player change leaves it intact.

  Pass tower back as:

  ```tsx
  onBack={showTitle}
  ```

- [ ] **Step 9: Run GREEN verification for Task 3.**

  Run:

  ```powershell
  npm test -- src/app/app-route.test.ts src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.test.tsx src/app/AppRoot.test.tsx
  npx playwright test tests/e2e/app-flow.spec.ts --grep "resumes the same active run"
  npm run typecheck
  ```

  Expected: the route round trip works, only an active run exposes `도전 계속`, score/floor/difficulty remain unchanged, and invalid route-event pairs return the original object.

- [ ] **Step 10: Commit Task 3.**

  ```powershell
  git add src/app/app-route.ts src/app/app-route.test.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/TitleScreen.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx tests/e2e/app-flow.spec.ts
  git commit -m "feat: resume active run from title"
  ```

---

### Task 4: Make title, tower, and match UI Korean-first

**Files:**

- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/TitleScreen.tsx`
- Modify: `src/ui/screens/TitleScreen.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/app-flow.spec.ts`

- [ ] **Step 1: Add title-copy RED assertions.**

  Update `src/ui/screens/TitleScreen.test.tsx` to require this visible and accessible vocabulary:

  - `별빛 오락실`, `기어라이트 타워`
  - `탑을 오르고 모든 라이벌을 이겨 보세요.`
  - first player: `세 글자 이름을 등록하고 도전을 시작하세요.`
  - returning player: `다음 타워 도전이 준비됐어요.`
  - `플레이어`, `신규 플레이어`, `캐릭터 미선택`
  - `난이도`, `내 최고 기록`, `기록 없음`
  - `쉬움`, `보통`, `어려움`
  - `도전 시작`, `도전 계속`, `랭킹`, `플레이어 변경`
  - `온라인 랭킹 동기화 대기 중`
  - image alternatives `기어라이트 타워 로고`, `별빛 부엉이 안내자`
  - region labels `플레이어 정보`, `주요 메뉴`

- [ ] **Step 2: Add tower-copy RED assertions.**

  Update `src/ui/screens/TowerScreen.test.tsx` to require:

  ```text
  기어라이트 타워
  도전 중 · 다음 1층 · 점수 000000
  쉬움 / 보통 / 어려움
  잠김
  도전 중에는 난이도를 바꿀 수 없습니다.
  ```

  Buttons and `aria-label` values must use the Korean difficulty labels. Existing `1층 선택` through `5층 선택` labels remain unchanged.

- [ ] **Step 3: Add match/HUD-copy RED assertions.**

  Update `src/ui/screens/MatchScreen.test.tsx` to assert:

  - normal encounter badge: `1층 · 1/3`;
  - special encounter badge: `숨겨진 보스`;
  - owl series label: `부엉이`;
  - score label: `점수 000000`.

  Update `src/ui/match/BattleHud.test.tsx` to require:

  - `준비` and `위험` states;
  - heading `다음 블록`;
  - item labels `행 제거`, `빙결`, `교체`;
  - Korean region/queue/item accessible names.

  Keep tests proving the next queue renders tetromino shapes rather than visible `I`, `J`, `L`, `O`, `S`, `T`, or `Z` text.

- [ ] **Step 4: Add an E2E English-leak regression.**

  Update `tests/e2e/helpers.ts` and all affected selectors in `tests/e2e/app-flow.spec.ts` from `START RUN` to `도전 시작` or `도전 계속`. On title, tower, and match screens, assert visible text does not match:

  ```ts
  const forbiddenGameCopy = /START RUN|RUN ACTIVE|NEXT \dF|SCORE|EASY|NORMAL|HARD|HIDDEN BOSS|READY|DANGER/;
  await expect(page.getByTestId('title-screen')).not.toContainText(forbiddenGameCopy);
  await expect(page.getByTestId('tower-screen')).not.toContainText(forbiddenGameCopy);
  await expect(page.getByTestId('match-screen')).not.toContainText(forbiddenGameCopy);
  ```

  Scope assertions to those screens so the intentional A-Z initials keyboard is not rejected.

- [ ] **Step 5: Run the focused RED tests.**

  Run:

  ```powershell
  npm test -- src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/BattleHud.test.tsx
  npx playwright test tests/e2e/app-flow.spec.ts
  ```

  Expected RED evidence: current English headings, statuses, difficulty labels, score labels, danger state, next heading, and item labels are still visible.

- [ ] **Step 6: Implement the title copy.**

  In `src/ui/screens/TitleScreen.tsx`, use this exact difficulty map:

  ```ts
  const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
  };
  ```

  Replace the strings with the Step 1 vocabulary, set the score formatter locale to `ko-KR`, and preserve player initials and character names verbatim.

- [ ] **Step 7: Implement the tower copy.**

  In `src/ui/screens/TowerScreen.tsx`, use the same Korean difficulty map and render:

  ```tsx
  <p className="tower-run-status" data-testid="tower-run-status">
    도전 중 · 다음 {requiredFloor}층 · 점수 {String(runScore).padStart(6, '0')}
  </p>
  ```

  Change the eyebrow to `기어라이트 타워`, locked option text to `잠김`, and the run-lock notice to `도전 중에는 난이도를 바꿀 수 없습니다.`.

- [ ] **Step 8: Implement the match and HUD copy.**

  In `src/ui/screens/MatchScreen.tsx`, render:

  ```tsx
  {isOwlMatch ? '숨겨진 보스' : `${floor}층 · ${encounterIndex + 1}/3`}
  {isOwlMatch ? '부엉이' : `승리 ${wins}/3`}
  <span className="match-header__run-score" data-testid="run-score">
    점수 {String(runScore).padStart(6, '0')}
  </span>
  ```

  In `src/ui/match/BattleHud.tsx`, set:

  ```ts
  const ITEM_LABELS: Readonly<Record<ItemType, string>> = {
    'row-clear': '행 제거',
    freeze: '빙결',
    'queue-swap': '교체',
  };
  ```

  Change visible and accessible labels to `${character.name} 대전 상태`, `${character.name} 기본 표정`, `준비`, `위험`, `다음 블록`, `${plate.name} 다음 블록`, and `${plate.name} 아이템`. Keep piece kinds only in `data-kind`, React keys, and non-visible shape metadata.

- [ ] **Step 9: Update every affected unit and E2E selector atomically.**

  Use `rg` to find stale contract strings:

  ```powershell
  rg -n 'START RUN|RUN ACTIVE|NEXT [0-9]|SCORE|EASY|NORMAL|HARD|HIDDEN BOSS|READY|DANGER|ROW|FREEZE|SWAP' src tests/e2e
  ```

  Classify each remaining match:

  - replace visible UI and test expectations;
  - retain internal IDs, data attributes, enum values, score model names, and comments that do not render;
  - retain unrelated screens only when the approved scope does not include them.

- [ ] **Step 10: Run GREEN verification for Task 4.**

  Run:

  ```powershell
  npm test -- src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/BattleHud.test.tsx src/app/AppRoot.test.tsx
  npx playwright test tests/e2e/app-flow.spec.ts
  npm run typecheck
  ```

  Expected: the title/tower/match journey is Korean-first, initials remain A-Z, next blocks remain shape-only, and behavioral tests still select controls through stable Korean accessible names.

- [ ] **Step 11: Commit Task 4.**

  ```powershell
  git add src/ui/screens/TitleScreen.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/app/AppRoot.test.tsx tests/e2e/helpers.ts tests/e2e/app-flow.spec.ts
  git commit -m "feat: localize arcade journey UI"
  ```

---

### Task 5: Align Lumi and Sera with Rivet and reframe every battle portrait

**Files:**

- Modify: `scripts/generate-authored-assets.py`
- Modify: `scripts/generate-authored-assets.test.py`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/screens/screens.css`
- Replace: `public/assets/characters/cloud-courier/full.webp`
- Replace: `public/assets/characters/star-alchemist/full.webp`
- Regenerate: `public/assets/characters/*/portrait-*.webp`

- [ ] **Step 1: Add portrait-framing RED tests.**

  In `scripts/generate-authored-assets.test.py`, load `scripts/generate-authored-assets.py` with `importlib.util.spec_from_file_location`. Add tests that require:

  ```python
  self.assertEqual(set(generator.PORTRAIT_FRAMES), set(generator.PORTRAITS))
  ```

  For each `(center_x, center_y, size_fraction)`, require `0 <= center_x <= 1`, `0 <= center_y <= 1`, and `0 < size_fraction <= 1`. Add an exact off-center crop test:

  ```python
  self.assertEqual(
      generator.portrait_crop_box((100, 200, 900, 1200), (0.75, 0.30, 0.50)),
      (500, 300, 900, 700),
  )
  ```

  Extend the forced-derivation test so every emitted portrait is mode `RGBA`, size `(256, 256)`, and has an alpha bounding box contained within `(8, 8, 248, 248)`.

- [ ] **Step 2: Add HUD RED tests for authored square crops.**

  In `src/ui/match/BattleHud.test.tsx`, remove the test-only `portraitPosition="48% 18%"` contract and instead assert the HUD renders the supplied portrait URL without an inline `--portrait-position` style. Add a CSS contract assertion or DOM-style assertion that both `.battle-hud__portrait .asset-image` and `.character-portrait__image` use centered positioning.

- [ ] **Step 3: Run the framing RED tests.**

  Run:

  ```powershell
  python -m unittest scripts/generate-authored-assets.test.py
  npm test -- src/ui/match/BattleHud.test.tsx
  ```

  Expected RED evidence: there is no framing table or `portrait_crop_box`, and BattleHud still publishes a shared top-biased CSS variable.

- [ ] **Step 4: Implement the explicit framing model.**

  In `scripts/generate-authored-assets.py`, add this complete map next to `PORTRAITS`:

  ```python
  PORTRAIT_FRAMES = {
      "hero-engineer": (0.50, 0.18, 0.56),
      "cloud-courier": (0.48, 0.18, 0.56),
      "star-alchemist": (0.45, 0.18, 0.56),
      "owl-companion": (0.50, 0.32, 0.56),
      "quartermaster": (0.56, 0.26, 0.54),
      "alchemist": (0.50, 0.16, 0.50),
      "guard-captain": (0.50, 0.14, 0.48),
      "dark-engineer": (0.46, 0.16, 0.50),
      "clock-moth": (0.50, 0.32, 0.48),
      "glass-oracle": (0.49, 0.24, 0.48),
      "moss-golem": (0.52, 0.25, 0.50),
      "demon-king": (0.51, 0.14, 0.45),
  }
  ```

  Add the pure clamp function:

  ```python
  def portrait_crop_box(
      bbox: tuple[int, int, int, int],
      frame: tuple[float, float, float],
  ) -> tuple[int, int, int, int]:
      width = bbox[2] - bbox[0]
      height = bbox[3] - bbox[1]
      center_x, center_y, size_fraction = frame
      size = max(1, round(min(width, height) * size_fraction))
      x = bbox[0] + round(width * center_x)
      y = bbox[1] + round(height * center_y)
      left = min(max(bbox[0], x - size // 2), bbox[2] - size)
      top = min(max(bbox[1], y - size // 2), bbox[3] - size)
      return left, top, left + size, top + size
  ```

  In `derive_portraits`, replace the geometric center calculation with:

  ```python
  crop = source.crop(portrait_crop_box(bbox, PORTRAIT_FRAMES[character]))
  crop = crop.resize((240, 240), Image.Resampling.LANCZOS)
  portrait_base = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
  portrait_base.alpha_composite(crop, (8, 8))
  ```

- [ ] **Step 5: Remove runtime crop correction.**

  In `src/ui/match/BattleHud.tsx`, remove `CSSProperties`, the `portraitPosition` prop/default, and the inline `--portrait-position` style. In both CSS files, use:

  ```css
  object-position: center;
  ```

  Keep `object-fit: cover`; the authored 256-by-256 derivative now owns face framing.

- [ ] **Step 6: Run GREEN framing tests before changing art.**

  Run:

  ```powershell
  python -m unittest scripts/generate-authored-assets.test.py
  npm test -- src/ui/match/BattleHud.test.tsx
  ```

  Expected: framing coverage is complete, the pure crop test passes, emitted portraits obey size/margin rules, and BattleHud no longer publishes per-render crop offsets.

- [ ] **Step 7: Generate Lumi with Rivet as the sole style reference.**

  Invoke the image-generation tool with these two references in this order:

  1. `public/assets/characters/hero-engineer/full.webp`
  2. `public/assets/characters/cloud-courier/full.webp`

  Use this exact prompt:

  ```text
  Use case: stylized game character production asset and controlled style transfer.
  Image 1 is the sole rendering-style reference: match its thick dark-navy outer contours, crisp cel-shaded color blocks, bright saturated accents, compact classic TV-animation facial proportions, and highly readable mobile-game silhouette.
  Image 2 is the identity reference for Lumi, the Cloud Courier. Preserve her friendly youthful identity, blue-and-white courier outfit, cloud scarf, wing motif, satchel, hairstyle, role, and established palette. Change rendering style only; do not redesign her into Rivet and do not copy Rivet's clothes or tools.
  Draw one polished full-body character, front three-quarter pose, centered, with every limb, hair tip, scarf end, wing motif, and satchel fully visible. Leave generous empty margin on every side. Use clean cel shading with no soft painterly gradients.
  Background must be one perfectly flat solid #ff00ff chroma-key color that does not appear anywhere on the character. No floor shadow, glow, gradient, texture, scenery, border, text, logo, or watermark.
  ```

  Set `referenced_image_paths` to the two absolute worktree paths and do not include prior conversation images. Record the exact tool-returned source path and prompt in the execution notes.

- [ ] **Step 8: Remove Lumi's chroma background into the exact production path.**

  In PowerShell, assign the tool-returned path to `$imagegenSource` and run:

  ```powershell
  python 'C:\Users\USER\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' `
    --input $imagegenSource `
    --out 'public/assets/characters/cloud-courier/full.webp' `
    --key-color '#ff00ff' `
    --soft-matte `
    --transparent-threshold 18 `
    --opaque-threshold 72 `
    --edge-feather 0.6 `
    --edge-contract 0.2 `
    --spill-cleanup `
    --force
  ```

  Inspect the output with `view_image` at original detail. If chroma removal visibly damages hair, scarf, or contour edges, stop Task 5 and ask the user before using any native-transparency CLI fallback; do not silently switch generation methods.

- [ ] **Step 9: Generate Sera with Rivet as the sole style reference.**

  Invoke the image-generation tool with these two references in this order:

  1. `public/assets/characters/hero-engineer/full.webp`
  2. `public/assets/characters/star-alchemist/full.webp`

  Use this exact prompt:

  ```text
  Use case: stylized game character production asset and controlled style transfer.
  Image 1 is the sole rendering-style reference: match its thick dark-navy outer contours, crisp cel-shaded color blocks, bright saturated accents, compact classic TV-animation facial proportions, and highly readable mobile-game silhouette.
  Image 2 is the identity reference for Sera, the Star Alchemist. Preserve her confident identity, purple alchemist outfit, star motifs, potion equipment, hairstyle, role, and established purple-gold palette. Change rendering style only; do not redesign her into Rivet and do not copy Rivet's clothes or tools.
  Draw one polished full-body character, front three-quarter pose, centered, with every limb, hair tip, costume edge, star ornament, and potion prop fully visible. Leave generous empty margin on every side. Use clean cel shading with no soft painterly gradients.
  Background must be one perfectly flat solid #00ff00 chroma-key color that does not appear anywhere on the character. No floor shadow, glow, gradient, texture, scenery, border, text, logo, or watermark.
  ```

  Set `referenced_image_paths` to the two absolute worktree paths and record the exact tool-returned source path and prompt.

- [ ] **Step 10: Remove Sera's chroma background into the exact production path.**

  Assign the second tool-returned path to `$imagegenSource` and run:

  ```powershell
  python 'C:\Users\USER\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' `
    --input $imagegenSource `
    --out 'public/assets/characters/star-alchemist/full.webp' `
    --key-color '#00ff00' `
    --soft-matte `
    --transparent-threshold 18 `
    --opaque-threshold 72 `
    --edge-feather 0.6 `
    --edge-contract 0.2 `
    --spill-cleanup `
    --force
  ```

  Inspect at original detail and apply the same stop-and-ask rule if the transparent edge is damaged.

- [ ] **Step 11: Regenerate every portrait state from the approved masters.**

  Run:

  ```powershell
  python scripts/generate-authored-assets.py --force-derived-portraits
  ```

  Expected stdout ends with `AUTHORED_PIXEL_ASSETS_OK`. This replaces six states for each player, six states for each normal rival, the owl's three states, and the demon king's five states according to the existing `PORTRAITS` manifest.

- [ ] **Step 12: Perform visual and immutability checks.**

  Use `view_image` with original detail on:

  - both new `full.webp` files;
  - `portrait-idle.webp` for all twelve character IDs in `PORTRAIT_FRAMES`;
  - Lumi and Sera `focus`, `attack`, `hit`, `win`, and `loss` portraits.

  Accept only if:

  - Lumi/Sera identity, outfit, role props, and palette are preserved;
  - contour weight, face language, saturation, and cel shading visibly align with Rivet;
  - full bodies and props are not clipped;
  - transparent edges have no magenta/green spill or opaque halo;
  - every idle face is centered and readable when reduced to the 68 px HUD plate;
  - state overlays do not obscure eyes or crop the face.

  Verify rival full art did not change:

  ```powershell
  git diff --exit-code HEAD -- public/assets/characters/quartermaster/full.webp public/assets/characters/alchemist/full.webp public/assets/characters/guard-captain/full.webp public/assets/characters/dark-engineer/full.webp public/assets/characters/clock-moth/full.webp public/assets/characters/glass-oracle/full.webp public/assets/characters/moss-golem/full.webp public/assets/characters/demon-king/full.webp public/assets/characters/owl-companion/full.webp
  ```

  Expected: exit code 0 and no output.

- [ ] **Step 13: Run GREEN asset verification.**

  Run:

  ```powershell
  python -m unittest scripts/generate-authored-assets.test.py
  npm test -- src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.test.tsx
  npm run check:assets
  npm run check:source-policy
  npm run typecheck
  ```

  Expected: all tests and checks pass, every manifest asset resolves, and the authored-source policy accepts the new production files.

- [ ] **Step 14: Commit Task 5 without generated scratch files.**

  First inspect:

  ```powershell
  git status --short
  git diff --name-only -- 'public/assets/characters/*/full.webp'
  ```

  The second command must list only `cloud-courier/full.webp` and `star-alchemist/full.webp`. Stage the generator, tests, CSS/component changes, those two masters, and all regenerated portraits. Do not stage `tmp/` or image-generator source outputs outside the production asset paths.

  ```powershell
  git add scripts/generate-authored-assets.py scripts/generate-authored-assets.test.py src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/ui/match/match-layout.css src/ui/screens/screens.css public/assets/characters/cloud-courier/full.webp public/assets/characters/star-alchemist/full.webp
  git add 'public/assets/characters/*/portrait-*.webp'
  git commit -m "feat: align character art and portrait framing"
  ```

---

### Task 6: Integrate, review, and produce delivery evidence

**Files:**

- Modify only when a regression test exposes an integration defect: files already listed in Tasks 1-5
- Generate: `artifacts/ait/game.ait`
- Do not modify: `security/dependency-audit-baseline.json`
- Do not modify: `tmp/`

- [ ] **Step 1: Confirm repository and runtime state.**

  Run:

  ```powershell
  git status --short --branch
  node --version
  npm --version
  ```

  Expected: branch `feat/pve-delivery`, only intended task changes or the preserved `tmp/`, and Node 24.15.x or newer but lower than 25.

- [ ] **Step 2: Run all TypeScript and Python tests.**

  Run each command separately so failures retain their own evidence:

  ```powershell
  npm run typecheck
  npm test
  python -m unittest discover -s scripts -p '*.test.py'
  npm run test:e2e
  ```

  Do not use `npm test -- --run`; the package script already invokes `vitest run` and the duplicate flag previously caused a long, unhelpful run.

- [ ] **Step 3: Run delivery and policy gates.**

  Run:

  ```powershell
  npm run test:delivery-gates
  npm run check:assets
  npm run check:source-policy
  npm run build:web
  npm run build:ait
  node scripts/verify-ait-package.mjs artifacts/ait/game.ait
  ```

  Expected: all commands pass and package verification reports `AIT_OK`. Record the final package-entry count exactly as printed; do not reuse an older count.

- [ ] **Step 4: Run and classify the dependency audit separately.**

  Run:

  ```powershell
  npm run check:dependency-audit
  ```

  If it still fails only on the documented Apps-in-Toss framework dependency finding, record the exact package/advisory output as the known release blocker and do not alter the baseline. If the finding changed or a new package appears, invoke `superpowers:systematic-debugging` and investigate before continuing.

- [ ] **Step 5: Inspect both supported viewport journeys manually.**

  Use the Playwright screenshots from Chromium 360x640 and WebKit 430x932 to confirm:

  - title primary action is visible without crowding;
  - tower `처음으로` is compact and does not cover the mascot/header;
  - settings, exit, and 3-2-1 resume overlays are viewport-centered;
  - next blocks are centered, shape-only, and not replaced by letters;
  - both faces are fully readable in the match HUD;
  - Korean labels do not wrap over controls;
  - returning to title and continuing restores the same score and next floor.

- [ ] **Step 6: Request code review against the approved spec.**

  Invoke `superpowers:requesting-code-review`. Give the reviewer:

  - base commit `538ec69`;
  - current task-tip commit;
  - the approved spec `docs/superpowers/specs/2026-08-10-match-exit-portrait-localization-design.md`;
  - this plan;
  - exact verification output, including the separately classified audit result.

  Require review of route-state preservation, synchronous bridge invocation, portal/focus accessibility, Korean visible-copy leakage, portrait table coverage, and accidental rival full-art changes.

- [ ] **Step 7: Resolve review findings with focused RED/GREEN cycles.**

  For each valid finding, add or tighten one focused regression test, observe it fail, make the minimum correction, and rerun that focused test plus the directly affected task suite. Commit review fixes separately:

  First run `git status --short`, then invoke `git add` with each exact reviewed source/test path as a separate literal argument. Confirm `git diff --cached --name-only` contains only those reviewed files and never `tmp/`. Then commit:

  ```powershell
  git commit -m "fix: address delivery review findings"
  ```

- [ ] **Step 8: Re-run completion verification from a clean task state.**

  Invoke `superpowers:verification-before-completion`, then rerun:

  ```powershell
  npm run typecheck
  npm test
  python -m unittest discover -s scripts -p '*.test.py'
  npm run test:e2e
  npm run test:delivery-gates
  npm run check:assets
  npm run check:source-policy
  npm run build:web
  npm run build:ait
  node scripts/verify-ait-package.mjs artifacts/ait/game.ait
  git diff --check 538ec69..HEAD
  git status --short --branch
  ```

  Completion criteria:

  - every functional, unit, E2E, asset, source-policy, build, and AIT verification command passes;
  - any dependency-audit failure is reported separately with current evidence and is limited to the known framework issue;
  - no uncommitted task file remains;
  - `tmp/` remains untracked and untouched;
  - no claim is made that the branch is release-ready while the dependency audit remains red.

- [ ] **Step 9: Prepare the branch handoff.**

  Invoke `superpowers:finishing-a-development-branch`. Present the verified branch status and ask before pushing, opening/updating a PR, or merging. Include the image-generation prompts, tool output locations, final production asset paths, test totals, AIT entry count, and dependency-audit limitation in the handoff.
