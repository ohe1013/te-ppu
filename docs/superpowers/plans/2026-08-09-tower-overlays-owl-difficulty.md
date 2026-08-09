# Tower overlays, upward route, owl twist, and difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix match overlay placement and NEXT readability, make the tower climb upward, add the owl hidden final match, and persist Easy/Normal/Hard progression with visual and AI difficulty changes.

**Architecture:** Keep the existing board and three-encounter floor contracts. Add a small reusable overlay shell for match UI, a pure piece-preview presenter for NEXT shapes, and a v3 progression model with per-difficulty floor state. Extend the app route/controller with `owl-reveal`, `owl-match`, and `owl-result`; the special match reuses the normal board and match loop with an explicit owl opponent descriptor.

**Tech Stack:** React 19, TypeScript 7 strict mode, Vitest + Testing Library, Playwright, CSS custom properties, existing local progress repository and asset manager.

## Global Constraints

- Preserve the authored encounter order; the third encounter of each floor remains its boss.
- Keep exactly three floor encounters; the owl is a separate hidden match after floor 5.
- Easy is the default new-save difficulty; Normal and Hard unlock only after the current difficulty's owl victory.
- Existing v2 progress must migrate to schema v3 without losing floors or settings.
- NEXT previews must render recognizable geometry without image assets.
- Match overlays must respect safe areas, be centered in the viewport, and keep focus behavior deterministic.
- Do not add SEGA/Puyo Puyo artwork, names, or copied UI assets.
- Keep the current Node engine requirement (`>=24.15.0 <25`) and existing delivery/source-policy gates.

---

### Task 1: Create the shared match overlay contract

**Files:**
- Create: `src/ui/match/ModalOverlay.tsx`
- Modify: `src/ui/match/SettingsPanel.tsx`
- Modify: `src/ui/match/ExitConfirmation.tsx`
- Modify: `src/ui/match/ResumeCountdown.tsx`
- Modify: `src/ui/match/match-layout.css`
- Test: `src/ui/match/lifecycle-ui.test.tsx`

**Interfaces:**
- `ModalOverlayProps = { open: boolean; labelledBy?: string; role?: 'dialog' | 'status'; modal?: boolean; className?: string; children: ReactNode }`.
- `ModalOverlay` renders a fixed, safe-area-padded scrim and a centered content surface. Interactive dialogs get `aria-modal`; status overlays remain non-interactive.
- `SettingsPanel` continues to expose the same settings callbacks and trigger, but its open content uses the shared overlay.
- `ExitConfirmation` keeps `idle/closing/failed`, timeout, retry, Escape, and focus restoration behavior.

- [ ] **Step 1: Write the failing overlay tests**

Add tests that open the settings UI and assert a `.modal-overlay`/dialog surface exists with a centered-overlay class, and render `ResumeCountdown` with `3` to assert the shared status layer and non-interactive surface. Add a regression assertion that the settings dialog is not the old fixed top-right panel.

```tsx
await user.click(screen.getByRole('button', { name: '설정' }));
expect(screen.getByRole('dialog', { name: '게임 설정' })).toHaveClass('modal-overlay__surface');
expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
expect(screen.getByRole('status')).toHaveClass('modal-overlay');
```

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run `npm test -- src/ui/match/lifecycle-ui.test.tsx`. It must fail because the existing settings panel and countdown do not use the shared overlay contract.

- [ ] **Step 3: Implement the minimal shared overlay and migrate the three consumers**

Use a fixed `inset: 0` shell with `padding: max(1rem, var(--safe-area-...))`, `display: grid`, and `place-items: center`. Keep the existing dialog focus logic in `ExitConfirmation`; add the same open/close focus return and Escape behavior to settings. Close settings from its explicit close button and scrim/Escape. Move the settings content outside header positioning through a portal only if the existing DOM stacking requires it; the CSS contract must work when rendered beneath `.match-screen`.

- [ ] **Step 4: Run the focused lifecycle tests and the typecheck**

Run `npm test -- src/ui/match/lifecycle-ui.test.tsx` and `npm run typecheck`. Both must pass before continuing.

- [ ] **Step 5: Commit the overlay slice**

```powershell
git add src/ui/match/ModalOverlay.tsx src/ui/match/SettingsPanel.tsx src/ui/match/ExitConfirmation.tsx src/ui/match/ResumeCountdown.tsx src/ui/match/match-layout.css src/ui/match/lifecycle-ui.test.tsx
git commit -m "fix: center match overlays and countdown"
```

### Task 2: Render shaped NEXT previews

