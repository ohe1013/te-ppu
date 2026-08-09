# Identity-Aware Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every local progress load/save to the resolved `UserIdentity` through `ProgressRepositoryFactory.forIdentity(identity)` so different Apps-in-Toss HASH users cannot read or overwrite one another's device-local tower progress.

**Architecture:** Parameterize the existing local repository with explicit canonical/backup/optional-legacy keys, then place identity-to-key policy in one factory. Boot starts portrait/common-asset work alongside identity lookup, waits for identity before selecting/loading a repository, and passes that exact repository to `TowerController`. Browser identity may copy the old unkeyed local value into its new namespace; Apps-in-Toss HASH identities never adopt an unkeyed value whose owner cannot be proven.

**Tech Stack:** TypeScript 7, React 19, Vitest 4, Testing Library 16, Playwright 1.62, Node 24.15, browser `localStorage`, Apps-in-Toss web framework 2.10.8

## Global Constraints

- Keep `UserIdentity` exactly `{ kind:'local'; key:'local-browser' } | { kind:'apps-in-toss'; key:string }`; Apps-in-Toss `UPDATE_REQUIRED`, `INVALID_CATEGORY`, and `RETRYABLE_SDK_ERROR` must never fall back to a local identity.
- The canonical browser key is exactly `te-ppu.progress.identity.local.local-browser`.
- The canonical Apps-in-Toss key is exactly `te-ppu.progress.identity.apps-in-toss.${encodeURIComponent(identity.key)}`; encoding is one-to-one, so HASH values containing `/`, `%`, or Unicode cannot collide.
- Backup keys live in a namespace disjoint from every canonical key: browser-local uses exactly `te-ppu.progress.backup.identity.local.local-browser.`, and Apps-in-Toss uses exactly `te-ppu.progress.backup.identity.apps-in-toss.${encodeURIComponent(identity.key)}.`. Never derive a backup prefix by appending to a canonical key. Keep the existing unkeyed `te-ppu.progress` value untouched as reversible legacy evidence.
- A present scoped canonical value always wins. The unkeyed legacy value is considered only when the browser-local canonical key is absent.
- Browser-local first load may copy a valid unkeyed v1/v2 value into its canonical scoped key. No Apps-in-Toss HASH may automatically read, copy, rewrite, back up, or delete the unkeyed value because its owner is unknown. This is an explicit security-first tradeoff: for Apps-in-Toss, no-loss means the raw legacy recovery evidence remains untouched for rollback or manual support inspection, not automatic in-game continuity. Documentation and QA must not claim otherwise.
- There is no prior identity-scoped migration because this design has not shipped. The implementation starts with the disjoint `te-ppu.progress.backup.identity.*` namespace.
- Identity-scoped storage remains device-local. This plan does not implement or claim cross-device restore, server persistence, account transfer, conflict resolution, or backend synchronization.
- Preserve schema-v1-to-v2 migration semantics, corruption backup behavior, five-floor progression, settings, and `READ_FAILED`/`BACKUP_FAILED`/`WRITE_FAILED` result contracts.
- Preserve all non-progress `AppServices` fields introduced by other plans. Only replace the app-wide concrete `progressRepository` dependency with `progressRepositoryFactory` and carry the resolved repository in ready boot state.
- Execute in this exact order: Runtime Tasks 1–7 in `2026-08-02-runtime-asset-audio-pipeline.md` -> Identity Tasks 1–4 in this plan -> Runtime Task 8. Its boot tests preserve the already-added `assetManager.loadCommon()` fallback path and app-lifetime audio service; the sole final identity-inclusive `.ait`/evidence gate remains Runtime Task 8.
- Identity Tasks 1–3 are one atomic, unreleasable code sequence. The Task 1 and Task 2 commits are local review checkpoints only: do not hand off the branch or run an Apps-in-Toss package/build/release from either intermediate state. Task 3's green gate is the first releasable/handoffable code state; Task 4 and Runtime Task 8 are still mandatory before the final Apps package or release.
- Use the repository's supported Node range `>=24.15.0 <25`; the Windows commands below invoke Node 24.15 directly through the installed npm CLI.

---

### Task 1: Explicitly Scoped Local Repository and Conservative Legacy Copy

