# Development Cleared Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run dev` boot an isolated local profile with Easy, Normal, and Hard fully cleared while every packaged or clean-development mode retains ordinary progress.

**Architecture:** A pure progression fixture creates the cleared schema-v5 state. A configurable local repository persists that fixture under a dedicated development namespace, while a guarded application-composition option selects it only when Vite is running the explicit development-cleared mode.

**Tech Stack:** TypeScript 7, React 19, Vite 8 environment modes, Vitest 4, Node 24 contract tests, localStorage.

## Global Constraints

- `npm run dev` must start with profile `ADM`, character `hero-engineer`, selected difficulty Hard, and all three difficulties fully cleared through the owl.
- Local best scores and pending leaderboard submissions must remain empty in the initial fixture.
- `npm run dev:clean` must preserve the existing browser-development behavior.
- Development-cleared progress must use storage and backup keys disjoint from normal browser and identity-scoped progress.
- Android, Apps-in-Toss, browser production builds, and E2E must never enable development-cleared progress.
- Existing user-owned `tmp/` content must not be read, modified, staged, or deleted.
- Every behavior change follows RED-GREEN-REFACTOR and receives a focused commit.

---

### Task 1: Canonical fully-cleared development fixture

**Files:**
- Create: `tests/progression/devClearedProgress.test.ts`
- Create: `src/progression/devClearedProgress.ts`
- Modify: `src/progression/index.ts`

**Interfaces:**
- Consumes: `DEFAULT_PROGRESS`, `cloneProgressState`, `DIFFICULTIES`, `FLOORS`, and `ProgressState` from progression modules.
- Produces: `createDevClearedProgress(): ProgressState`.

- [ ] **Step 1: Write the failing fixture test**

Create `tests/progression/devClearedProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createDevClearedProgress,
  DIFFICULTIES,
  FLOORS,
  parseProgressState,
} from '../../src/progression';

describe('createDevClearedProgress', () => {
  it('creates a valid ADM profile with Hard and every tower challenge cleared', () => {
    const progress = createDevClearedProgress();

    expect(parseProgressState(progress)).toEqual(progress);
    expect(progress.profile).toEqual({
      initials: 'ADM',
      characterId: 'hero-engineer',
    });
    expect(progress.selectedDifficulty).toBe('hard');
    expect(progress.unlockedDifficulties).toEqual({
      easy: true,
      normal: true,
      hard: true,
    });
    for (const difficulty of DIFFICULTIES) {
      expect(progress.difficultyProgress[difficulty]).toEqual({
        highestUnlockedFloor: 5,
        clearedFloors: Object.fromEntries(FLOORS.map((floor) => [floor, true])),
        owlDefeated: true,
      });
    }
  });

  it('does not fabricate local or pending leaderboard scores', () => {
    const progress = createDevClearedProgress();

    expect(progress.localBestScores).toEqual({
      easy: null,
      normal: null,
      hard: null,
    });
    expect(progress.pendingLeaderboardSubmissions).toEqual({});
  });

  it('returns detached state on every call', () => {
    const first = createDevClearedProgress();
    const second = createDevClearedProgress();

    first.difficultyProgress.hard.clearedFloors[1] = false;
    expect(second.difficultyProgress.hard.clearedFloors[1]).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/devClearedProgress.test.ts
```

Expected: FAIL because `createDevClearedProgress` is not exported.

- [ ] **Step 3: Implement the minimal fixture**

Create `src/progression/devClearedProgress.ts`:

```ts
import { DIFFICULTIES } from './difficulty';
import { FLOORS } from './floors';
import { cloneProgressState, DEFAULT_PROGRESS, type ProgressState } from './schema';

export function createDevClearedProgress(): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.profile = { initials: 'ADM', characterId: 'hero-engineer' };
  progress.selectedDifficulty = 'hard';
  progress.unlockedDifficulties = { easy: true, normal: true, hard: true };
  for (const difficulty of DIFFICULTIES) {
    progress.difficultyProgress[difficulty] = {
      highestUnlockedFloor: 5,
      clearedFloors: Object.fromEntries(
        FLOORS.map((floor) => [floor, true]),
      ) as ProgressState['difficultyProgress']['easy']['clearedFloors'],
      owlDefeated: true,
    };
  }
  return progress;
}
```

