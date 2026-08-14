# Name Entry Controls and Tower Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make touch initials entry fully operable with a direction pad and action buttons, and make the five-floor tower start at floor 1 while only its route scrolls.

**Architecture:** Keep initials state and activation inside `NameEntryScreen`, while reducing `grid-navigation.ts` to letters plus the enlarged `DEL` key. Convert the tower route into a focusable scroll viewport with a positioned inner content wrapper so its shaft, backdrop, and nodes scroll together while the surrounding tower controls remain fixed.

**Tech Stack:** React 19, TypeScript 7, CSS, Vitest 4, Testing Library, Playwright 1.62, Capacitor Android 8.5.

## Global Constraints

- Preserve direct letter and `DEL` tapping in addition to direction-pad navigation.
- `BACK` belongs in the upper-left safe area of the initials screen.
- The final keyboard row is `Y`, `Z`, and `DEL`; `DEL` spans logical columns 3 through 6.
- `선택` activates the highlighted name key; `END` sits immediately below it and remains disabled until exactly three letters exist.
- Floors remain in logical and visual order `1, 2, 3, 4, 5`; floor 1 must be visible on tower entry.
- Only the tower route may scroll; header, status, notices, and difficulty controls remain fixed.
- Hide the route scrollbar without disabling touch `pan-y`, wheel, keyboard, or programmatic scrolling.
- Do not change persistence, routes, scoring, unlocks, encounters, artwork, Android back behavior, or generated signing material.
- Preserve the user-owned untracked `tmp/` directory and never stage it.

---

### Task 1: Enlarge the Navigable Delete Key

**Files:**
- Modify: `src/ui/arcade/grid-navigation.ts`
- Test: `src/ui/arcade/grid-navigation.test.ts`

**Interfaces:**
- Consumes: `ArcadeDirection = 'up' | 'down' | 'left' | 'right'`.
- Produces: `NameKey` containing `A` through `Z` plus `DEL`, `NAME_KEY_ROWS` with a four-column `DEL`, and `moveNameKey(key, direction): NameKey` that never returns `END`.

- [ ] **Step 1: Write the failing keyboard-geometry tests**

Replace the old `END` navigation expectations and add an exact final-row contract:

```ts
import { describe, expect, it } from 'vitest';
import { NAME_KEY_ROWS, moveNameKey } from './grid-navigation';

it('gives DEL the former DEL and END width without keeping END in the grid', () => {
  expect(NAME_KEY_ROWS.at(-1)).toEqual([
    { key: 'Y', columnStart: 0, columnEnd: 0 },
    { key: 'Z', columnStart: 1, columnEnd: 1 },
    { key: 'DEL', columnStart: 2, columnEnd: 5 },
  ]);
  expect(NAME_KEY_ROWS.flat().map(({ key }) => key)).not.toContain('END');
});

it('moves from the fourth-row right side into the enlarged DEL key', () => {
  expect(moveNameKey('S', 'down')).toBe('Y');
  expect(moveNameKey('T', 'down')).toBe('Z');
  expect(moveNameKey('U', 'down')).toBe('Z');
  expect(moveNameKey('V', 'down')).toBe('DEL');
  expect(moveNameKey('W', 'down')).toBe('DEL');
  expect(moveNameKey('DEL', 'up')).toBe('V');
  expect(moveNameKey('DEL', 'right')).toBe('DEL');
  expect(moveNameKey('DEL', 'down')).toBe('DEL');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/arcade/grid-navigation.test.ts
```

Expected: FAIL because the current final row contains two-column `DEL` and two-column `END`, and `moveNameKey('W', 'down')` returns `END`.

- [ ] **Step 3: Implement the minimal key model**

Remove `END` from `NameKey` and replace the final layout row with:

```ts
export type NameKey =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'
  | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
  | 'S' | 'T' | 'U' | 'V' | 'W' | 'X'
  | 'Y' | 'Z' | 'DEL';

[
  { key: 'Y', columnStart: 0, columnEnd: 0 },
  { key: 'Z', columnStart: 1, columnEnd: 1 },
  { key: 'DEL', columnStart: 2, columnEnd: 5 },
],
```