**Files:**
- Modify: `src/progression/localProgressRepository.ts`
- Modify: `src/progression/index.ts`
- Modify: `tests/progression/localProgressRepository.test.ts`
- Modify: `src/app/app-services.ts`

**Interfaces:**
- Consumes: existing `ProgressRepository`, `parsePersistedProgress`, `DEFAULT_PROGRESS`, and the temporary direct repository construction in `createAppServices`.
- Produces: `LocalProgressRepositoryOptions` and `createLocalProgressRepository(storage, options)` with no implicit global key; the app remains compilable between Tasks 1 and 3 through an explicit browser-local option object.

- [ ] **Step 1: Write failing scoped-read/write and legacy-policy tests**

Add this public option contract to the test imports and make every existing test supply explicit keys:

```ts
export interface LocalProgressRepositoryOptions {
  readonly progressKey: string;
  readonly backupPrefix: string;
  readonly legacyReadKey?: string;
}
```

Extend the existing `TestStorage` with `readonly reads: string[] = []` and push the key at the start of `getItem(key)`, before the configured read exception, so tests can prove a HASH repository never probes the legacy key.

Use these fixture values:

```ts
const SCOPED_KEY = 'te-ppu.progress.identity.local.local-browser';
const BACKUP_PREFIX = 'te-ppu.progress.backup.identity.local.local-browser.';
const LEGACY_KEY = 'te-ppu.progress';
const options = {
  progressKey: SCOPED_KEY,
  backupPrefix: BACKUP_PREFIX,
  legacyReadKey: LEGACY_KEY,
} satisfies LocalProgressRepositoryOptions;
```

Add focused cases proving:

```ts
it('prefers a present scoped value and never reads or rewrites legacy', async () => {
  storage.values.set(SCOPED_KEY, JSON.stringify(scopedProgress));
  storage.values.set(LEGACY_KEY, JSON.stringify(differentLegacyProgress));

  expect(await createLocalProgressRepository(storage, options).load())
    .toMatchObject({ ok: true, state: scopedProgress });
  expect(storage.reads).toEqual([SCOPED_KEY]);
  expect(storage.writes).toEqual([]);
});

it('copies valid legacy progress into an absent scoped key without deleting legacy', async () => {
  const raw = JSON.stringify(legacyV1Progress);
  storage.values.set(LEGACY_KEY, raw);

  const result = await createLocalProgressRepository(storage, options).load();

  expect(result).toMatchObject({ ok: true, state: migratedV2Progress });
  expect(storage.values.get(SCOPED_KEY)).toBe(JSON.stringify(migratedV2Progress));
  expect(storage.values.get(LEGACY_KEY)).toBe(raw);
});

it('copies raw unkeyed schema-v2 five-floor progress semantically exactly', async () => {
  const legacyV2FiveFloor = {
    schemaVersion: 2,
    highestUnlockedFloor: 5,
    clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: true },
    settings: { soundEnabled: false, hapticsEnabled: false },
  } satisfies ProgressState;
  const raw = JSON.stringify(legacyV2FiveFloor);
  storage.values.set(LEGACY_KEY, raw);

  const result = await createLocalProgressRepository(storage, options).load();

  expect(result).toMatchObject({ ok: true, state: legacyV2FiveFloor });
  expect(JSON.parse(storage.values.get(SCOPED_KEY)!)).toEqual(legacyV2FiveFloor);
  expect(storage.values.get(LEGACY_KEY)).toBe(raw);
});
```

Also test: no `legacyReadKey` means the legacy key is never read; an absent scoped and absent browser-legacy value returns defaults without writing; scoped save writes only `progressKey`; scoped corruption backs up under `backupPrefix`; corrupt browser legacy is copied to the scoped backup then scoped defaults are written while the legacy raw string remains unchanged; a failed legacy-to-scoped write returns the parsed/migrated state with `WRITE_FAILED`; canonical read failure does not probe legacy; empty `progressKey`/`backupPrefix` values throw; and a present-but-blank `legacyReadKey` or `legacyReadKey === progressKey` throws before storage access.

