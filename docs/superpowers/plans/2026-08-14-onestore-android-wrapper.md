# ONE store Android Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, sign, verify, and emulator-smoke-test an offline Android APK of Teppu for ONE store rating and publication.

**Architecture:** Add an `android` runtime adapter and a priority-based native-back handler without changing browser or Apps-in-Toss behavior. Package the existing Vite output with Capacitor, keep the generated Android project as source, and drive SDK setup, DPAPI-protected signing, release assembly, APK inspection, and emulator evidence through reproducible Windows scripts.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, Node 24.15.0, Capacitor 8.5.0, Capacitor App 8.1.1, Android API 36, Android Gradle Plugin 8.13.0, Gradle 8.14.3, JDK 21, PowerShell, Android command-line tools.

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on `feat/pve-delivery`.
- Never inspect, modify, stage, or delete the user-owned untracked `tmp/` directory.
- Use application ID `io.github.ohe1013.teppu`, label `테뿌리스`, `versionCode 1`, and `versionName 1.0.0`.
- Use exact Capacitor versions: core/CLI/Android `8.5.0`; App plugin `8.1.1`.
- Use Capacitor 8.5.0 template levels: minimum API 24, compile API 36, target API 36, AGP 8.13.0, Gradle 8.14.3.
- Bundle `dist` in the APK; do not load a remote game URL or enable cleartext traffic.
- Keep local progress in WebView `localStorage`; keep the Android leaderboard local.
- Preserve battle abandon as return-to-tower and whole-app exit as a title-screen action.
- Store signing material only under `C:\Users\USER\.teppu\android-signing\`; never commit secrets or a keystore.
- Do not silently accept Android SDK licenses. Stop at the license gate for user confirmation.
- Use the installed Node executable `C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe` and matching `npm.cmd` when `nvm use` requires elevation.
- Generated APKs, checksums, logcat files, screenshots, emulator state, and copied web assets stay out of Git.
- Every authored behavior change follows red-green TDD. Generated Capacitor/Gradle files are verified by contract tests and real builds.
- Do not claim physical-device validation; no Android phone is connected.
- Do not push commits unless the user separately asks for a push.

---

### Task 1: Add the Android runtime and native platform adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app/runtime-mode.test.ts`
- Modify: `src/app/runtime-mode.ts`
- Modify: `src/platform/platform-port.ts`
- Create: `src/platform/android-platform.test.ts`
- Create: `src/platform/android-platform.ts`
- Modify: `src/platform/apps-in-toss-platform.test.ts`
- Modify: `src/platform/create-platform.ts`

**Interfaces:**
- Consumes: Capacitor App methods `addListener('backButton', listener)` and `exitApp()`.
- Produces: runtime mode `'android'`; `PlatformPort.subscribeBackRequest?`; `createAndroidPlatform(appSdk)`.

- [ ] **Step 1: Read the good-test rules before changing tests**

Read completely:

```powershell
Get-Content -Raw 'C:\Users\USER\.codex\plugins\cache\openai-curated-remote\superpowers\6.2.0\skills\test-driven-development\writing-good-tests.md'
```

- [ ] **Step 2: Write failing runtime and adapter tests**

Extend `runtime-mode.test.ts` and create `android-platform.test.ts` with real fake-SDK behavior:

```ts
expect(resolveRuntimeMode('android')).toBe('android');
expect(createPlatform('android').kind).toBe('android');

const fakeApp = createFakeCapacitorApp();
const port = createAndroidPlatform(fakeApp.sdk);
const requests: number[] = [];
const unsubscribe = port.subscribeBackRequest?.(() => requests.push(requests.length + 1));
fakeApp.emitBack();
unsubscribe?.();
fakeApp.emitBack();
await port.close();
expect(requests).toEqual([1]);
expect(fakeApp.exitCount).toBe(1);
expect(fakeApp.removeCount).toBe(1);
```