Export the helper from `src/progression/index.ts`:

```ts
export { createDevClearedProgress } from './devClearedProgress';
```

- [ ] **Step 4: Run focused tests and type checking**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/devClearedProgress.test.ts tests/progression/schema.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the fixture**

```powershell
git add -- src/progression/devClearedProgress.ts src/progression/index.ts tests/progression/devClearedProgress.test.ts
git commit -m "feat: add cleared development progress fixture"
```

---

### Task 2: Isolated seeded progress repository

**Files:**
- Modify: `tests/progression/localProgressRepository.test.ts`
- Modify: `src/progression/localProgressRepository.ts`
- Create: `tests/progression/devClearedProgressRepositoryFactory.test.ts`
- Create: `src/progression/devClearedProgressRepositoryFactory.ts`
- Modify: `src/progression/index.ts`

**Interfaces:**
- Consumes: `createLocalProgressRepository(storage, options)`, `createDevClearedProgress()`, `UserIdentity`, and `ProgressRepositoryFactory`.
- Produces: optional `LocalProgressRepositoryOptions.initialState`, optional `persistInitialStateWhenMissing`, `createDevClearedProgressRepositoryFactory(storage): ProgressRepositoryFactory`, and `devClearedProgressStorageKeyForIdentity(identity): string`.

- [ ] **Step 1: Write failing tests for configurable initial state**

Add focused cases to `tests/progression/localProgressRepository.test.ts`:

```ts
it('persists a detached configured initial state when its isolated key is empty', async () => {
  const storage = new TestStorage();
  const initialState = createDevClearedProgress();
  const repository = createLocalProgressRepository(storage, {
    progressKey: 'te-ppu.progress.dev-cleared.identity.local.local-browser',
    backupPrefix: 'te-ppu.progress.backup.dev-cleared.identity.local.local-browser.',
    initialState,
    persistInitialStateWhenMissing: true,
  });

  const result = await repository.load();

  expect(result).toEqual({
    ok: true,
    state: initialState,
    recoveredFromCorruption: false,
  });
  expect(storage.values.get('te-ppu.progress.dev-cleared.identity.local.local-browser'))
    .toBe(JSON.stringify(initialState));
  expect(result.ok && result.state).not.toBe(initialState);
});

it('recovers corrupt isolated progress to its configured initial state', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const progressKey = 'te-ppu.progress.dev-cleared.identity.local.local-browser';
  const backupPrefix = 'te-ppu.progress.backup.dev-cleared.identity.local.local-browser.';
  const storage = new TestStorage();
  const initialState = createDevClearedProgress();
  storage.values.set(progressKey, '{broken');

  const result = await createLocalProgressRepository(storage, {
    progressKey,
    backupPrefix,
    initialState,
    persistInitialStateWhenMissing: true,
  }).load();

  expect(result).toEqual({
    ok: true,
    state: initialState,
    recoveredFromCorruption: true,
  });
  expect(storage.values.get(`${backupPrefix}${NOW}`)).toBe('{broken');
  expect(storage.values.get(progressKey)).toBe(JSON.stringify(initialState));
});
```

Add `createDevClearedProgress` to the existing test import.

- [ ] **Step 2: Run the local repository test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/localProgressRepository.test.ts
```

Expected: TypeScript/test failure because the two new options do not exist and empty storage still returns ordinary defaults without writing.

- [ ] **Step 3: Add configurable initial-state behavior**

Extend `LocalProgressRepositoryOptions` in `src/progression/localProgressRepository.ts`:

```ts
export interface LocalProgressRepositoryOptions {
  readonly progressKey: string;
  readonly backupPrefix: string;
  readonly legacyReadKey?: string;
  readonly initialState?: ProgressState;
  readonly persistInitialStateWhenMissing?: boolean;
}
```

At repository creation, clone the configured state once and use detached clones everywhere defaults were previously returned:

```ts
const initialState = cloneProgressState(options.initialState ?? DEFAULT_PROGRESS);