**Files:**
- Create: `src/ui/match/piece-preview.tsx`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/match-layout.css`
- Test: `src/ui/match/BattleHud.test.tsx` (create if absent)

**Interfaces:**
- `PIECE_PREVIEW_CELLS: Readonly<Record<PieceKind, readonly [number, number][]>>`.
- `PiecePreview({ kind, image, item })` renders a 4x4 grid with four visible cells and an accessible piece label.
- `BattleHud` keeps `data-kind`, `data-item`, `data-testid="*-next"`, and the existing tile asset prop.

- [ ] **Step 1: Write the failing shape tests**

Render one `BattleHud` with a public side view containing `I` and `T` next pieces and no tile assets. Assert the labels are visible and each preview has four shape cells with the expected grid placement. Assert every piece kind maps to four cells.

- [ ] **Step 2: Run the focused HUD test and verify it fails**

Run `npm test -- src/ui/match/BattleHud.test.tsx`. It must fail because the current HUD only renders color backgrounds and hides the piece label.

- [ ] **Step 3: Implement the pure preview presenter and integrate it**

Render cell spans from the immutable geometry map, keep the optional `AssetImage` behind or beside the shape as an enhancement, and make the kind label visible at the edge of the tile without relying on hue. Keep item outline styles readable over every kind.

- [ ] **Step 4: Verify HUD tests, existing match tests, and typecheck**

Run `npm test -- src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.test.tsx` and `npm run typecheck`.

- [ ] **Step 5: Commit the NEXT slice**

```powershell
git add src/ui/match/piece-preview.tsx src/ui/match/BattleHud.tsx src/ui/match/match-layout.css src/ui/match/BattleHud.test.tsx
git commit -m "feat: show shaped next-piece previews"
```

### Task 3: Add schema-v3 difficulty progress

**Files:**
- Create: `src/progression/difficulty.ts`
- Modify: `src/progression/schema.ts`
- Modify: `src/progression/tower.ts`
- Modify: `src/progression/index.ts`
- Modify: `src/app/towerController.ts`
- Tests: `tests/progression/schema.test.ts`, `tests/progression/tower.test.ts`, `tests/app/towerController.test.ts`

**Interfaces:**
- `Difficulty = 'easy' | 'normal' | 'hard'`.
- `DifficultyRunProgress = { highestUnlockedFloor: Floor; clearedFloors: ClearedFloors; owlDefeated: boolean }`.
- `ProgressState = { schemaVersion: 3; selectedDifficulty: Difficulty; unlockedDifficulties: Record<Difficulty, boolean>; difficultyProgress: Record<Difficulty, DifficultyRunProgress>; settings: ... }`.
- `getDifficultyProgress(progress, difficulty): DifficultyRunProgress`.
- `canSelectDifficulty(progress, difficulty): boolean`.
- `unlockNextDifficulty(progress, difficulty): ProgressState`.
- `markOwlDefeated(progress): ProgressState`.

- [ ] **Step 1: Write failing migration and difficulty tests**

Cover default Easy, v2-to-v3 migration preserving the v2 floor state under Easy, independent Normal/Hard state, locked difficulty selection, floor completion against the selected difficulty, and idempotent owl unlock.

```ts
const migrated = parsePersistedProgress(version2State);
expect(migrated?.state.selectedDifficulty).toBe('easy');
expect(migrated?.state.difficultyProgress.easy.clearedFloors[3]).toBe(true);
expect(migrated?.state.unlockedDifficulties.normal).toBe(false);
```

- [ ] **Step 2: Run focused progression tests and verify the expected failure**

Run `npm test -- tests/progression/schema.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts`. The new assertions must fail against schema v2 and the shared floor fields.

- [ ] **Step 3: Implement v3 parsing, cloning, migration, and active-difficulty helpers**

Update exact-object validation for v3, initialize all three difficulty records, map v2 fields to Easy, and make `applyFloorResult`/`canSelectFloor` read the selected difficulty record. Preserve corrupted-save recovery and settings save behavior.

- [ ] **Step 4: Update TowerController to clone and persist nested difficulty state**

Replace shallow progress cloning with a complete nested clone. `startFloor` checks the active difficulty's floor unlock; floor wins update only that run. Add controller methods for selecting difficulty and marking owl defeat, returning existing save error shapes where applicable.

- [ ] **Step 5: Run focused progression tests and typecheck**

Run the three focused test files and `npm run typecheck`; fix production code until all pass.

- [ ] **Step 6: Commit the progression slice**

```powershell
git add src/progression/difficulty.ts src/progression/schema.ts src/progression/tower.ts src/progression/index.ts src/app/towerController.ts tests/progression/schema.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts
git commit -m "feat: persist independent difficulty tower progress"
```

### Task 4: Scale AI by difficulty and add the owl opponent descriptor

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/ai/profiles.ts`
- Modify: `src/ai/index.ts`
- Create: `src/progression/owl.ts`
- Modify: `src/assets/types.ts` only if the special character type needs an explicit union member
- Tests: `tests/ai/profiles.test.ts`, `src/progression/owl.test.ts`