Also assert the Android identity is `{ kind: 'local', key: 'local-browser' }`, initial insets are zero, portrait/haptic calls settle, and a listener removed before an asynchronous `addListener()` resolves is still cleaned up.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/app/runtime-mode.test.ts src/platform/android-platform.test.ts src/platform/apps-in-toss-platform.test.ts
```

Expected: failure because `'android'`, `createAndroidPlatform`, and Android platform selection do not exist.

- [ ] **Step 4: Implement the minimal Android adapter**

Install the exact runtime packages needed by the adapter before adding its
production import:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' install --save-exact @capacitor/core@8.5.0 @capacitor/app@8.1.1
```

Change the runtime union and resolver:

```ts
export type RuntimeMode = 'browser' | 'apps-in-toss' | 'android';

export function resolveRuntimeMode(value: string): RuntimeMode {
  if (value === 'browser' || value === 'apps-in-toss' || value === 'android') return value;
  throw new Error(`Unsupported runtime mode: ${value}`);
}
```

Add the optional capability to `PlatformPort`:

```ts
subscribeBackRequest?(listener: () => void): () => void;
```

Implement `createAndroidPlatform()` with an injected SDK interface, zero safe-area fallback, no-op portrait/haptic methods, `App.exitApp()`, and race-safe asynchronous listener cleanup. Select it explicitly in `createPlatform()`; retain explicit browser and Apps-in-Toss branches.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/app/runtime-mode.test.ts src/platform/android-platform.test.ts src/platform/apps-in-toss-platform.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all selected tests and typecheck pass.

- [ ] **Step 6: Commit the runtime adapter**

```powershell
git add -- package.json package-lock.json src/app/runtime-mode.test.ts src/app/runtime-mode.ts src/platform/platform-port.ts src/platform/android-platform.test.ts src/platform/android-platform.ts src/platform/apps-in-toss-platform.test.ts src/platform/create-platform.ts
git diff --cached --check
git commit -m "feat: add android runtime adapter"
```

---

### Task 2: Route Android back requests through existing UI intent

**Files:**
- Create: `src/platform/back-request.test.tsx`
- Create: `src/platform/back-request.tsx`
- Modify: `src/main.tsx`
- Modify: `src/ui/match/AppExitConfirmation.tsx`
- Modify: `src/ui/match/BattleAbandonConfirmation.tsx`
- Modify: `src/ui/screens/TitleScreen.test.tsx`
- Modify: `src/ui/screens/TitleScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/app/AppRoot.tsx`

**Interfaces:**
- Consumes: `PlatformPort.subscribeBackRequest?` from Task 1.
- Produces: `PlatformBackProvider`; `usePlatformBack(handler, { enabled, priority })`.

- [ ] **Step 1: Write failing provider priority tests**

Create `back-request.test.tsx` proving one platform subscription, latest-handler refresh, priority ordering, disabled-handler removal, and cleanup:

```tsx
render(
  <PlatformBackProvider platform={platform}>
    <Harness priority={10} label="screen" />
    <Harness priority={100} label="modal" />
  </PlatformBackProvider>,
);
act(() => emitBack());
expect(calls).toEqual(['modal']);
```

Unmount the modal harness, emit again, and expect only `screen`. Unmount the provider and expect the platform subscription cleanup exactly once.

- [ ] **Step 2: Run the provider test and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/platform/back-request.test.tsx
```

Expected: module-not-found failure for `back-request`.

- [ ] **Step 3: Implement the provider and hook**

Use a context-owned registry keyed by stable symbols. Each entry contains priority, registration order, and a ref-backed callback. The provider subscribes once and invokes the highest-priority enabled entry; equal priority uses the newest registration. With no provider or no platform capability, the hook is a safe no-op.

Wrap production rendering in `main.tsx`:

```tsx
<PlatformBackProvider platform={services.platform}>
  <SafeAreaProvider platform={services.platform}>
    <AppRoot services={services} renderMatch={renderMatch} />
  </SafeAreaProvider>