- [ ] **Step 2: Run the repository test and verify the old implicit-key API fails**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/localProgressRepository.test.ts`

Expected: FAIL because `LocalProgressRepositoryOptions` and scoped key behavior do not exist.

- [ ] **Step 3: Parameterize the repository without changing result semantics**

Change the constructor to:

```ts
export function createLocalProgressRepository(
  storage: ProgressStorage,
  options: LocalProgressRepositoryOptions,
): ProgressRepository
```

Validate that `progressKey` and `backupPrefix` are nonblank and that `legacyReadKey`, when present, is nonblank and differs from `progressKey`. On `load()`:

1. Read `progressKey`. If present, run the existing parse/migrate/corruption path against that key and never inspect legacy.
2. If absent and `legacyReadKey` is absent, return cloned defaults without writing.
3. If absent and `legacyReadKey` is present, read it once. If it is also absent, return cloned defaults without writing. A valid value is parsed/migrated and written to `progressKey`; the legacy key is never changed.
4. A corrupt legacy raw value is backed up to `${backupPrefix}${Date.now()}`, then defaults are written to `progressKey`; the legacy key is still never changed.
5. Preserve the current failure result: read exceptions return defaults plus `READ_FAILED`; failed backup returns defaults plus `BACKUP_FAILED`; failed canonicalization returns the best parsed/default in-memory state plus `WRITE_FAILED`.

Use `progressKey` for every `save()`. Do not add `removeItem` to `ProgressStorage`.

In the same task, update the existing `createAppServices` caller so the newly required argument does not break the intermediate commit:

```ts
progressRepository: overrides.progressRepository ?? createLocalProgressRepository(storage, {
  progressKey: 'te-ppu.progress.identity.local.local-browser',
  backupPrefix: 'te-ppu.progress.backup.identity.local.local-browser.',
  legacyReadKey: 'te-ppu.progress',
}),
```

This is an explicit compile-safe bridge only. Task 3 removes the concrete service repository and replaces it with the identity factory; do not add any other caller that uses these browser-local options.

- [ ] **Step 4: Run progression tests and typecheck the intermediate caller**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS with existing v1/v2, corruption, write-failure, five-floor, and settings assertions unchanged apart from explicit scoped keys; `app-services.ts` compiles with the required options.

- [ ] **Step 5: Commit the scoped repository boundary**

```powershell
git add -- src/progression/localProgressRepository.ts src/progression/index.ts tests/progression/localProgressRepository.test.ts src/app/app-services.ts
git commit -m "refactor: scope local progress repository keys"
```

Stop here only for local review. This bridge would still select browser-local progress before Apps identity is known, so this commit must not be packaged, released, or handed off independently; continue directly through Tasks 2 and 3.

---

### Task 2: Identity-to-Repository Factory and Multi-Identity Isolation

**Files:**
- Create: `src/progression/progressRepositoryFactory.ts`
- Create: `tests/progression/progressRepositoryFactory.test.ts`
- Modify: `src/progression/index.ts`

**Interfaces:**
- Consumes: `UserIdentity`, scoped local repository options from Task 1, and one `Storage` instance.
- Produces: `ProgressRepositoryFactory.forIdentity(identity)`, `createLocalProgressRepositoryFactory(storage)`, and `progressStorageKeyForIdentity(identity)`.

- [ ] **Step 1: Write failing exact-key and isolation tests**

Define the required contract in the tests:

```ts
export interface ProgressRepositoryFactory {
  forIdentity(identity: UserIdentity): ProgressRepository;
}
```

Assert the exact key mapping:

```ts
expect(progressStorageKeyForIdentity({ kind: 'local', key: 'local-browser' }))
  .toBe('te-ppu.progress.identity.local.local-browser');
expect(progressStorageKeyForIdentity({ kind: 'apps-in-toss', key: 'HASH/a%한글' }))
  .toBe(`te-ppu.progress.identity.apps-in-toss.${encodeURIComponent('HASH/a%한글')}`);