**Interfaces:**
- `getAiFloorProfile(floor, difficulty = 'easy'): AiFloorProfile`.
- `OWL_ENCOUNTER` exposes display name, title, intro, win line, loss line, and the `owl-companion` asset identity without changing the three-floor encounter arrays.
- Easy returns the current profile values; Normal and Hard apply centralized monotonic modifiers.

- [ ] **Step 1: Write failing profile and owl descriptor tests**

Assert Easy equals the current profile for every floor, reaction ticks do not increase in Normal/Hard, Hard has at least as much lookahead as Easy, and the owl descriptor names the mascot as the hidden tower architect.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run `npm test -- tests/ai/profiles.test.ts src/progression/owl.test.ts` and confirm the two-argument profile lookup and owl descriptor are not implemented.

- [ ] **Step 3: Implement difficulty profile derivation and the owl descriptor**

Keep the base profiles immutable. Return cloned profiles with bounded modifiers so the existing `AiFloorProfile` union remains valid. Use the common owl asset in UI resolution rather than adding a required authored rival bundle.

- [ ] **Step 4: Run focused AI/progression tests and typecheck**

Run the focused tests and `npm run typecheck`.

- [ ] **Step 5: Commit the AI/owl data slice**

```powershell
git add src/ai/types.ts src/ai/profiles.ts src/ai/index.ts src/progression/owl.ts src/progression/owl.test.ts tests/ai/profiles.test.ts src/assets/types.ts
git commit -m "feat: add difficulty AI profiles and owl encounter"
```

### Task 5: Add owl reveal/match/result routes and controller transitions

**Files:**
- Modify: `src/app/app-route.ts`
- Modify: `src/app/towerController.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Create: `src/ui/screens/OwlRevealScreen.tsx`
- Create: `src/ui/screens/OwlResultScreen.tsx` only if the existing result screen cannot express the special flow
- Modify: `src/ui/screens/EndingScreen.tsx`
- Tests: `src/app/app-route.test.ts`, `tests/app/towerController.test.ts`, `src/ui/screens/OwlRevealScreen.test.tsx`

**Interfaces:**
- Routes: `{ name: 'owl-reveal' }`, `{ name: 'owl-match'; seed: number }`, `{ name: 'owl-result'; result: MatchResult }`, and `{ name: 'ending' }`.
- Events: `start-owl-match`, `owl-match-finished`, `select-difficulty` as needed.
- `MatchScreen` accepts an optional special-opponent descriptor; normal floor routes still resolve through `getFloorEncounter`.
- `TowerController.startOwlMatch(seed)` and `completeOwlMatch(result)` reuse the existing match/AI lifecycle and persist `owlDefeated` on win.

- [ ] **Step 1: Write failing route/controller tests**

Assert a floor-5 boss win continues to owl reveal instead of ending, owl reveal starts a special match, owl loss returns to retryable owl result/reveal, owl win reaches ending and unlocks Normal after Easy, and a non-final floor still returns to the tower. Add a UI test for the reveal copy and primary action.

- [ ] **Step 2: Run route/controller/reveal tests and verify the expected failure**

Run `npm test -- src/app/app-route.test.ts tests/app/towerController.test.ts src/ui/screens/OwlRevealScreen.test.tsx` and confirm current route reduction ends immediately after floor 5.

- [ ] **Step 3: Implement route and controller state transitions**

Keep floor result behavior unchanged until the third floor-5 win. On that win, persist the floor result, then route to `owl-reveal`. The owl match uses floor 5 background, the selected difficulty, an owl opponent descriptor, and the standard board. On win, mark the owl defeated and unlock only the next difficulty.

- [ ] **Step 4: Integrate AppRoot and MatchScreen without duplicating the board**

Pass active difficulty into `TowerScreen`, `FloorIntroScreen`, `MatchScreen`, `ResultScreen`, and `EndingScreen`. Resolve owl artwork from `commonAssets.owl`, use owl portrait fallbacks, and avoid indexing `commonAssets.rivals` with an invalid floor-opponent ID.

- [ ] **Step 5: Run focused route/controller/UI tests and typecheck**

Run the focused tests and `npm run typecheck`. Confirm all old three-fight tests are updated only where the new owl transition intentionally changes the contract.

- [ ] **Step 6: Commit the owl journey slice**

```powershell
git add src/app/app-route.ts src/app/towerController.ts src/app/AppRoot.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/OwlRevealScreen.tsx src/ui/screens/OwlResultScreen.tsx src/ui/screens/EndingScreen.tsx src/app/app-route.test.ts tests/app/towerController.test.ts src/ui/screens/OwlRevealScreen.test.tsx
git commit -m "feat: add hidden owl boss journey"
```

### Task 6: Implement the upward contained tower and difficulty selector

**Files:**
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`

