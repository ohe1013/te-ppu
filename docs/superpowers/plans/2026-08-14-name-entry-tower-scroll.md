# Back Touch and Current-Floor Tower Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the initials `BACK` button respond to a real touch and restore the tower as a bottom-to-top climb whose internal viewport opens at the player's current floor.

**Architecture:** Keep the existing initials and tower component boundaries. Fix the initials defect at the CSS stacking boundary, then let `TowerScreen` derive a target floor from continuation state or `requiredFloor` and align only the route element after layout; retain logical DOM order `1..5` while CSS reverses the physical column to `5..1`.

**Tech Stack:** React 19, TypeScript 7, CSS, Vitest 4, Testing Library, Playwright 1.62, Apps-in-Toss packaging, Capacitor Android 8.5.

## Global Constraints

- Preserve the already-delivered direction-pad, selection, enlarged `DEL`, and `END` initials controls.
- `BACK` remains in the upper-left safe area and its center must resolve to the button during real hit testing.
- Keep floors in logical DOM order `1, 2, 3, 4, 5` and physical top-to-bottom order `5, 4, 3, 2, 1`.
- Target precedence is suspended floor encounter, then suspended owl at floor 5, then `requiredFloor`.
- Align the target floor near the lower edge only on mount or target change; never override subsequent manual scrolling.
- Only `.tower-route` may scroll; the app shell, header, status, notices, and difficulty controls remain fixed.
- Keep the tower scrollbar hidden without disabling touch, wheel, keyboard, or programmatic scrolling.
- Do not change persistence, scoring, unlocks, encounters, rival order, artwork, app routes, or Android back behavior.
- Preserve the user-owned untracked `tmp/` directory and never inspect, modify, or stage it.

---

### Task 1: Make the Upper-Left Back Control Own Its Touch Target

**Files:**
- Modify: `tests/e2e/app-flow.spec.ts`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- Consumes: the existing `.name-entry-screen__back`, `.onboarding-screen__header`, and `NameEntryScreen.onBack` route callback.
- Produces: a `BACK` control above the header's stacking layer with unchanged geometry and routing behavior.

- [ ] **Step 1: Split the initials browser coverage and write a failing physical-touch regression**

Keep the existing touch-selection journey as its own test. Add a focused test that uses the rendered button center instead of Playwright's semantic click:

```ts
test('returns to title when the visible initials Back control is touched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '도전 시작' }).click();
  await expect(page.getByTestId('name-entry-screen')).toBeVisible();

  const back = page.getByRole('button', { name: 'BACK' });
  const box = await back.boundingBox();
  expect(box).not.toBeNull();
  const center = {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      buttonText: element?.closest('button')?.textContent?.trim() ?? null,
      tagName: element?.tagName ?? null,
    };
  }, center);

  expect(hit).toEqual({ buttonText: 'BACK', tagName: 'BUTTON' });
  await page.touchscreen.tap(center.x, center.y);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('name-entry-screen')).toHaveCount(0);
});
```

The production mutation this catches is removing the back button's stacking precedence, which lets the later full-width header intercept the touch.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/app-flow.spec.ts --grep "visible initials Back"
```

Expected: FAIL because `document.elementFromPoint()` reports the header rather than the button and the physical tap leaves the app on name entry.

- [ ] **Step 3: Raise only the back control's stacking level**

Extend the existing selector without changing its placement:

```css
.screen-shell.name-entry-screen > .name-entry-screen__back {
  z-index: 2;
}
```

The shared `.screen-shell` child rule gives the header `z-index: 1`; the explicit `2` ensures transparent header space cannot intercept the back control.

- [ ] **Step 4: Run the focused browser and initials component tests and verify GREEN**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/app-flow.spec.ts --grep "initials Back|touch selection"
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/screens/NameEntryScreen.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: both configured mobile-browser projects return to title on the coordinate tap, existing touch initials input still passes, the component suite passes, and TypeScript reports no errors.

- [ ] **Step 5: Commit the back hit-target correction**

```powershell
git add -- tests/e2e/app-flow.spec.ts src/ui/screens/screens.css
git commit -m "fix: restore initials back touch target"
```

---

### Task 2: Restore the Bottom-Up Tower and Align It to Current Progress

**Files:**
- Modify: `tests/e2e/app-flow.spec.ts`
- Modify: `tests/e2e/portrait-layout.spec.ts`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Test: `src/ui/screens/TowerScreen.test.tsx`

**Interfaces:**
- Consumes: `continuation: TowerContinuation`, `requiredFloor: Floor`, the existing `FLOORS` array, and the scrollable route DOM element.
- Produces: `targetFloor: Floor`, a route ref, and a one-time layout effect that sets only `route.scrollTop`.

- [ ] **Step 1: Replace the top-down browser expectation with a failing bottom-up contract**

Update the tower test to derive physical order from bounding rectangles and assert floor 1 is aligned near the lower route edge on a fresh run:

```ts
const metrics = await route.evaluate((element) => {
  const routeRect = element.getBoundingClientRect();
  const floorOneRect = element.querySelector<HTMLElement>('[data-floor="1"]')!
    .getBoundingClientRect();
  const style = getComputedStyle(element);
  const webkitScrollbar = getComputedStyle(element, '::-webkit-scrollbar');
  return {
    appTargetGap: routeRect.top + element.clientTop + element.clientHeight - floorOneRect.bottom,
    order: [...element.querySelectorAll<HTMLElement>('[data-floor]')]
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
      .map((node) => node.dataset.floor),
    overflowY: style.overflowY,
    routeScrollable: element.scrollHeight > element.clientHeight,
    scrollbarHidden: style.scrollbarWidth === 'none'
      || webkitScrollbar.display === 'none'
      || webkitScrollbar.width === '0px',
    scrollTop: element.scrollTop,
  };
});