```

Add a two-user isolation test: obtain repositories for HASH `user-a` and `user-b`, save different progress, load each again, and assert both canonical localStorage keys contain only their user's state. Assert the same identity returns the same cached repository object, different identities return different objects, `a/b` and `a%2Fb` create different keys, and an empty/whitespace Apps-in-Toss HASH throws without storage access.

Assert the exact disjoint backup prefixes by corrupting browser-local and Apps-in-Toss canonical values under a fixed clock: backups must be written only to `te-ppu.progress.backup.identity.local.local-browser.${NOW}` and `te-ppu.progress.backup.identity.apps-in-toss.${encodeURIComponent(hash)}.${NOW}`. No backup write may begin with either canonical key.

Add the canonical/backup collision regression with `A = 'user-a'`, `NOW` fixed, and B set to `` `user-a.backup.${NOW}` ``. Treat B solely as a valid HASH identity: pre-save distinctive B progress, capture B's exact canonical raw bytes, corrupt A's canonical value, and load A. Assert A's corrupt bytes are backed up only at `te-ppu.progress.backup.identity.apps-in-toss.user-a.${NOW}`, while B's canonical bytes and a subsequent B load are unchanged.

Add the conservative migration test: put valid progress at `te-ppu.progress`, call `forIdentity({ kind:'apps-in-toss', key:'user-a' }).load()`, and assert defaults are returned, the HASH-scoped key remains absent until a save, and the unkeyed value is neither read nor changed. Then call the browser-local repository and assert it performs the Task-1 copy.

- [ ] **Step 2: Run the factory tests and verify the module is missing**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/progressRepositoryFactory.test.ts`

Expected: FAIL with a missing factory module/export.

- [ ] **Step 3: Implement one-to-one namespaces and repository caching**

Use these constants and mapping rules in `progressRepositoryFactory.ts`:

```ts
const LEGACY_PROGRESS_KEY = 'te-ppu.progress';
const IDENTITY_PREFIX = 'te-ppu.progress.identity.';
const BACKUP_IDENTITY_PREFIX = 'te-ppu.progress.backup.identity.';

export function progressStorageKeyForIdentity(identity: UserIdentity): string {
  if (identity.kind === 'local') {
    return `${IDENTITY_PREFIX}local.local-browser`;
  }
  if (identity.key.trim().length === 0) {
    throw new RangeError('Apps-in-Toss identity key must be nonblank.');
  }
  return `${IDENTITY_PREFIX}apps-in-toss.${encodeURIComponent(identity.key)}`;
}
```

`createLocalProgressRepositoryFactory(storage)` owns a `Map<string, ProgressRepository>`. `forIdentity` calculates and validates the canonical key, returns the cached repository when present, and otherwise computes the backup prefix independently rather than appending to `progressKey`:

```ts
const progressKey = progressStorageKeyForIdentity(identity);
const backupPrefix = identity.kind === 'local'
  ? `${BACKUP_IDENTITY_PREFIX}local.local-browser.`
  : `${BACKUP_IDENTITY_PREFIX}apps-in-toss.${encodeURIComponent(identity.key)}.`;

createLocalProgressRepository(storage, {
  progressKey,
  backupPrefix,
  legacyReadKey: identity.kind === 'local' ? LEGACY_PROGRESS_KEY : undefined,
});
```

Do not hash, truncate, lowercase, or normalize the SDK HASH. Do not expose a method that lists other identities or scans `localStorage`. This is the first identity-scoped layout, so implement no prior identity-scoped migration; construct every repository with the explicit disjoint `backupPrefix` from the outset.

- [ ] **Step 4: Run factory/progression suites and typecheck**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS with two HASH users, canonical/backup namespace collision coverage, browser-local legacy copy, no Apps-in-Toss legacy adoption, and no intermediate type error.

- [ ] **Step 5: Commit the factory**

```powershell
git add -- src/progression/progressRepositoryFactory.ts src/progression/index.ts tests/progression/progressRepositoryFactory.test.ts
git commit -m "feat: select progress storage by identity"
```

This remains an unreleasable local review checkpoint: `AppServices` has not yet made identity selection own repository construction. Do not package, release, or hand off this commit; continue directly to Task 3.

---

### Task 3: Identity-First Boot Sequencing and Controller Repository Ownership

**Files:**
- Modify: `src/app/app-services.ts`
- Modify: `src/app/app-services.test.ts`
- Modify: `src/app/use-boot.ts`
- Modify: `src/app/use-boot.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/test-support/e2e-wiring.ts`

**Interfaces:**
- Consumes: `ProgressRepositoryFactory`, `PlatformPort.getIdentity()`, and all existing non-progress app services.
- Produces: `AppServices.progressRepositoryFactory` and ready `BootState.progressRepository`, the exact identity-bound repository used by `TowerController`.