</PlatformBackProvider>
```

- [ ] **Step 4: Write failing modal and route tests**

Add tests that emit a native back request rather than clicking UI controls:

```ts
emitBack();
expect(screen.getByRole('dialog', { name: '게임을 종료할까요?' })).toBeVisible();
emitBack();
expect(screen.queryByRole('dialog', { name: '게임을 종료할까요?' })).toBeNull();
```

For `MatchScreen`, first back opens `현재 전투를 포기할까요?`, second back cancels it, controls resume, and `onAbandon` is not called. For `AppExitConfirmation`, a pending or successful close consumes native back instead of dismissing. For `AppRoot`, cover name entry/ranking/tower returning to title, first floor intro returning to tower, ending using `finishRunAndShowTitle`, and result/intermediate-intro/owl routes consuming back without bypassing progress.

- [ ] **Step 5: Run UI tests and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/ui/screens/TitleScreen.test.tsx src/ui/screens/MatchScreen.test.tsx src/app/AppRoot.test.tsx
```

Expected: native back has no effect before hook integration.

- [ ] **Step 6: Integrate priority handlers**

Use priority `10` for active screens and `100` for open confirmations:

```ts
usePlatformBack(() => setExitOpen(true), { enabled: !exitOpen, priority: 10 });
usePlatformBack(onCancel, { enabled: open && cancelAllowed, priority: 100 });
```

`MatchScreen` opens and pauses through its existing `openExitConfirmation()`. `BattleAbandonConfirmation` cancels at modal priority. `AppRoot` registers one simple-route handler only for routes with an existing safe back action; protected result and progression routes register a consuming no-op. Do not call `platform.close()` from any battle path.

- [ ] **Step 7: Run focused UI tests and typecheck**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/platform/back-request.test.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/MatchScreen.test.tsx src/app/AppRoot.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: selected tests and typecheck pass.

- [ ] **Step 8: Commit native back behavior**

```powershell
git add -- src/platform/back-request.test.tsx src/platform/back-request.tsx src/main.tsx src/ui/match/AppExitConfirmation.tsx src/ui/match/BattleAbandonConfirmation.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/TitleScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/MatchScreen.tsx src/app/AppRoot.test.tsx src/app/AppRoot.tsx
git diff --cached --check
git commit -m "feat: route android back actions"
```

---

### Task 3: Add exact Capacitor configuration and scaffold Android source

**Files:**
- Create: `.env.android`
- Create: `capacitor.config.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/android/android-project-contract.test.mjs`
- Create: `scripts/android/android-project-contract.mjs`
- Create: generated `android/` Capacitor project

**Interfaces:**
- Consumes: Vite `dist`; runtime mode `android`; Capacitor CLI.
- Produces: `npm run build:android:web`, `npm run sync:android`, `npm run test:android-contract`.

- [ ] **Step 1: Write a failing Android project contract test**

The test reads real files and asserts exact values:

```js
const expected = {
  appId: 'io.github.ohe1013.teppu',
  appName: '테뿌리스',
  webDir: 'dist',
};
assert.deepEqual(readCapacitorConfig(root), expected);
assert.equal(readAndroidEnv(root).VITE_RUNTIME_MODE, 'android');
assert.deepEqual(readCapacitorVersions(root), {
  core: '8.5.0', cli: '8.5.0', android: '8.5.0', app: '8.1.1',
});
```

Also require `android/gradlew.bat`, `android/variables.gradle`, and `android/app/src/main/AndroidManifest.xml`.

- [ ] **Step 2: Run the contract test and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/android-project-contract.test.mjs
```

Expected: failure because Android config and project files do not exist.

- [ ] **Step 3: Add exact dependencies, scripts, and config**

Install exact packages with Node 24:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' install --save-exact @capacitor/android@8.5.0
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' install --save-dev --save-exact @capacitor/cli@8.5.0
```

Create `.env.android`:

```dotenv
VITE_RUNTIME_MODE=android
```