function defaults(): ProgressState {
  return cloneProgressState(initialState);
}
```

Replace the corruption reset write with `JSON.stringify(initialState)`. Add a helper for absent storage:

```ts
function loadInitialState(): ProgressLoadResult {
  const state = defaults();
  if (!options.persistInitialStateWhenMissing) {
    return { ok: true, state, recoveredFromCorruption: false };
  }
  try {
    storage.setItem(progressKey, JSON.stringify(initialState));
  } catch {
    return { ok: false, state, error: WRITE_FAILED };
  }
  return { ok: true, state, recoveredFromCorruption: false };
}
```

Use `loadInitialState()` whenever the canonical key and any permitted legacy key are both absent. Existing callers omit both options and therefore retain exact behavior.

- [ ] **Step 4: Verify the repository remains backward compatible**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts
```

Expected: all existing cases and the new custom-initial-state cases pass.

- [ ] **Step 5: Write failing development factory tests**

Create `tests/progression/devClearedProgressRepositoryFactory.test.ts` with a map-backed `TestStorage` matching the existing factory test utility and these cases:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  createDevClearedProgress,
  createDevClearedProgressRepositoryFactory,
  devClearedProgressStorageKeyForIdentity,
  progressStorageKeyForIdentity,
} from '../../src/progression';

const identity = { kind: 'local', key: 'local-browser' } as const;

it('uses a key disjoint from normal browser progress and seeds it once', async () => {
  const storage = new TestStorage();
  const key = devClearedProgressStorageKeyForIdentity(identity);
  const repository = createDevClearedProgressRepositoryFactory(storage).forIdentity(identity);

  expect(key).not.toBe(progressStorageKeyForIdentity(identity));
  await expect(repository.load()).resolves.toEqual({
    ok: true,
    state: createDevClearedProgress(),
    recoveredFromCorruption: false,
  });
  expect(storage.values.get(key)).toBe(JSON.stringify(createDevClearedProgress()));
  expect(storage.values.has(progressStorageKeyForIdentity(identity))).toBe(false);
});

it('reloads profile and setting changes from only the cleared namespace', async () => {
  const storage = new TestStorage();
  const factory = createDevClearedProgressRepositoryFactory(storage);
  const repository = factory.forIdentity(identity);
  const changed = createDevClearedProgress();
  changed.profile = { initials: 'TST', characterId: 'star-alchemist' };
  changed.settings.bgmVolume = 25;

  await repository.save(changed);

  await expect(repository.load()).resolves.toMatchObject({ ok: true, state: changed });
  expect(factory.forIdentity(identity)).toBe(repository);
});

it('backs up corrupt cleared data only under the cleared backup prefix', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  const storage = new TestStorage();
  const key = devClearedProgressStorageKeyForIdentity(identity);
  storage.values.set(key, '{broken');

  const result = await createDevClearedProgressRepositoryFactory(storage)
    .forIdentity(identity)
    .load();

  expect(result).toMatchObject({
    ok: true,
    state: createDevClearedProgress(),
    recoveredFromCorruption: true,
  });
  expect(storage.values.get(
    'te-ppu.progress.backup.dev-cleared.identity.local.local-browser.1700000000000',
  )).toBe('{broken');
});
```

The full file must define `TestStorage` with `getItem` and `setItem`, plus `afterEach(() => vi.restoreAllMocks())`.

- [ ] **Step 6: Run the factory test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/devClearedProgressRepositoryFactory.test.ts
```

Expected: FAIL because the development factory and key function do not exist.

- [ ] **Step 7: Implement the isolated factory**

Create `src/progression/devClearedProgressRepositoryFactory.ts`:

```ts
import type { UserIdentity } from '../platform/platform-port';
import { createDevClearedProgress } from './devClearedProgress';
import { createLocalProgressRepository } from './localProgressRepository';
import type { ProgressRepositoryFactory } from './progressRepositoryFactory';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

const IDENTITY_PREFIX = 'te-ppu.progress.dev-cleared.identity.';
const BACKUP_PREFIX = 'te-ppu.progress.backup.dev-cleared.identity.';

function identitySuffix(identity: UserIdentity): string {
  if (identity.kind === 'local') return 'local.local-browser';
  if (identity.key.trim().length === 0) {
    throw new RangeError('Apps-in-Toss identity key must be nonblank.');
  }
  return `apps-in-toss.${encodeURIComponent(identity.key)}`;
}

export function devClearedProgressStorageKeyForIdentity(identity: UserIdentity): string {
  return `${IDENTITY_PREFIX}${identitySuffix(identity)}`;
}

export function createDevClearedProgressRepositoryFactory(
  storage: ProgressStorage,
): ProgressRepositoryFactory {
  const repositories = new Map<string, ReturnType<typeof createLocalProgressRepository>>();
  return {
    forIdentity(identity) {
      const suffix = identitySuffix(identity);
      const progressKey = `${IDENTITY_PREFIX}${suffix}`;
      const cached = repositories.get(progressKey);
      if (cached !== undefined) return cached;
      const repository = createLocalProgressRepository(storage, {
        progressKey,
        backupPrefix: `${BACKUP_PREFIX}${suffix}.`,
        initialState: createDevClearedProgress(),
        persistInitialStateWhenMissing: true,
      });
      repositories.set(progressKey, repository);
      return repository;
    },
  };
}
```

Export both public functions from `src/progression/index.ts`.

- [ ] **Step 8: Run the complete progression-focused verification**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/devClearedProgress.test.ts tests/progression/devClearedProgressRepositoryFactory.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts tests/progression/schema.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 9: Commit repository isolation**

```powershell
git add -- src/progression/localProgressRepository.ts src/progression/devClearedProgressRepositoryFactory.ts src/progression/index.ts tests/progression/localProgressRepository.test.ts tests/progression/devClearedProgressRepositoryFactory.test.ts
git commit -m "feat: isolate cleared development progress"
```

---

### Task 3: Development-only mode guard and application composition

**Files:**
- Create: `src/app/dev-cleared-mode.test.ts`
- Create: `src/app/dev-cleared-mode.ts`
- Modify: `src/app/app-services.test.ts`
- Modify: `src/app/app-services.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `RuntimeMode`, `createDevClearedProgressRepositoryFactory`, Vite `DEV`, `MODE`, and `VITE_DEV_ALL_CLEARED`.
- Produces: `isDevClearedProgressEnabled(input): boolean` and `AppServiceOptions.devClearedProgress?: boolean`.

- [ ] **Step 1: Write the failing mode-guard test**

Create `src/app/dev-cleared-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isDevClearedProgressEnabled } from './dev-cleared-mode';