- [ ] **Step 1: Write failing sequencing tests with deferred identity**

Replace `useBoot` test helpers with a factory spy and deferred identity. Prove portrait lock is invoked and `assetManager.loadCommon()` is scheduled at attempt start without waiting for identity; flush one microtask before asserting the asset call because the required synchronous-throw boundary invokes it through `Promise.resolve().then(...)`. Repository selection/load must not start until identity resolves:

```ts
const forIdentity = vi.fn(() => repository);
const identity = deferred<UserIdentity>();
renderHook(() => useBoot(services({ getIdentity: () => identity.promise }, { forIdentity })));

expect(platform.lockPortrait).toHaveBeenCalledOnce();
expect(forIdentity).not.toHaveBeenCalled();
expect(repository.load).not.toHaveBeenCalled();

identity.resolve({ kind: 'apps-in-toss', key: 'user-7' });
await waitFor(() => expect(repository.load).toHaveBeenCalledOnce());
expect(forIdentity).toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-7' });
```

Add tests that ready state contains the exact `progressRepository`, a retryable identity failure never calls the factory on the failed attempt, retry success selects/loads only the successful HASH repository, blocked identity errors never read progress, and an identity-selected repository load failure still returns ready in-memory state with the existing persistence notice. Add a regression whose `assetManager.loadCommon` throws synchronously: the throw is converted to asset `'fallback'`, identity and the selected repository still load, boot reaches ready, and no rejection escapes or becomes unhandled.

Add a StrictMode stale-attempt test with two deferred identities. The first effect is cleaned up, the second identity resolves to `user-current`, and then the first identity resolves to `user-stale`. Assert `forIdentity` and both repositories' `load` calls include only `user-current`; the stale completion must be rejected before factory selection:

```tsx
const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
const firstIdentity = deferred<UserIdentity>();
const secondIdentity = deferred<UserIdentity>();
const getIdentity = vi.fn()
  .mockImplementationOnce(() => firstIdentity.promise)
  .mockImplementationOnce(() => secondIdentity.promise);
const platform = createPlatform(getIdentity);
const bootServices = services(platform, { forIdentity });

renderHook(() => useBoot(bootServices), { wrapper });
secondIdentity.resolve({ kind: 'apps-in-toss', key: 'user-current' });
await waitFor(() => expect(forIdentity).toHaveBeenCalledOnce());
firstIdentity.resolve({ kind: 'apps-in-toss', key: 'user-stale' });
await act(async () => { await Promise.resolve(); });
expect(forIdentity).toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-current' });
expect(forIdentity).not.toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-stale' });
```

In `AppRoot.test.tsx`, provide a factory returning `repositoryA`, reach a match/settings save, and assert every `TowerController` save lands in `repositoryA`. Include a factory with a different unused `repositoryB` and assert it receives no load/save. Update all service fixtures to use `progressRepositoryFactory` rather than a concrete app-wide repository.

Update Runtime Task 1's `app-services.test.ts` production-loader fixture and public API assertions in the same red step. Its complete override object supplies a factory, not a concrete repository, and the existing asset/audio production-boundary assertions remain intact:

```ts
const progressRepositoryFactory = {
  forIdentity: vi.fn(() => repository),
} satisfies ProgressRepositoryFactory;
const appServices = createAppServices('browser', storage, {
  assetManager,
  progressRepositoryFactory,
});

expect(appServices.progressRepositoryFactory).toBe(progressRepositoryFactory);
expect(progressRepositoryFactory.forIdentity).not.toHaveBeenCalled();
expect('progressRepository' in appServices).toBe(false);
```

Also assert service construction performs no storage read: the default factory is lazy until boot supplies an identity. Preserve the test that an `assetManager` override is returned exactly and does not touch the browser loaders.

- [ ] **Step 2: Run boot and AppRoot tests to verify the old concrete dependency fails**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/app-services.test.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx`

Expected: FAIL because `AppServices` still owns one pre-identity repository and ready boot state does not carry it.

- [ ] **Step 3: Replace the app-wide repository with the factory**

In `app-services.ts`, replace only these fields:

```ts
export interface AppServices {
  readonly platform: PlatformPort;
  readonly progressRepositoryFactory: ProgressRepositoryFactory;
}