expect(metrics.order).toEqual(['5', '4', '3', '2', '1']);
expect(metrics.appTargetGap).toBeGreaterThanOrEqual(-1);
expect(metrics.appTargetGap).toBeLessThanOrEqual(2);
expect(metrics.scrollTop).toBeGreaterThan(0);
expect(metrics.overflowY).toBe('auto');
expect(metrics.routeScrollable).toBe(true);
expect(metrics.scrollbarHidden).toBe(true);
await expect(route.locator('[data-floor="1"]')).toBeInViewport();

await route.evaluate((element) => { element.scrollTop = 0; });
await expect(route.locator('[data-floor="5"]')).toBeInViewport();
expect(await app.evaluate((element) => element.scrollTop)).toBe(0);
```

Use a two-pixel alignment tolerance so the assertion remains independent of border rasterization while still detecting missing current-floor positioning.

- [ ] **Step 2: Add a failing resume-at-floor-two assertion**

In `resumes the same active run after visiting the title`, after clearing floor 1 and again after continuing from title, assert floor 2 is visible at the lower edge:

```ts
const expectFloorAtRouteBottom = async (floor: number) => {
  await expect.poll(() => page.getByTestId('tower-route').evaluate((element, floorNumber) => {
    const routeRect = element.getBoundingClientRect();
    const floorRect = element.querySelector<HTMLElement>(`[data-floor="${floorNumber}"]`)!
      .getBoundingClientRect();
    return routeRect.top + element.clientTop + element.clientHeight - floorRect.bottom;
  }, floor)).toBeGreaterThanOrEqual(-1);
  const gap = await page.getByTestId('tower-route').evaluate((element, floorNumber) => {
    const routeRect = element.getBoundingClientRect();
    const floorRect = element.querySelector<HTMLElement>(`[data-floor="${floorNumber}"]`)!
      .getBoundingClientRect();
    return routeRect.top + element.clientTop + element.clientHeight - floorRect.bottom;
  }, floor);
  expect(gap).toBeLessThanOrEqual(32);
};
```

Call `expectFloorAtRouteBottom(2)` immediately after entering the floor-2 tower and after returning through `도전 계속`. The 32-pixel lower-edge allowance covers the clamped `scrollTop = 0` case on a tall viewport where the target already sits at the lowest reachable position. The production mutation this catches is using floor 1 or an unrelated scroll position regardless of persisted run progress.

- [ ] **Step 3: Correct the portrait-layout scroll-direction expectations**

The first DOM card is floor 1 and the last is floor 5. With a bottom-up tower, floor 1 starts in view at a positive scroll position and revealing floor 5 moves toward zero:

```ts
expect(routeScrollTopBefore, 'floor 1 alignment should start above scroll origin')
  .toBeGreaterThan(0);
await lastFloor.scrollIntoViewIfNeeded();
expect(routeScrollTopAfter, 'floor 5 should never scroll downward within the tower route')
  .toBeLessThanOrEqual(routeScrollTopBefore);

// In the constrained viewport, moving from floor 5 back to floor 1 increases scrollTop.
expect(constrainedRouteScrollTopAfter, 'floor 1 should scroll down within the tower route')
  .toBeGreaterThan(constrainedBefore.scrollTop);
```

Keep the existing assertions that floor 5 is visible, the app shell never moves, and the route remains scrollable at 360x480. Equality is valid on a tall viewport where floor 5 is already completely visible and `scrollIntoViewIfNeeded()` correctly performs no movement.

- [ ] **Step 4: Run the focused browser tests and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/app-flow.spec.ts --grep "tower route|resumes the same active run"
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/portrait-layout.spec.ts --grep "portrait"
```

Expected: FAIL because the current CSS physically orders floors `1..5`, starts at `scrollTop = 0`, and has no progression-target alignment.

- [ ] **Step 5: Derive the target floor and align the route after layout**