Do not change the nearest-center navigation algorithm.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/arcade/grid-navigation.test.ts
```

Expected: all `grid-navigation` tests PASS.

- [ ] **Step 5: Commit the keyboard model**

```powershell
git add -- src/ui/arcade/grid-navigation.ts src/ui/arcade/grid-navigation.test.ts
git commit -m "refactor: enlarge initials delete key"
```

---

### Task 2: Add Touch Selection and Reposition Initials Actions

**Files:**
- Modify: `src/ui/screens/NameEntryScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Test: `src/ui/screens/NameEntryScreen.test.tsx`
- Test: `tests/e2e/app-flow.spec.ts`

**Interfaces:**
- Consumes: `NAME_KEY_ROWS`, `moveNameKey()`, `ArcadeDirectionPad`, `NameKey`, `onBack()`, and `onComplete(initials)`.
- Produces: an `이니셜 동작` group with `선택` and `END`, a top-left `BACK`, and identical activation semantics for direct taps, screen-level Enter, and the visible selection action.

- [ ] **Step 1: Write failing screen behavior tests**

Import `within` and add these behavior assertions:

```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

it('keeps direct taps and adds direction-pad selection for the highlighted key', async () => {
  const user = userEvent.setup();
  render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: '오른쪽' }));
  await user.click(screen.getByRole('button', { name: '선택' }));
  expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('B__');

  await user.click(screen.getByRole('button', { name: 'A', exact: true }));
  expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('BA_');
});

it('puts END below selection and lets selection activate the focused DEL key', async () => {
  const user = userEvent.setup();
  render(<NameEntryScreen initialValue="ABC" onBack={vi.fn()} onComplete={vi.fn()} />);

  const keyboard = screen.getByRole('group', { name: '이니셜 키보드' });
  const actions = screen.getByRole('group', { name: '이니셜 동작' });
  expect(within(keyboard).queryByRole('button', { name: 'END' })).not.toBeInTheDocument();
  expect(within(actions).getAllByRole('button').map((button) => button.textContent))
    .toEqual(['선택', 'END']);

  await user.click(screen.getByRole('button', { name: 'DEL' }));
  await user.click(screen.getByRole('button', { name: '선택' }));
  expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('A__');
});

it('places Back in the dedicated upper-left control', () => {
  render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'BACK' }))
    .toHaveClass('name-entry-screen__back');
});
```

Add a real mobile-layout journey near the first-run registration test:

```ts
test('supports touch selection with Back above the initials form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '도전 시작' }).click();
  const nameScreen = page.getByTestId('name-entry-screen');
  await expect(nameScreen).toBeVisible();

  const backBox = await page.getByRole('button', { name: 'BACK' }).boundingBox();
  const eyebrowBox = await nameScreen.locator('.eyebrow').boundingBox();
  expect(backBox).not.toBeNull();
  expect(eyebrowBox).not.toBeNull();
  expect(backBox!.y + backBox!.height).toBeLessThan(eyebrowBox!.y);

  await page.getByRole('button', { name: '오른쪽' }).click();
  await page.getByRole('button', { name: '선택' }).click();
  await page.getByRole('button', { name: 'A', exact: true }).click();
  await page.getByRole('button', { name: 'C', exact: true }).click();
  await expect(page.getByRole('status', { name: '입력한 이니셜' })).toHaveText('BAC');
  await expect(page.getByRole('button', { name: 'END' })).toBeEnabled();
});
```

Keep the existing tests for three-letter completion, button-focused Enter,
normalization, and the three-character cap.

- [ ] **Step 2: Run the name screen test and verify RED**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/screens/NameEntryScreen.test.tsx
& $npm run test:e2e -- tests/e2e/app-flow.spec.ts --grep "supports touch selection"
```

Expected: FAIL because `선택` and `이니셜 동작` do not exist, `END` is still inside the keyboard, and `BACK` still uses `onboarding-controls__back`.

- [ ] **Step 3: Implement separate activation and completion actions**

Keep `activateKey()` limited to letters and `DEL`:

```tsx
const activateKey = (key: NameKey) => {
  if (key === 'DEL') {
    setDraft((value) => value.slice(0, -1));
    return;
  }
  setDraft((value) => value.length < 3 ? `${value}${key}` : value);
};