export interface AppServiceOverrides {
  readonly platform?: PlatformPort;
  readonly progressRepositoryFactory?: ProgressRepositoryFactory;
}
```

The snippet shows only the progress-related members; retain the actual file's asset/audio members alongside them. `createAppServices` constructs `createLocalProgressRepositoryFactory(storage)` only when no factory override is supplied. `src/test-support/e2e-wiring.ts` may continue to override only the platform; its browser identity must select the browser-local namespace through the real factory.

- [ ] **Step 4: Sequence boot so identity owns repository selection**

Extend ready boot state:

```ts
{
  status: 'ready';
  identity: UserIdentity;
  progress: ProgressState;
  progressRepository: ProgressRepository;
  notice: string | null;
}
```

At the beginning of each attempt, increment an `attemptTokenRef` and capture `attemptToken`. Start portrait lock and the non-blocking common-asset load exactly as the runtime plan requires. Attach fulfillment/rejection handlers immediately to both started promises: asset rejection becomes `'fallback'`, while portrait rejection is captured and rethrown only when the successful-identity boot joins its work. This prevents an identity failure from leaving an already-started portrait promise with an unhandled rejection. Await `platform.getIdentity()`, then immediately return when `!active || attemptToken !== attemptTokenRef.current` before calling `progressRepositoryFactory.forIdentity(identity)` or `progressRepository.load()`. Join portrait/common/repository work and repeat the same active-token check before publishing ready state. Identity/repository errors retain their existing blocked/retryable/persistence behavior. Never call `forIdentity` with a fabricated local identity in an error branch.

Use this sequencing shape inside the attempt:

```ts
const attemptToken = ++attemptTokenRef.current;
const portraitResultPromise = platform.lockPortrait().then(
  () => ({ ok: true as const }),
  (error: unknown) => ({ ok: false as const, error }),
);
const commonAssetsPromise = Promise.resolve()
  .then(() => assetManager.loadCommon())
  .catch(() => 'fallback' as const);
const identity = await platform.getIdentity();
if (!active || attemptToken !== attemptTokenRef.current) return;
const progressRepository = progressRepositoryFactory.forIdentity(identity);
const [portraitResult, , loadResult] = await Promise.all([
  portraitResultPromise,
  commonAssetsPromise,
  progressRepository.load(),
]);
if (!active || attemptToken !== attemptTokenRef.current) return;
if (!portraitResult.ok) throw portraitResult.error;
```

In AppRoot, create the controller with the ready repository:

```ts
if (boot.status === 'ready' && controllerRef.current === null) {
  controllerRef.current = new TowerController(
    boot.progress,
    boot.progressRepository,
  );
}
```

Do not call the factory again from AppRoot and do not use a repository left on `services`.

- [ ] **Step 5: Run app, E2E-wiring, platform tests, and typecheck**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/app-services.test.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx src/test-support/e2e-driver.test.ts src/platform/apps-in-toss-platform.test.ts`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS; synchronous asset-loader throws remain non-blocking, repository load begins only after identity, all saves use that exact repository, the service boundary exposes only the factory, and E2E browser wiring remains functional. This green test plus typecheck is the gate that completes the atomic Tasks 1–3 code sequence and makes the branch releasable/handoffable for the remaining documentation/final-gate work.

- [ ] **Step 6: Commit identity-first boot**

```powershell
git add -- src/app/app-services.ts src/app/app-services.test.ts src/app/use-boot.ts src/app/use-boot.test.tsx src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/test-support/e2e-wiring.ts
git commit -m "feat: boot with identity-scoped progress"
```

---

### Task 4: Apps-in-Toss Boundary Documentation and Full Regression

**Files:**
- Create: `docs/architecture/progress-identity.md`
- Modify: `docs/qa/apps-in-toss-private-qr.md`
- Modify: `scripts/qa/apps-in-toss-private-qr.test.mjs`
- Modify: `src/platform/apps-in-toss-platform.ts`
- Modify: `src/platform/apps-in-toss-platform.test.ts`
- Modify: `src/app/use-boot.test.tsx`

**Interfaces:**
- Consumes: the factory/boot behavior from Tasks 1–3 and the existing private-QR evidence model.
- Produces: an explicit device-local identity/storage contract without a cross-device synchronization claim.