Add React hooks and route alignment to `TowerScreen`:

```tsx
import { useLayoutEffect, useRef } from 'react';

const routeRef = useRef<HTMLDivElement>(null);
const targetFloor: Floor = continuation?.kind === 'floor'
  ? continuation.floor
  : continuation?.kind === 'owl'
    ? 5
    : requiredFloor;

useLayoutEffect(() => {
  const route = routeRef.current;
  const target = route?.querySelector<HTMLElement>(`[data-floor="${targetFloor}"]`);
  if (route === null || route === undefined || target === null || target === undefined) return;

  const maximum = Math.max(0, route.scrollHeight - route.clientHeight);
  const desired = target.offsetTop + target.offsetHeight - route.clientHeight;
  route.scrollTop = Math.min(maximum, Math.max(0, desired));
}, [targetFloor]);
```

Attach `ref={routeRef}` to the existing `data-testid="tower-route"` element. Do not add scroll listeners or persistent state; the effect runs on mount and only when the derived target changes.

- [ ] **Step 6: Restore the reversed physical tower column**

Change only the inner route direction:

```css
.tower-route__content {
  flex-direction: column-reverse;
}
```

Keep the route's `overflow-y: auto`, hidden-scrollbar rules, DOM mapping order, shaft, backdrop, alternating cards, and fixed outer layout unchanged.

- [ ] **Step 7: Run focused tower verification and verify GREEN**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/screens/TowerScreen.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/app-flow.spec.ts --grep "tower route|resumes the same active run"
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e -- tests/e2e/portrait-layout.spec.ts --grep "portrait"
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: DOM order stays `1..5`, physical order is `5..1`, fresh and resumed progression targets sit at the route bottom, manual scrolling reveals the opposite end, the app shell remains fixed, and TypeScript passes.

- [ ] **Step 8: Commit the current-floor tower correction**

```powershell
git add -- tests/e2e/app-flow.spec.ts tests/e2e/portrait-layout.spec.ts src/ui/screens/TowerScreen.tsx src/ui/screens/screens.css
git commit -m "fix: align tower to current floor"
```

---

### Task 3: Refresh Store Evidence and Verify the Delivery Artifacts

**Files:**
- Regenerate: `artifacts/apps-in-toss/store-media/screenshot-02-tower.png`
- Verify ignored: `artifacts/ait/game.ait`
- Verify ignored: `artifacts/android/teppu-1.0.0-release.apk`
- Verify ignored: `artifacts/android/emulator/**`

**Interfaces:**
- Consumes: the committed UI source, existing Apps-in-Toss build scripts, Android signing configuration, and API 36 AVD `Teppu_API_36`.
- Produces: a tower screenshot matching the bottom-up/current-floor UI and fresh browser, AIT, signed APK, and emulator evidence for the same commit.

- [ ] **Step 1: Regenerate and inspect the tracked tower screenshot**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run capture:store-media
git restore --source=HEAD --worktree -- artifacts/apps-in-toss/store-media/screenshot-03-battle.png
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:store-media
git status --short -- artifacts/apps-in-toss/store-media
```

Expected: only `screenshot-02-tower.png` changes, validation passes, and visual inspection shows floor 1 at the lower part of the internally scrolling route with higher floors above it. Restore only the battle capture produced by this command; do not touch unrelated files.

- [ ] **Step 2: Commit the refreshed tower media**

```powershell
git add -- artifacts/apps-in-toss/store-media/screenshot-02-tower.png
git commit -m "test: refresh bottom-up tower store media"
```

- [ ] **Step 3: Run complete source and browser gates**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:store-media
```

Expected: all Vitest files, all Playwright mobile projects, TypeScript, and store media validation pass without warnings or errors.

- [ ] **Step 4: Rebuild and verify Apps-in-Toss and Android release artifacts**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:ait
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/verify-ait-package.mjs artifacts/ait/game.ait
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:android-contract
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:release
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run verify:android:release
```

Expected: the explicit AIT verifier ends with `AIT_OK`, all Android contract tests pass, and release verification reports package `io.github.ohe1013.teppu` with a valid release signature.

- [ ] **Step 5: Run the API 36 emulator journey**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Invoke-AndroidSmoke.ps1 -Apk artifacts/android/teppu-1.0.0-release.apk
```

Expected: output ends with `TEPPU_ANDROID_SMOKE_OK`, the journey reaches initials, tower floor 1, and battle, and no fatal app log is reported.

- [ ] **Step 6: Check repository hygiene, push, and verify PR head**

```powershell
git diff --check
git status --short --branch
git push origin feat/pve-delivery
git rev-parse HEAD
git rev-parse origin/feat/pve-delivery
```

Expected: local and remote SHAs match, PR #6 points to the pushed commit, generated artifacts remain ignored, and the only unrelated worktree entry remains `?? tmp/`.
