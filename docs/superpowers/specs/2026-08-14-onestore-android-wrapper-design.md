# ONE store Android Wrapper Design

## Status

Approved product and delivery design. The ONE store build is a separately
packaged Android edition of the same Teppu game. It exists to obtain and retain
valid store rating evidence while remaining behaviorally aligned with the
Apps-in-Toss `.ait` edition.

## Goals

1. Produce an installable, signed Android APK for `테뿌리스` with application ID
   `io.github.ohe1013.teppu`.
2. Package the existing web game and authored assets inside the APK so gameplay
   does not depend on a hosted web origin.
3. Preserve the existing distinction between leaving a battle for the tower and
   closing the whole application.
4. Keep Apps-in-Toss behavior and packaging unchanged.
5. Create a permanent upload/signing key that can be reused for every ONE store
   update, store it outside Git, and protect its credentials with Windows DPAPI.
6. Build and smoke-test the game in an Android emulator because no physical
   Android device is currently connected.

## Non-goals

- Do not rewrite gameplay or UI in Kotlin, Java, React Native, or Flutter.
- Do not add ONE store billing, advertisements, ALC, account login, analytics,
  push notifications, or remote configuration.
- Do not enable the optional Firebase leaderboard. The Android edition retains
  the current browser build's local leaderboard behavior.
- Do not change tower rules, match rules, progress schema, characters, store
  media, or Apps-in-Toss game identity.
- Do not upload or publish the product in the ONE store console. Login, identity
  verification, legal agreements, rating answers, and publication remain human
  actions.
- Do not claim physical-device verification from emulator evidence.

## Considered approaches

### 1. Capacitor with bundled web assets — selected

Capacitor wraps the existing Vite output in a native Android application and
provides a narrow bridge for lifecycle, back-button, and app-exit behavior. This
reuses the shipped game implementation, keeps the Android and Apps-in-Toss
screens aligned, and works without a hosted URL.

### 2. Custom Kotlin WebView shell — rejected

A hand-written Activity could load the same files with fewer JavaScript
dependencies, but it would require a custom bridge, lifecycle policy, security
configuration, asset loader, and test harness. That is unnecessary duplication
for this release.

### 3. Remote-URL WebView shell — rejected

Loading a hosted game would make APK operation depend on network and hosting
availability, introduce origin and caching failure modes, and make the reviewed
binary less self-contained. It is not needed because all authored assets fit in
the current package budget.

## Toolchain and fixed identifiers

- Node.js: `24.15.0`, invoked directly from the installed NVM version when the
  Windows global NVM symlink cannot be switched without elevation.
- Capacitor core, CLI, and Android: `8.5.0`.
- Capacitor App plugin: `8.1.1`.
- Java: the installed Temurin JDK `21`.
- Android application ID: `io.github.ohe1013.teppu`.
- Android application label: `테뿌리스`.
- Initial Android version: `versionCode 1`, `versionName 1.0.0`.
- Capacitor web directory: `dist`.
- Android SDK root: `C:\Users\USER\AppData\Local\Android\Sdk`.
- Capacitor 8.5.0 template levels: minimum API 24, compile API 36, target API
  36, Android Gradle Plugin 8.13.0, and Gradle 8.14.3.
- Emulator target: Android API 36 x86_64 with Google APIs. Hardware acceleration
  is used when Windows virtualization support is available.

The Capacitor versions are exact project dependencies rather than floating
ranges. The generated native project is committed because Capacitor treats the
native project as editable source, while copied `dist` contents and Gradle build
outputs remain generated and ignored.

## Build architecture

The Android build pipeline is:

1. Run the existing asset validation.
2. Run Vite with an Android environment whose runtime mode is `android`.
3. Write the production web bundle to `dist`.
4. Run Capacitor sync to copy that bundle into the Android project.
5. Run the checked-in Gradle wrapper with Java 21.
6. Sign the release variant with the permanent external keystore.
7. Copy the final APK to `artifacts/android/teppu-1.0.0-release.apk` and write a
   SHA-256 checksum beside it.

`package.json` exposes separate Android scripts. The existing `build:web` and
`build:ait` contracts remain valid and do not silently switch runtime modes.
Android SDK setup and signed release orchestration live in focused PowerShell
scripts under `scripts/android/`; configuration validation that can be tested
without the SDK lives in small JavaScript modules.

## Runtime separation

`RuntimeMode` gains a third value, `android`. `createPlatform()` selects a new
Android platform adapter only for that value. Browser and Apps-in-Toss adapters
retain their existing behavior.

The Android adapter provides:

- the existing local identity used by the browser build;
- portrait operation, enforced by the Android manifest;
- native back-button subscriptions through the Capacitor App plugin;
- native application exit through the Capacitor App plugin;
- safe-area values consistent with the configured Android system bars; and
- no-op haptics for this first store build, matching the current browser
  fallback rather than adding a new device permission or behavior.

The Android build continues to use the local progress repository backed by the
WebView's persistent `localStorage`. Normal process termination retains saved
progress; clearing application data or uninstalling the APK removes it. Active
boards are not serialized, matching the approved existing game rule.

## Back and exit behavior

Android back requests are routed through the same application actions as the
visible UI controls:

- If an in-app confirmation is open, back cancels the top confirmation.
- From a live floor or owl battle, back opens the existing battle-abandon
  confirmation. Confirming returns to the tower and never closes the app.
- From the title, back opens the existing whole-app exit confirmation.
- From other game routes, back invokes that screen's existing return action.
- Only confirming whole-app exit calls the Android platform's native exit.