- [ ] **Step 1: Write failing documentation-contract and platform-boundary tests**

Extend `apps-in-toss-private-qr.test.mjs` to require these exact concepts in the documentation:

```js
const identityDoc = readFileSync(
  new URL('../../docs/architecture/progress-identity.md', import.meta.url),
  'utf8',
);

for (const phrase of [
  'device-local',
  'per-HASH',
  'does not provide cross-device sync',
  'unkeyed legacy progress is not assigned to an Apps-in-Toss HASH',
  'raw legacy recovery evidence remains untouched',
  'rollback or manual support inspection',
  'not automatic in-game continuity',
]) {
  assert.ok(identityDoc.includes(phrase), `missing identity boundary: ${phrase}`);
}
```

In the same Node test, require the private-QR checklist to retain the executable account-switch sequence rather than only a generic isolation claim:

```js
const qrDoc = readFileSync(
  new URL('../../docs/qa/apps-in-toss-private-qr.md', import.meta.url),
  'utf8',
);
for (const phrase of [
  'same private QR/origin',
  'without clearing the WebView',
  'B starts at defaults',
  "A's original state is unchanged",
]) {
  assert.ok(qrDoc.includes(phrase), `missing two-account QR step: ${phrase}`);
}
```

Keep the existing `PENDING_EXTERNAL` requirements. Add/retain the Apps-in-Toss adapter parameterized test proving `undefined`, `INVALID_CATEGORY`, and `ERROR` reject with their mapped platform errors and never return `{ kind:'local' }`. Add `{ type:'HASH', hash:'' }`, `{ type:'HASH', hash:'   ' }`, and a rejected `getUserKeyForGame()` promise: empty/whitespace HASH and SDK rejection must all reject with `PlatformError('RETRYABLE_SDK_ERROR')`, never resolve a local identity, and preserve a nonblank HASH byte-for-byte rather than trimming it.

In `use-boot.test.tsx`, exercise those three retryable cases through a real `createAppsInTossPlatform(fakeSdk)` and a `ProgressRepositoryFactory.forIdentity` spy backed by storage whose `getItem` records calls. Boot must reach `retryable-error`; assert `forIdentity` was never called, storage reads are empty, the raw unkeyed `te-ppu.progress` bytes are unchanged, and retry does not fabricate browser-local identity. This is the executable boundary proving invalid/rejected SDK identity stops before factory selection or legacy access.

- [ ] **Step 2: Run the boundary tests and verify the identity document is absent**

Run: `npx -y node@24.15.0 --test scripts/qa/apps-in-toss-private-qr.test.mjs`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform/apps-in-toss-platform.test.ts src/app/use-boot.test.tsx`

Expected: the Node documentation test FAILS for the missing identity document, and the adapter command FAILS because empty/whitespace HASH values and SDK promise rejection are not yet normalized to retryable platform errors.

- [ ] **Step 3: Normalize unusable Apps identity outcomes at the adapter**

Wrap only `sdk.getUserKeyForGame()` acquisition and map its rejection to `new PlatformError('RETRYABLE_SDK_ERROR')`. Preserve the existing `undefined -> UPDATE_REQUIRED`, `INVALID_CATEGORY -> INVALID_CATEGORY`, and `ERROR -> RETRYABLE_SDK_ERROR` mapping. Before returning a HASH identity, reject `result.hash.trim().length === 0` as `RETRYABLE_SDK_ERROR`; use `trim()` only for the blank check and return every nonblank `result.hash` exactly as supplied. Never construct a local identity in this adapter.

- [ ] **Step 4: Run the adapter and boot-boundary tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform/apps-in-toss-platform.test.ts src/app/use-boot.test.tsx`

Expected: PASS with every unusable SDK identity stopping before repository-factory or legacy-storage access.

- [ ] **Step 5: Document the exact local-only contract and external future scope**

Create `docs/architecture/progress-identity.md` with these operational rules:

- Browser preview uses `te-ppu.progress.identity.local.local-browser` and may copy the old unkeyed value once when its scoped key is absent.
- Browser and Apps backups use the disjoint `te-ppu.progress.backup.identity.*` namespace; canonical keys can never be overwritten by a corruption backup.
- Apps-in-Toss uses one localStorage namespace per exact SDK HASH and never adopts unkeyed legacy data. Because legacy ownership is unknowable, automatic adoption would be a cross-account disclosure risk.
- For Apps-in-Toss, raw unkeyed legacy recovery evidence remains untouched for rollback or manual support inspection. This is not automatic in-game continuity and must not be reported as seamless/no-loss migration.
- This is the first shipped identity-scoped layout, so there is no prior identity-scoped migration; it starts with the disjoint backup namespace.
- SDK identity failures stop before progress selection; they are not replaced by browser identity.
- Account A and account B on one storage instance are isolated by key, but data remains device-local to that WebView storage.
- Reinstall, storage clearing, another device, or another WebView can start from defaults even when the same HASH is returned.
- Backend storage, authenticated server APIs, cross-device restore, merge/conflict policy, deletion/export, and account transfer are explicit future external scope. Do not describe any of them as implemented.

Update the private-QR checklist with this executable same-origin two-account protocol. Keep the row `PENDING_EXTERNAL` until every step is captured on a real console-authorized physical device; automated unit isolation alone does not satisfy it.

1. Fix one private-QR build URL/origin and one physical device/WebView. Record two authorized test accounts as A and B. Do not reinstall the app, clear WebView/app data, clear localStorage, or change the QR URL/origin at any point.
2. Sign in as A, open the private QR, create and persist a distinctive A state (for example, unlock floor 3 with sound off and haptics on), close the view, and capture the visible saved state/evidence label.
3. Switch the Apps-in-Toss account to B without clearing the WebView, reopen the exact same private QR/origin, and verify B starts at defaults with none of A's cleared floors/settings.
4. Create and persist a different B state (for example, unlock only floor 2 with sound on and haptics off), close the view, and capture it.
5. Switch back to A without clearing the WebView, reopen the same private QR/origin, and verify A's original state is unchanged and contains none of B's distinct progression/settings.

The QA text must separately state the security-first legacy tradeoff: Apps HASH sessions intentionally do not auto-adopt owner-ambiguous unkeyed data; preservation of the unchanged raw value is recovery evidence for rollback/manual support, not proof of automatic user-visible continuity.

- [ ] **Step 6: Run full automated verification**

Run each command separately:

```powershell
npx -y node@24.15.0 --test scripts/qa/apps-in-toss-private-qr.test.mjs
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:web
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e
```

Expected: all automated commands PASS. Report this as device-local per-identity repository verification and legacy-evidence preservation only; do not claim automatic Apps legacy continuity. The QR checklist's two-account console/device protocol and all cross-device items remain external/unimplemented until separately executed.

This is the identity plan's pre-final browser regression only. Do not build a `.ait`, write final artifact evidence, or reclassify any QR/console/device row here; return to Runtime Task 8 for the sole identity-inclusive final package and evidence gate.

- [ ] **Step 7: Commit documentation and boundary coverage**

```powershell
git add -- docs/architecture/progress-identity.md docs/qa/apps-in-toss-private-qr.md scripts/qa/apps-in-toss-private-qr.test.mjs src/platform/apps-in-toss-platform.ts src/platform/apps-in-toss-platform.test.ts src/app/use-boot.test.tsx
git commit -m "fix: enforce Apps identity progress boundaries"
```

---

## Completion Criteria

- Two Apps-in-Toss HASH identities sharing one `Storage` instance load/save separate progress with no legacy or cross-user adoption.
- Canonical and backup namespaces are disjoint, including the valid `user-a` / `user-a.backup.${NOW}` HASH-identity collision regression.
- Browser-local users retain a semantic v1/v2 copy path from the old unkeyed value, including five-floor v2 progress, while the original raw value remains untouched. Apps-in-Toss preserves that raw value only as rollback/manual-support recovery evidence and does not promise automatic continuity.
- `useBoot` catches synchronous common-asset loader throws, never selects or reads progress before successful identity resolution, and passes the selected repository to `TowerController`.
- Apps-in-Toss identity failures remain blocked/retryable and never become local-browser progress.
- Full unit, typecheck, browser build, and E2E suites pass under Node 24.15.
- Documentation states that per-HASH localStorage is not backend or cross-device synchronization, and the same-origin A -> B -> A private-QR protocol remains external evidence until physically executed.