describe('isDevClearedProgressEnabled', () => {
  it('enables only an explicit dedicated-mode browser development request', () => {
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(true);
    for (const mode of ['browser', 'e2e']) {
      expect(isDevClearedProgressEnabled({
        isDev: true,
        mode,
        runtimeMode: 'browser',
        flag: 'true',
      })).toBe(false);
    }
    expect(isDevClearedProgressEnabled({
      isDev: false,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'android',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'apps-in-toss',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: undefined,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the mode test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/app/dev-cleared-mode.test.ts
```

Expected: FAIL because `dev-cleared-mode.ts` does not exist.

- [ ] **Step 3: Implement the pure guard**

Create `src/app/dev-cleared-mode.ts`:

```ts
import type { RuntimeMode } from './runtime-mode';

export interface DevClearedModeInput {
  readonly isDev: boolean;
  readonly mode: string;
  readonly runtimeMode: RuntimeMode;
  readonly flag: string | undefined;
}

export function isDevClearedProgressEnabled({
  isDev,
  mode,
  runtimeMode,
  flag,
}: DevClearedModeInput): boolean {
  return isDev
    && mode === 'dev-cleared'
    && runtimeMode === 'browser'
    && flag === 'true';
}
```

- [ ] **Step 4: Verify the guard GREEN**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/app/dev-cleared-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing application-composition tests**

In `src/app/app-services.test.ts`, add a map-backed storage helper and two tests:

```ts
it('selects isolated cleared progress only when explicitly requested', async () => {
  const storage = createMemoryStorage();
  const services = createAppServices(
    'browser',
    storage,
    { platform: platform(), firebaseEnv: {} },
    { devClearedProgress: true },
  );

  const result = await services.progressRepositoryFactory
    .forIdentity({ kind: 'local', key: 'local-browser' })
    .load();

  expect(result.ok && result.state.profile?.initials).toBe('ADM');
  expect(result.ok && result.state.selectedDifficulty).toBe('hard');
});

it('keeps the ordinary progress factory when cleared progress is not requested', async () => {
  const storage = createMemoryStorage();
  const services = createAppServices(
    'browser',
    storage,
    { platform: platform(), firebaseEnv: {} },
  );

  const result = await services.progressRepositoryFactory
    .forIdentity({ kind: 'local', key: 'local-browser' })
    .load();

  expect(result.ok && result.state).toEqual(DEFAULT_PROGRESS);
});
```

`createMemoryStorage()` must return a `Storage`-compatible object whose `getItem` and `setItem` use one private `Map<string, string>`; unused `Storage` methods can be `vi.fn()` implementations.

- [ ] **Step 6: Run composition tests and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/app/app-services.test.ts
```

Expected: FAIL because the fourth options argument and cleared factory selection do not exist.

- [ ] **Step 7: Wire the guarded option into services and main**

In `src/app/app-services.ts`, add:

```ts
export interface AppServiceOptions {
  readonly devClearedProgress?: boolean;
}
```

Add `options: AppServiceOptions = {}` as the fourth `createAppServices` parameter. Preserve explicit test/service overrides, then select the factory:

```ts
progressRepositoryFactory: overrides.progressRepositoryFactory
  ?? (options.devClearedProgress
    ? createDevClearedProgressRepositoryFactory(storage)
    : createLocalProgressRepositoryFactory(storage)),
```

In `src/main.tsx`, resolve the option once:

```ts
const devClearedProgress = isDevClearedProgressEnabled({
  isDev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  runtimeMode,
  flag: import.meta.env.VITE_DEV_ALL_CLEARED,
});
```

Pass it as the fourth service argument:

```ts
const services = createAppServices(
  runtimeMode,
  window.localStorage,
  serviceOverrides,
  { devClearedProgress },
);
```

- [ ] **Step 8: Run focused application verification**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/app/dev-cleared-mode.test.ts src/app/app-services.test.ts src/app/AppRoot.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 9: Commit application composition**

```powershell
git add -- src/app/dev-cleared-mode.test.ts src/app/dev-cleared-mode.ts src/app/app-services.test.ts src/app/app-services.ts src/main.tsx
git commit -m "feat: compose cleared local development mode"
```

---

### Task 4: Observable `npm run dev` and `npm run dev:clean` behavior

**Files:**
- Create: `tests/dev-modes/dev-cleared.spec.ts`
- Create: `tests/dev-modes/dev-clean.spec.ts`
- Create: `playwright.dev-modes.config.ts`
- Create: `.env.dev-cleared`
- Modify: `src/vite-env.d.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Vite environment mode loading, the guarded `VITE_DEV_ALL_CLEARED` flag, and the real application UI.
- Produces: `npm run dev`, `npm run dev:clean`, and `npm run test:dev-modes` with browser-observable assertions.

- [ ] **Step 1: Write failing browser tests for both development commands**

Create `tests/dev-modes/dev-cleared.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('npm run dev opens ADM with every difficulty and floor cleared', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'hard');
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  for (const difficulty of ['easy', 'normal', 'hard']) {
    await page.locator(`.difficulty-selector__option[data-difficulty="${difficulty}"]`).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', difficulty);
    await expect(page.locator('.tower-node--cleared')).toHaveCount(5);
  }
});
```

Create `tests/dev-modes/dev-clean.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('npm run dev:clean retains an ordinary fresh browser profile', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).not.toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('name-entry-screen')).toBeVisible();
});
```

Create `playwright.dev-modes.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/dev-modes',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      port: 4175,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:clean -- --host 127.0.0.1 --port 4176 --strictPort',
      port: 4176,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'dev-cleared',
      testMatch: /dev-cleared\.spec\.ts/u,
      use: { baseURL: 'http://127.0.0.1:4175' },
    },
    {
      name: 'dev-clean',
      testMatch: /dev-clean\.spec\.ts/u,
      use: { baseURL: 'http://127.0.0.1:4176' },
    },
  ],
});
```

- [ ] **Step 2: Run both real commands and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec playwright test -c playwright.dev-modes.config.ts
```