**Interfaces:**
- `TowerScreen` receives the active difficulty, unlocked difficulty map, and a difficulty-selection callback.
- Tower route retains five `tower-node` elements with `data-floor="1"` through `"5"` in logical order.
- App shell receives `data-difficulty` and exposes CSS variables for Easy/Normal/Hard palettes.

- [ ] **Step 1: Write failing tower/difficulty UI tests**

Assert the floor nodes remain DOM-ordered 1 through 5, the route has an upward-layout class and contained shaft, the difficulty selector shows Easy selected and other options disabled on a new save, and selecting an unlocked difficulty calls the callback. Assert the app root exposes the selected difficulty attribute in the AppRoot test.

- [ ] **Step 2: Run focused screen tests and verify the expected failure**

Run `npm test -- src/ui/screens/TowerScreen.test.tsx` and the relevant AppRoot test. The current route has the external rope, no selector, and no difficulty attribute.

- [ ] **Step 3: Implement the tower layout and difficulty selector**

Preserve DOM order and use `flex-direction: column-reverse` or an equivalent grid placement so floor 1 is visually lowest. Replace the loose rope with an internal shaft/frame and move tower art into the route bounds. Add the selector above the route, keep locked choices disabled, and set `data-difficulty` on `.app-shell`.

- [ ] **Step 4: Add palette CSS and ending actions**

Define high-contrast Easy/Normal/Hard custom-property overrides. Update ending copy/actions for owl victory and next-difficulty selection while keeping a final Hard ending without a fourth option.

- [ ] **Step 5: Run focused UI tests and typecheck**

Run `npm test -- src/ui/screens/TowerScreen.test.tsx src/ui/screens/EndingScreen.test.tsx` and `npm run typecheck`.

- [ ] **Step 6: Commit the tower/difficulty UI slice**

```powershell
git add src/ui/screens/TowerScreen.tsx src/ui/screens/screens.css src/ui/screens/TowerScreen.test.tsx src/app/AppRoot.tsx src/ui/screens/EndingScreen.tsx
git commit -m "feat: render upward tower and difficulty selector"
```

### Task 7: Add integration coverage and run the full delivery gates

**Files:**
- Modify: existing Playwright specs under `e2e/` or `tests/e2e/` found by `rg --files`
- Modify: `tests/qa` only if an existing gate needs a contract fixture
- Modify: `docs/superpowers/specs/2026-08-09-tower-overlays-owl-difficulty-design.md` only to record verified deviations

- [ ] **Step 1: Write the failing E2E journey assertions**

Cover both portrait projects: centered settings/exit/countdown overlays, shaped NEXT previews, floor 1 below floor 5, floor-five boss victory leading to owl reveal, owl victory unlocking Normal, and a changed `data-difficulty`/palette after selection.

- [ ] **Step 2: Run the focused E2E tests and verify failures identify missing behavior**

Run `npm run test:e2e -- --grep "owl|difficulty|overlay|tower"` and confirm failures are from the new assertions rather than test setup.

- [ ] **Step 3: Implement only the integration fixes exposed by the tests**

Keep selectors based on existing `data-testid`/accessible labels. Do not weaken assertions to visual snapshots or color-only checks.

- [ ] **Step 4: Run the complete verification suite**

Run, in order:

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run check:assets
npm run build:web
npm run test:delivery-gates
npm run check:source-policy
```

If the AIT artifact is rebuilt, also run `npm run build:ait` and `npm run check:ait -- artifacts/ait/game.ait`. Record exact pass counts and runtime version.

- [ ] **Step 5: Inspect the final diff and commit any verification-only fixes**

Run `git diff --check`, `git status --short`, and review all changed files. Do not stage the pre-existing untracked `tmp/` directory.

- [ ] **Step 6: Push the feature branch for the existing PR**

```powershell
git push origin feat/pve-delivery
```