Create `capacitor.config.json`:

```json
{
  "appId": "io.github.ohe1013.teppu",
  "appName": "테뿌리스",
  "webDir": "dist",
  "android": {
    "allowMixedContent": false,
    "backgroundColor": "#101026"
  },
  "server": {
    "androidScheme": "https"
  }
}
```

Add scripts:

```json
"build:android:web": "npm run check:assets && vite build --mode android",
"sync:android": "npm run build:android:web && cap sync android",
"test:android-contract": "node --test scripts/android/*.test.mjs"
```

- [ ] **Step 4: Generate the Android project**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npx.cmd' cap add android
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npx.cmd' cap sync android
```

Expected: checked-in `android/` source exists; copied web output under the native assets directory remains ignored by the generated Android `.gitignore`.

- [ ] **Step 5: Run contract test, web build, and typecheck**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/android-project-contract.test.mjs
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit the Capacitor scaffold**

Stage explicit paths and inspect the generated source list before committing:

```powershell
git add -- .env.android capacitor.config.json package.json package-lock.json scripts/android/android-project-contract.test.mjs scripts/android/android-project-contract.mjs android
git diff --cached --check
git status --short
git commit -m "build: scaffold onestore android app"
```

---

### Task 4: Lock Android manifest, display resources, and icons

**Files:**
- Modify: `scripts/android/android-project-contract.test.mjs`
- Modify: `scripts/android/android-project-contract.mjs`
- Create: `scripts/android/generate-icons.test.mjs`
- Create: `scripts/android/generate-icons.mjs`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values/styles.xml`
- Create/Modify: `android/app/src/main/res/mipmap-*/ic_launcher*.png`
- Create/Modify: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`
- Create/Modify: `android/app/src/main/res/drawable*/splash.png`

**Interfaces:**
- Consumes: `artifacts/apps-in-toss/store-media/app-logo-teppu.png`.
- Produces: portrait-only Activity, approved label/icon, deterministic system-bar theme, version 1/1.0.0.

- [ ] **Step 1: Extend contract tests and create failing icon tests**

Assert the real native project contains:

```js
assert.match(manifest, /android:screenOrientation="portrait"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.match(strings, /<string name="app_name">테뿌리스<\/string>/);
assert.match(buildGradle, /versionCode 1/);
assert.match(buildGradle, /versionName "1\.0\.0"/);
assert.deepEqual(readSdkLevels(root), { min: 24, compile: 36, target: 36 });
```

`generate-icons.test.mjs` runs the generator in a temporary directory and uses `sharp().metadata()` to assert exact legacy icon dimensions 48, 72, 96, 144, and 192 pixels plus adaptive foreground and splash files.

- [ ] **Step 2: Run contract/icon tests and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/android-project-contract.test.mjs scripts/android/generate-icons.test.mjs
```

Expected: manifest/version/icon assertions fail against the untouched template.

- [ ] **Step 3: Implement native configuration and icon generator**

Use `sharp` to resize the approved 600x600 PNG. Legacy icons use `fit: 'contain'` on the opaque brand background; adaptive foreground keeps safe padding over `#101026`. Patch the Activity and application:

```xml
<application
    android:label="@string/app_name"
    android:usesCleartextTraffic="false"
    android:theme="@style/AppTheme">
  <activity
      android:name=".MainActivity"
      android:exported="true"
      android:screenOrientation="portrait">
```

Set `versionCode 1`, `versionName "1.0.0"`, and keep template SDK values 24/36/36. Configure system/navigation bar colors so controls are never drawn under opaque bars.

- [ ] **Step 4: Generate resources and resync web assets**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/android/generate-icons.mjs
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run sync:android
```

- [ ] **Step 5: Run Android contract tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/android-project-contract.test.mjs scripts/android/generate-icons.test.mjs
```

Expected: all contract and image-dimension checks pass.

- [ ] **Step 6: Commit Android resources**

```powershell
git add -- scripts/android/android-project-contract.test.mjs scripts/android/android-project-contract.mjs scripts/android/generate-icons.test.mjs scripts/android/generate-icons.mjs android/app
git diff --cached --check
git commit -m "feat: configure teppu android package"
```

---

### Task 5: Add protected signing and release automation

**Files:**
- Modify: `.gitignore`
- Create: `scripts/android/release-contract.test.mjs`
- Create: `scripts/android/release-contract.mjs`
- Create: `scripts/android/Initialize-AndroidSigning.ps1`
- Create: `scripts/android/Build-AndroidRelease.ps1`
- Create: `scripts/android/Verify-AndroidRelease.ps1`
- Modify: `android/app/build.gradle`
- Modify: `package.json`

**Interfaces:**
- Consumes: external DPAPI credential and JKS keystore.
- Produces: `artifacts/android/teppu-1.0.0-release.apk`, SHA-256 file, sanitized verification report.

- [ ] **Step 1: Write failing release-contract tests**

Test path confinement, metadata shape, versioned artifact names, and redaction:

```js
assert.deepEqual(resolveSigningPaths('C:\\Users\\USER'), {
  directory: 'C:\\Users\\USER\\.teppu\\android-signing',
  keystore: 'C:\\Users\\USER\\.teppu\\android-signing\\teppu-upload.jks',
  credential: 'C:\\Users\\USER\\.teppu\\android-signing\\teppu-signing.credential.xml',
  metadata: 'C:\\Users\\USER\\.teppu\\android-signing\\README.txt',
});
assert.equal(releaseArtifactName('1.0.0'), 'teppu-1.0.0-release.apk');
assert.doesNotMatch(redactSecrets('storePassword=secret', ['secret']), /secret/);
```

Spawn each PowerShell script with `-ValidateOnly` and assert missing setup fails without printing credential contents.

- [ ] **Step 2: Run release tests and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/release-contract.test.mjs
```

Expected: module and scripts are absent.

- [ ] **Step 3: Implement idempotent DPAPI signing initialization**

`Initialize-AndroidSigning.ps1` must:

1. Resolve only `C:\Users\USER\.teppu\android-signing\` by default.
2. Refuse a partial setup or alias mismatch.
3. Generate one random 32-byte base64url password in memory.
4. Store it as a `PSCredential` with `Export-Clixml`, which uses DPAPI for the current Windows user.
5. Invoke JDK 21 `keytool` with `-storepass:env` and `-keypass:env`, alias `teppu-upload`, JKS type, RSA 4096, SHA256withRSA, and 9,125-day validity.
6. Write only non-secret alias, app ID, certificate SHA-256, creation/expiry, and backup instructions to `README.txt`.
7. On rerun, verify and report the existing key without replacing it.

Use a non-personal distinguished name:

```text
CN=Teppu Android Upload, OU=Teppu, O=Teppu, L=Seoul, C=KR
```

- [ ] **Step 4: Configure Gradle signing without stored secrets**

Read only process environment variables:

```groovy
def teppuKeystorePath = System.getenv('TEPPU_KEYSTORE_PATH')
def teppuKeystorePassword = System.getenv('TEPPU_KEYSTORE_PASSWORD')
def teppuKeyAlias = System.getenv('TEPPU_KEY_ALIAS')
def teppuKeyPassword = System.getenv('TEPPU_KEY_PASSWORD')
```

Configure release signing only when all are present. Add a task-graph guard that fails any release assembly when one is absent. Do not write secrets to `gradle.properties`, `local.properties`, command arguments, or logs.

- [ ] **Step 5: Implement release build and verifier scripts**

`Build-AndroidRelease.ps1` imports the DPAPI credential, sets process-local environment variables, invokes Node 24 `npm run sync:android`, invokes `android\gradlew.bat assembleRelease` with JDK 21 and the user SDK, copies the signed APK atomically, and writes SHA-256.

`Verify-AndroidRelease.ps1` runs:

```powershell
& "$AndroidSdk\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs $Apk
& "$AndroidSdk\build-tools\36.0.0\aapt.exe" dump badging $Apk
```

It rejects a wrong package, label, version, SDK range, missing v2+ signature, checksum mismatch, or unconfined artifact path. Reports contain fingerprints but no password or credential XML.

Add package scripts:

```json
"signing:android:init": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Initialize-AndroidSigning.ps1",
"build:android:release": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Build-AndroidRelease.ps1",
"verify:android:release": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Verify-AndroidRelease.ps1"
```

Ignore only generated Android outputs:

```gitignore
artifacts/android/
```

- [ ] **Step 6: Run release-contract tests and dry validation**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/release-contract.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Initialize-AndroidSigning.ps1 -ValidateOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Build-AndroidRelease.ps1 -ValidateOnly
```

Expected: Node tests pass; validation reports missing external setup clearly and prints no secrets.

- [ ] **Step 7: Commit release automation**

```powershell
git add -- .gitignore package.json package-lock.json scripts/android/release-contract.test.mjs scripts/android/release-contract.mjs scripts/android/Initialize-AndroidSigning.ps1 scripts/android/Build-AndroidRelease.ps1 scripts/android/Verify-AndroidRelease.ps1 android/app/build.gradle
git diff --cached --check
git commit -m "build: automate signed android release"
```

---

### Task 6: Install the user-scoped Android SDK and create the permanent key

**Files:**
- Create: `scripts/android/sdk-contract.test.mjs`
- Create: `scripts/android/sdk-contract.mjs`
- Create: `scripts/android/Install-AndroidSdk.ps1`
- Generated/ignored: `android/local.properties`
- External/non-Git: `C:\Users\USER\AppData\Local\Android\Sdk\**`
- External/non-Git: `C:\Users\USER\.teppu\android-signing\**`

**Interfaces:**
- Consumes: official Google command-line tools archive and user license confirmation.
- Produces: SDK API 36 toolchain, permanent JKS/DPAPI credential, Gradle SDK location.

- [ ] **Step 1: Write failing SDK contract tests**

Pin and validate:

```js
assert.equal(COMMAND_LINE_TOOLS.url,
  'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip');
assert.equal(COMMAND_LINE_TOOLS.sha256,
  '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a');
assert.deepEqual(SDK_PACKAGES, [
  'platform-tools',
  'platforms;android-36',
  'build-tools;36.0.0',
  'emulator',
  'system-images;android-36;google_apis;x86_64',
]);
```

The script `-ValidateOnly` test must reject a checksum mismatch and an SDK root outside `C:\Users\USER\AppData\Local\Android\Sdk`.

- [ ] **Step 2: Run SDK tests and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/sdk-contract.test.mjs
```

Expected: SDK contract module and installer do not exist.

- [ ] **Step 3: Implement verified SDK installer**

The PowerShell script downloads to a unique user temp directory, verifies SHA-256 before extraction, installs command-line tools under `cmdline-tools\latest`, and invokes `sdkmanager.bat` for the exact package list. It writes:

```properties
sdk.dir=C\:\\Users\\USER\\AppData\\Local\\Android\\Sdk
```

to ignored `android/local.properties`. It never uses an administrator installer and never accepts licenses through a hidden `yes` pipe.

- [ ] **Step 4: Run SDK contract tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/sdk-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit the installer before external mutation**

```powershell
git add -- scripts/android/sdk-contract.test.mjs scripts/android/sdk-contract.mjs scripts/android/Install-AndroidSdk.ps1
git diff --cached --check
git commit -m "build: add verified android sdk setup"
```

- [ ] **Step 6: Download tools and stop at the license gate**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Install-AndroidSdk.ps1
```

Expected: command-line tools are checksum-verified; when Google SDK licenses require acceptance, report the exact prompt and ask the user before supplying acceptance.

- [ ] **Step 7: After explicit license approval, install packages**

Resume the installer in its documented `-AcceptLicenses` mode only after the user's approval. Verify:

```powershell
& 'C:\Users\USER\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat' --list_installed
```

Expected: all five pinned packages are listed.

- [ ] **Step 8: Generate and inspect the permanent signing key**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run signing:android:init
Get-Content -Raw 'C:\Users\USER\.teppu\android-signing\README.txt'
```

Expected: JKS, DPAPI credential, and non-secret metadata exist; rerunning initialization verifies without replacement. Do not print the credential XML.

---

### Task 7: Build and cryptographically verify the release APK

**Files:**
- Generated/ignored: `artifacts/android/teppu-1.0.0-release.apk`
- Generated/ignored: `artifacts/android/teppu-1.0.0-release.apk.sha256`
- Generated/ignored: `artifacts/android/verification.txt`

**Interfaces:**
- Consumes: Tasks 3–6 web/native source, SDK, and signing material.
- Produces: ONE store upload APK and reproducible verification evidence.

- [ ] **Step 1: Build the signed release**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:release
```

Expected: Gradle exits zero and the versioned artifact plus checksum exist.

- [ ] **Step 2: Verify signature, manifest, and checksum**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run verify:android:release
```

Expected report includes package `io.github.ohe1013.teppu`, label `테뿌리스`, version code `1`, version name `1.0.0`, min SDK 24, target SDK 36, verified v2+ signing, certificate SHA-256, and matching file SHA-256.

- [ ] **Step 3: Confirm generated artifacts are ignored**

```powershell
git status --short
git check-ignore -v artifacts/android/teppu-1.0.0-release.apk
```

Expected: APK/evidence are ignored and `tmp/` remains the only unrelated untracked path.

---

### Task 8: Create an API 36 emulator and capture smoke evidence

**Files:**
- Create: `scripts/android/emulator-contract.test.mjs`
- Create: `scripts/android/emulator-contract.mjs`
- Create: `scripts/android/Invoke-AndroidSmoke.ps1`
- Generated/ignored: `artifacts/android/emulator/**`
- External/non-Git: current user's Android AVD directory for `Teppu_API_36`

**Interfaces:**
- Consumes: signed APK, API 36 x86_64 image, Android emulator/adb.
- Produces: install/launch status, title/tower/battle screenshots, UI dumps, filtered logcat.

- [ ] **Step 1: Write failing emulator helper tests**

Test AVD-name validation, component name, safe evidence paths, UIAutomator bounds parsing, and fatal-log detection:

```js
assert.deepEqual(parseBounds('[42,317][318,373]'), {
  left: 42, top: 317, right: 318, bottom: 373, centerX: 180, centerY: 345,
});
assert.equal(hasFatalAndroidLog('FATAL EXCEPTION: main'), true);
assert.equal(hasFatalAndroidLog('I Capacitor: App started'), false);
```

Spawn `Invoke-AndroidSmoke.ps1 -ValidateOnly` and require the exact AVD `Teppu_API_36` and component `io.github.ohe1013.teppu/.MainActivity`.

- [ ] **Step 2: Run helper tests and confirm RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/emulator-contract.test.mjs
```

Expected: helper module/script absent.

- [ ] **Step 3: Implement idempotent emulator smoke automation**

The script must:

1. Run `emulator-check.exe accel` and report a virtualization blocker without deleting AVD state.
2. Create `Teppu_API_36` only if absent; verify an existing AVD uses the pinned system image.
3. Start the emulator with `Start-Process -WindowStyle Hidden` and explicit `-no-snapshot -no-boot-anim` options.
4. Wait for `adb shell getprop sys.boot_completed` to return `1` with a bounded timeout.
5. Install the release APK with `adb install -r`, clear logcat, and launch the exact Activity.
6. Capture title screenshot and UI dump.
7. Use UIAutomator text/bounds lookup to select `도전 시작`, enter `RVT`, select `리벳`, enter floor 1, and start battle; capture tower and battle screenshots.
8. Pull screenshots through a device path rather than binary PowerShell redirection.
9. Save filtered logcat and fail on `FATAL EXCEPTION`, AndroidRuntime crash, or Activity launch failure.
10. Stop only the emulator instance started by this script.

- [ ] **Step 4: Run helper tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --test scripts/android/emulator-contract.test.mjs
```

Expected: all helper and validation tests pass.

- [ ] **Step 5: Commit smoke automation**

```powershell
git add -- scripts/android/emulator-contract.test.mjs scripts/android/emulator-contract.mjs scripts/android/Invoke-AndroidSmoke.ps1
git diff --cached --check
git commit -m "test: add android emulator smoke flow"
```

- [ ] **Step 6: Run release APK smoke test**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android/Invoke-AndroidSmoke.ps1 -Apk artifacts/android/teppu-1.0.0-release.apk
```

Expected: install and launch succeed; title, tower, and battle screenshots exist; logcat has no fatal application error. If host virtualization is unavailable, preserve the exact acceleration output and report emulator verification as blocked while keeping build/signature evidence valid.

---

### Task 9: Document handoff and run complete regression gates

**Files:**
- Create: `docs/qa/onestore-android.md`
- Modify: `package.json` if the final verified command names differ from the initial scripts
- Modify: `package-lock.json` only when package metadata changed

**Interfaces:**
- Consumes: all previous tasks and evidence.
- Produces: repeatable local build guide and exact ONE store human handoff.

- [ ] **Step 1: Write the handoff document**

Document exact commands for SDK validation, signing initialization, release build, APK verification, emulator smoke, artifact locations, key backup, version increments, and remaining ONE store steps. State explicitly:

- keystore and DPAPI credential must be backed up together;
- the DPAPI file is tied to the current Windows user/machine context;
- no password or credential content belongs in Git or chat;
- the store listing must be released before Apps-in-Toss accepts its URL;
- ONE store and Apps-in-Toss screenshots must show the same game screens; and
- physical-device behavior remains unverified until a phone test occurs.

- [ ] **Step 2: Run authored Android tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:android-contract
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run -- src/app/runtime-mode.test.ts src/platform/android-platform.test.ts src/platform/back-request.test.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/MatchScreen.test.tsx src/app/AppRoot.test.tsx
```

Expected: every selected test passes with zero failures.

- [ ] **Step 3: Run project static and delivery gates**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:assets
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:source-policy
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:android:release
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run verify:android:release
```

Expected: all commands exit zero.

- [ ] **Step 4: Diagnose the previously non-terminating full Vitest suite**

Run with a bounded external timeout and verbose reporter:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' exec vitest run --reporter=verbose
```

If it terminates, record exact test/pass counts. If it still does not terminate, preserve the last completed test output, inspect remaining Node processes/open handles, and report the baseline non-termination separately; do not present focused test success as a full-suite pass.

- [ ] **Step 5: Build and explicitly verify Apps-in-Toss artifact**

```powershell
$env:AIT_APP_NAME = 'te-ppu'
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:ait
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/verify-ait-package.mjs artifacts/ait/game.ait
Remove-Item Env:AIT_APP_NAME
```

Expected: build exits zero and verifier prints `AIT_OK` for the explicit artifact.

- [ ] **Step 6: Inspect final diff and commit documentation**

```powershell
git diff --check
git status --short
git diff --stat HEAD
git add -- docs/qa/onestore-android.md package.json package-lock.json
git diff --cached --check
git commit -m "docs: add onestore android release guide"
```

Do not stage `tmp/` or generated Android artifacts.

- [ ] **Step 7: Run fresh final evidence commands after the final commit**

```powershell
git status --short --branch
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:android-contract
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run verify:android:release
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Read every exit code and output before making any completion claim. Report APK path/hash, certificate fingerprint, emulator result, AIT result, full-suite status, commit list, and the unchanged user-owned `tmp/` directory.