Repeated back presses while a confirmation or transition is pending are
ignored. Apps-in-Toss keeps its existing `closeView()` integration and browser
preview keeps its non-closing developer behavior.

## Display and assets

The Android Activity is portrait-only. The packaged game uses the same React,
Pixi, image, atlas, and authored-audio assets as the Apps-in-Toss edition. The
Android icon is derived from the approved Teppu store logo, with adaptive icon
foreground and background resources plus legacy launcher sizes.

System-bar treatment must not cover game controls. The native theme and
Capacitor configuration provide deterministic insets; the app does not rely
solely on CSS `env(safe-area-inset-*)`. Emulator screenshots must show the title,
tower, and battle screens without clipping or overlap.

## Permanent signing material

Signing material is never committed and is never written beneath the Git
worktree.

- Directory: `C:\Users\USER\.teppu\android-signing\`
- Keystore: `teppu-upload.jks`
- Alias: `teppu-upload`
- Certificate identity: a non-personal Teppu upload-key label
- Store type: JKS
- Validity: 25 years
- Secret record: a DPAPI-encrypted credential file readable only by the current
  Windows user on this machine
- Metadata: a non-secret text file containing application ID, alias, certificate
  SHA-256 fingerprint, creation date, expiry date, and backup instructions

The setup script is idempotent: if the key already exists, it verifies the alias
and certificate instead of replacing it. A partial or mismatched signing setup
fails closed. Passwords are generated in memory, are not printed, and reach
`keytool` and Gradle through process-local environment variables. Gradle files
must not contain keystore paths or passwords.

The keystore and protected secret must be backed up together before ONE store
publication. Losing them can prevent future updates. The script creates the
local protected originals and clear backup instructions; choosing an external
backup destination remains a human action.

## Android SDK and emulator setup

The SDK is installed in the current user's profile, so Android Studio and an
administrator-level system install are not required. Setup downloads Google's
official command-line tools and installs the exact packages needed for API 36,
platform tools, build tools, emulator, and the selected x86_64 system image.

SDK licenses are not silently accepted. Setup pauses at the license gate and
requires the user to approve the displayed Android license terms. If Windows
virtualization is unavailable, signed APK production continues, but emulator
execution is reported as blocked rather than misrepresented as tested.

The emulator uses a dedicated AVD named `Teppu_API_36`. Tests start it without
opening unrelated UI, wait for Android boot completion, install the APK with
`adb`, launch `io.github.ohe1013.teppu`, and collect screenshots and filtered
logcat evidence.

## Failure handling and security

- Missing Java 21, Node 24.15.0, SDK components, web assets, or signing secrets
  produce an actionable nonzero failure before Gradle release packaging.
- Setup never deletes or overwrites an existing keystore.
- Secret values are redacted from command output and verification reports.
- Android release builds use APK signature scheme v2 or newer and are checked
  with `apksigner`.
- Web content is loaded only from the packaged Capacitor origin. Cleartext HTTP
  traffic and arbitrary navigation are not enabled.
- No additional dangerous Android permission is requested.
- A Capacitor, Gradle, or SDK update is a deliberate future change; versions do
  not float during release builds.
- Generated APKs and emulator data are excluded from Git.

## Test strategy

Implementation follows red-green TDD for authored runtime and build-validation
logic. Generated Capacitor and Gradle template files are validated through
build and manifest checks rather than unit-testing generated code.

Automated verification must cover:

1. Runtime mode parsing accepts `android` and rejects unknown values.
2. Android platform selection does not change browser or Apps-in-Toss selection.
3. Native close is called only after whole-app exit confirmation.
4. Android back requests map to cancel, battle abandon, title exit, and ordinary
   route-back actions without duplicate transitions.
5. Android configuration has the approved application ID, label, version,
   portrait orientation, SDK levels, and bundled `dist` directory.
6. Signing setup refuses overwrite and detects missing or mismatched key data.
7. The release APK passes `apksigner verify --verbose --print-certs`; its
   manifest and badging match the approved identifiers and SDK levels.
8. An API 36 emulator can install and launch the release APK without a fatal
   exception. Title, tower, and battle screenshots are captured.
9. Existing typecheck, focused Vitest suites, asset validation, source policy,
   browser build, AIT build, and explicit AIT artifact verification still pass.

The pre-change plain `npm test` command did not finish within a fresh three-minute
run under Node 24.15.0, so it is an unresolved baseline signal rather than a
passing gate. Implementation must run focused tests with explicit results and
retry the full suite with diagnostics; any remaining non-termination is reported
separately and is not hidden by Android success.

## Completion evidence

Delivery is complete only when all of the following exist and are freshly
verified:

- a committed Android source project and reproducible scripts;
- the external permanent keystore plus its DPAPI-protected credentials and
  metadata;
- `artifacts/android/teppu-1.0.0-release.apk` plus checksum;
- signature and manifest verification output;
- emulator install, launch, logcat, and screenshot evidence, or an explicit
  virtualization blocker if the host cannot run an emulator;
- a fresh Apps-in-Toss `.ait` artifact that passes the explicit package verifier;
  and
- documentation for rebuilding, backing up the signing key, and performing the
  remaining human ONE store console steps.

## Primary references

- Capacitor documentation: <https://capacitorjs.com/docs>
- Capacitor 8.5.0 Android template versions:
  <https://raw.githubusercontent.com/ionic-team/capacitor/8.5.0/android-template/variables.gradle>
- ONE store Android binary guidance:
  <https://onestore-dev.gitbook.io/dev/docs/apps/android/binary>