const completeDraft = () => {
  if (draft.length === 3) onComplete(draft);
};
```

Move `BACK` directly below `ScreenBackdrop`, remove the conditional `END`
handling from keyboard rows, and render the lower controls as:

```tsx
<button className="secondary-button name-entry-screen__back" onClick={onBack} type="button">
  BACK
</button>

<div className="onboarding-controls name-entry-screen__controls">
  <ArcadeDirectionPad onDirection={moveFocus} />
  <div aria-label="이니셜 동작" className="name-entry-screen__actions" role="group">
    <button
      className="name-entry-screen__select"
      onClick={() => activateKey(focusedKey)}
      type="button"
    >
      선택
    </button>
    <button
      className="name-entry-screen__end"
      disabled={draft.length !== 3}
      onClick={completeDraft}
      type="button"
    >
      END
    </button>
  </div>
</div>
```

The screen-level Enter branch continues to call `activateKey(focusedKey)` only
when `event.target === event.currentTarget`, preventing button double-activation.

- [ ] **Step 4: Implement safe-area and action-column layout**

Add focused CSS after the existing onboarding rules:

```css
.screen-shell.name-entry-screen > .name-entry-screen__back {
  position: absolute;
  top: max(1.25rem, var(--native-close-exclusion-top, 10px));
  left: max(1.25rem, var(--safe-area-left, 0px));
  min-height: 2.45rem;
  padding: 0.42rem 0.78rem;
}

.name-entry-screen .onboarding-screen__header {
  min-height: 3rem;
  padding-left: 5.5rem;
}

.name-entry-screen__actions {
  align-self: stretch;
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(2.7rem, 1fr);
  gap: 0.55rem;
}

.name-entry-screen__select,
.name-entry-screen__end {
  min-height: 0;
}
```

Keep the shared two-column `.onboarding-controls` and direction-pad dimensions.

- [ ] **Step 5: Run initials and shared direction tests and verify GREEN**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/arcade/grid-navigation.test.ts src/ui/arcade/ArcadeDirectionPad.test.tsx src/ui/screens/NameEntryScreen.test.tsx
& $npm run test:e2e -- tests/e2e/app-flow.spec.ts --grep "supports touch selection"
& $npm run typecheck
```

Expected: all focused tests and typecheck PASS with no warnings.

- [ ] **Step 6: Commit the touch initials screen**

```powershell
git add -- src/ui/screens/NameEntryScreen.tsx src/ui/screens/NameEntryScreen.test.tsx src/ui/screens/screens.css tests/e2e/app-flow.spec.ts
git commit -m "feat: add touch selection to initials entry"
```

---

### Task 3: Isolate Tower Scrolling and Start at Floor One

**Files:**
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `tests/e2e/app-flow.spec.ts`
- Regenerate: `artifacts/apps-in-toss/store-media/screenshot-02-tower.png`

**Interfaces:**
- Consumes: the existing `FLOORS` order `1` through `5`, floor unlock state, continuation state, and tower assets.
- Produces: a focusable `.tower-route--scrollable` viewport containing `.tower-route__content`, whose floor nodes render and scroll in order `1` through `5` without moving `.app-shell`.

- [ ] **Step 1: Write the failing component structure test**

Extend the existing logical-order test:

```tsx
const route = screen.getByTestId('tower-route');
expect(route).toHaveClass('tower-route--scrollable');
expect(route).toHaveAttribute('tabindex', '0');
expect(route.querySelector('.tower-route__content')).toBeInTheDocument();
expect([...route.querySelectorAll<HTMLElement>('[data-floor]')].map((node) => node.dataset.floor))
  .toEqual(['1', '2', '3', '4', '5']);
```

- [ ] **Step 2: Write the failing real-layout browser test**

Add a focused Playwright test after `shows a usable tower screen in under ten seconds`:

```ts
test('starts at floor one and confines scrolling to the tower route', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE);
  await openTower(page);

  const app = page.getByTestId('app-shell');
  const route = page.getByTestId('tower-route');
  const floorOne = route.locator('[data-floor="1"]');
  const before = await route.evaluate((element) => {
    const routeRect = element.getBoundingClientRect();
    const firstRect = element.querySelector<HTMLElement>('[data-floor="1"]')!
      .getBoundingClientRect();
    const style = getComputedStyle(element);
    const webkitScrollbar = getComputedStyle(element, '::-webkit-scrollbar');
    return {
      firstVisible: firstRect.bottom > routeRect.top && firstRect.top < routeRect.bottom,
      overflowY: style.overflowY,
      routeScrollable: element.scrollHeight > element.clientHeight,
      scrollbarHidden: style.scrollbarWidth === 'none'
        || webkitScrollbar.display === 'none'
        || webkitScrollbar.width === '0px',
    };
  });

  expect(before).toEqual({
    firstVisible: true,
    overflowY: 'auto',
    routeScrollable: true,
    scrollbarHidden: true,
  });
  await expect(floorOne).toBeInViewport();

  await route.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => route.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(route.locator('[data-floor="5"]')).toBeInViewport();
  expect(await app.evaluate((element) => element.scrollTop)).toBe(0);
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/screens/TowerScreen.test.tsx
& $npm run test:e2e -- tests/e2e/app-flow.spec.ts --grep "starts at floor one"
```

Expected: the component test FAILS because the viewport class, tab stop, and
content wrapper do not exist. The browser test FAILS because the outer app
scrolls, the route uses `overflow: hidden`, and floor 5 is visually first.

- [ ] **Step 4: Add a scroll viewport with an inner tower-content wrapper**

Make the route focusable and move its backdrop, shaft, and mapped floor nodes
inside one positioned content element:

```tsx
<div
  aria-label="타워 층 선택"
  className="floor-list tower-route tower-route--ascending tower-route--scrollable"
  data-testid="tower-route"
  tabIndex={0}
>
  <div className="tower-route__content">
    <ScreenBackdrop
      className="screen-backdrop--tower-route"
      image={commonAssets?.towerBackdrop}
    />
    <span aria-hidden="true" className="tower-route__shaft" />
    {FLOORS.map((floor, index) => {
      const historicallyUnlocked = floor <= activeProgress.highestUnlockedFloor;
      const unlocked = historicallyUnlocked && (!runActive || floor === requiredFloor);
      const cleared = activeProgress.clearedFloors[floor];
      const status = runActive
        ? floor === requiredFloor ? '현재 도전 층' : `진행 순서 잠김 · 다음 ${requiredFloor}층`
        : cleared ? '클리어 완료 · 재도전 가능' : unlocked ? '도전 가능' : '잠김';
      const statusId = `floor-${floor}-status`;
      const floorContinuation = continuation?.kind === 'floor'
        && continuation.floor === floor
        ? continuation
        : null;
      const owlContinuation = continuation?.kind === 'owl' && floor === 5;
      const actionLabel = floorContinuation !== null
        ? `${floor}층 ${floorContinuation.encounterIndex + 1}번째 상대부터 계속`
        : owlContinuation
          ? '최종전 계속'
          : `${floor}층 선택`;
      return (
        <div
          className={`tower-node tower-node--${index % 2 === 0 ? 'left' : 'right'} ${
            cleared ? 'tower-node--cleared' : unlocked ? 'tower-node--open' : 'tower-node--locked'
          }`}
          data-floor={floor}
          key={floor}
        >
          <span aria-hidden="true" className="tower-node__marker">
            {String(floor).padStart(2, '0')}층
          </span>
          <div className="tower-node__card">
            <div className="tower-node__title">
              <span>{floor === 5 ? '마왕의 왕좌' : `${floor}층 관문`}</span>
              <small>3연전</small>
            </div>
            <CharacterStrip
              activeIndex={floorContinuation?.encounterIndex ?? 0}
              encounters={getFloorEncounters(floor)}
              rivals={commonAssets?.rivals ?? {}}
              unlocked={unlocked}
            />
            <button
              aria-describedby={statusId}
              aria-label={actionLabel}
              className="floor-card"
              disabled={!unlocked}
              onClick={() => onSelectFloor(floor)}
              type="button"
            >
              <span>{actionLabel}</span>
              <small id={statusId}>{status}</small>
            </button>
          </div>
        </div>
      );
    })}
  </div>
</div>
```