Expected: FAIL before browser assertions because `dev:clean` does not exist, or the cleared project observes the ordinary Easy/profile-empty state. Either failure is caused by the missing development-mode feature.

- [ ] **Step 3: Add the explicit Vite mode and commands**

Create `.env.dev-cleared`:

```dotenv
VITE_RUNTIME_MODE=browser
VITE_DEV_ALL_CLEARED=true
```

Add the optional type to `src/vite-env.d.ts`:

```ts
readonly VITE_DEV_ALL_CLEARED?: string;
```

Update `package.json` scripts exactly:

```json
"dev": "vite --host 0.0.0.0 --mode dev-cleared",
"dev:clean": "vite --host 0.0.0.0 --mode browser",
"test:dev-modes": "playwright test -c playwright.dev-modes.config.ts"
```

Do not modify `.env.browser`, `.env.android`, `.env.apps`, or `.env.e2e`.

- [ ] **Step 4: Verify both development modes and types**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:dev-modes
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: the two Playwright projects pass against their real server commands and TypeScript exits 0.

- [ ] **Step 5: Commit development commands and their behavior tests**

```powershell
git add -- .env.dev-cleared src/vite-env.d.ts package.json playwright.dev-modes.config.ts tests/dev-modes/dev-cleared.spec.ts tests/dev-modes/dev-clean.spec.ts
git commit -m "build: default dev server to cleared progress"
```

---

### Task 5: End-to-end verification and handoff

**Files:**
- No source changes expected.
- Generated and ignored: `dist/**`, `artifacts/ait/game.ait`, Playwright reports.

**Interfaces:**
- Consumes: all prior tasks and existing release verification commands.
- Produces: evidence that local dev is cleared while package modes remain safe.

- [ ] **Step 1: Run all focused feature tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/progression/devClearedProgress.test.ts tests/progression/devClearedProgressRepositoryFactory.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts src/app/dev-cleared-mode.test.ts src/app/app-services.test.ts src/app/AppRoot.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:dev-modes
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: every command exits 0.

- [ ] **Step 2: Run the full automated suites**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:e2e
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:delivery-gates
```

Expected: Vitest, Playwright, and delivery gates all exit 0.

- [ ] **Step 3: Prove package builds keep the guarded path disabled**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:ait
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Expected: all builds exit 0 and the final command prints `AIT_OK`.

- [ ] **Step 4: Inspect the final branch without touching user files**

```powershell
git diff --check
git status --short --branch
git log --oneline --decorate -8
```

Expected: no unstaged feature changes; `tmp/` remains untracked and untouched.

- [ ] **Step 5: Request review, apply any validated fixes, and push**

Review the complete change from commit `738df0f` through the new HEAD for progression validity, storage isolation, release-mode gating, and test quality. After Critical and Important findings are resolved and verification is refreshed, push `feat/pve-delivery` normally and confirm the remote and PR #6 HEAD match local HEAD.