Only the wrapper location changes; keep every current floor calculation and
button callback unchanged.

- [ ] **Step 5: Move scroll ownership into the route**

Replace the reverse/clipped route layout with these responsibilities:

```css
.tower-screen {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.tower-route {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: 0;
  scrollbar-width: none;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.tower-route::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.tower-route__content {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 0.7rem;
  padding: 1.2rem 0.5rem 1.25rem;
}

.tower-route__content > .tower-node,
.tower-route__content > .tower-route__shaft {
  z-index: 1;
}
```

Retain the route border, background, shadow, backdrop, shaft, and node styles.
Remove `flex-direction: column-reverse`, the `31rem` minimum height, direct-route
padding, and `overflow: hidden` from the old rule.

- [ ] **Step 6: Run tower unit and browser tests and verify GREEN**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test -- src/ui/screens/TowerScreen.test.tsx
& $npm run test:e2e -- tests/e2e/app-flow.spec.ts --grep "starts at floor one"
& $npm run typecheck
```

Expected: component tests PASS, both configured mobile browser projects PASS,
the route scrolls to floor 5, and `.app-shell` stays at `scrollTop = 0`.

- [ ] **Step 7: Refresh and validate the tracked tower store screenshot**

Run:

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm run capture:store-media
& $npm run check:store-media
git status --short -- artifacts/apps-in-toss/store-media
```

Expected: capture and validation PASS. The tower screenshot shows the fixed
header and floor 1 at the beginning of the internal route; unrelated title and
battle media remain visually unchanged.

- [ ] **Step 8: Commit isolated tower scrolling**

```powershell
git add -- src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx src/ui/screens/screens.css tests/e2e/app-flow.spec.ts artifacts/apps-in-toss/store-media
git commit -m "fix: start tower at floor one"
```

---

### Task 4: Verify and Publish the Updated Delivery Branch

**Files:**
- Verify tracked source at current `HEAD`.
- Regenerate ignored: `artifacts/ait/game.ait`
- Regenerate ignored: `artifacts/android/teppu-1.0.0-release.apk`
- Regenerate ignored: `artifacts/android/emulator/**`

**Interfaces:**
- Consumes: all committed source changes, existing Android signing state, API 36 AVD `Teppu_API_36`, and the Apps-in-Toss packaging scripts.
- Produces: fresh unit, browser, AIT, signed APK, and emulator evidence for the same commit pushed to PR #6.

- [ ] **Step 1: Run the complete browser and TypeScript gates**

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm test
& $npm run test:e2e
& $npm run typecheck
& $npm run check:store-media
```

Expected: all Vitest files, both Playwright mobile projects, and TypeScript PASS.

- [ ] **Step 2: Rebuild and verify the Apps-in-Toss artifact**

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm run build:ait
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Expected: the build completes and the explicit verifier ends with `AIT_OK`.

- [ ] **Step 3: Rebuild and verify the signed Android release**

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
& $npm run test:android-contract
& $npm run build:android:release
& $npm run verify:android:release
```

Expected: 27 Android contract tests PASS and release verification ends with
`TEPPU_ANDROID_RELEASE_VERIFIED` for package `io.github.ohe1013.teppu`.

- [ ] **Step 4: Run the API 36 emulator journey**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/android/Invoke-AndroidSmoke.ps1 `
  -Apk artifacts/android/teppu-1.0.0-release.apk
```

Expected: the output ends with `TEPPU_ANDROID_SMOKE_OK`, captures title, tower,
and battle screens, and reports no fatal application log.

- [ ] **Step 5: Confirm repository hygiene**

```powershell
git diff --check
git status --short --branch
git log -4 --oneline
```

Expected: the branch contains the design, plan, initials, and tower commits;
generated artifacts remain ignored; the only unrelated entry is `?? tmp/`.

- [ ] **Step 6: Push the branch and verify PR #6 head**

```powershell
git push origin feat/pve-delivery
git rev-parse HEAD
git rev-parse origin/feat/pve-delivery
```

Expected: both SHAs match and GitHub PR #6 updates from
`feat/pve-delivery` into `master`.
