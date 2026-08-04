# Apps-in-Toss Private QR QA Gate

- Scope: private prototype only
- Device-only status: `PENDING_EXTERNAL`
- Dependency status: `PENDING_UPSTREAM`
- Public submission: `BLOCKED`

This checklist separates repository automation from evidence that requires Apps-in-Toss console access, Sandbox apps, physical devices, and the real Toss app. Do not change a placeholder to `PASS` without attaching the command output or device evidence, build identity, date, operator, and tested OS/app version.

A passing archive scan means only that the reviewed package markers were not found in the shipped `.ait` paths or textual payloads. It does not mean the installed toolchain has zero vulnerabilities. The controlling exception remains [`docs/security/dependency-audit-exception.md`](../security/dependency-audit-exception.md) with status `PENDING_UPSTREAM`.

## Automated evidence

Run every command separately under the repository's supported Node 24 runtime. Replace `ATTACH_OUTPUT` only with retained output from the exact commit and artifact being tested.

| ID | Command | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| A1 | `npm run typecheck` | Exit 0. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A2 | `npm test` | Exit 0 with no failed unit/integration tests. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A3 | `npm run test:delivery-gates` | Asset validation, QR-config, isolated AIT staging, explicit-archive, dependency-policy, source-policy, and checklist contract tests all pass. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A4 | `npm run test:e2e` | Both required portrait projects pass, including routing, controls, lifecycle, and equal-board layout. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A5 | `npm run check:dependency-audit` | Exit 0 only for the reviewed records; final line reports `status=PENDING_UPSTREAM` and never claims a clean audit. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A6 | `QR_EVIDENCE=1 AIT_APP_NAME=ATTACH_CONSOLE_ID AIT_DISPLAY_NAME=ATTACH_DISPLAY_NAME AIT_ICON_URL=ATTACH_PUBLIC_HTTPS_ICON_URL AIT_ARTIFACT_PATH=artifacts/ait/game.ait npm run build:ait` | `QR_EVIDENCE=1` requires all supplied nonblank console metadata and stages only the exact build at the explicit `AIT_ARTIFACT_PATH`. This is automated config/package proof only. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A7 | `npm run check:ait -- artifacts/ait/game.ait` | The explicit `.ait` path is inspected; every entry is listed; uncompressed size is at most 104857600 bytes; vulnerable package markers are zero. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A8 | `npm run check:source-policy` | No authored runtime/config finding for forbidden dynamic code, WebGPU, server rendering, or iframe usage. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |

- `npm run check:assets` is the local authored-asset/header gate. It permits the checked-in procedural fallback, while `ASSETS_REQUIRED=1 npm run check:assets` requires a full approved pack.
- `npm run build:ait` runs the config gate before the local Apps-in-Toss CLI; use the A6 environment values for QR-evidence config/package proof.
- `npm run check:ait-config` reports local config when `QR_EVIDENCE` is absent. With `QR_EVIDENCE=1`, it checks only the supplied `AIT_APP_NAME`, `AIT_DISPLAY_NAME`, and public HTTPS-shaped `AIT_ICON_URL`; it does not fetch the URL.

### Artifact identity

| Field | Recorded value |
| --- | --- |
| Git commit | `ATTACH_COMMIT` |
| QR evidence mode | `QR_EVIDENCE=ATTACH_VALUE` |
| Console app ID | `AIT_APP_NAME=ATTACH_CONSOLE_ID` |
| Console display name | `AIT_DISPLAY_NAME=ATTACH_DISPLAY_NAME` |
| Hosted icon URL | `AIT_ICON_URL=ATTACH_PUBLIC_HTTPS_ICON_URL` |
| Explicit `.ait` relative path | `AIT_ARTIFACT_PATH=ATTACH_AIT_PATH` |
| Exact `.ait` SHA-256 | `ATTACH_SHA256_FROM_EXACT_AIT_ARTIFACT_PATH` |
| Uncompressed bytes / entry count | `ATTACH_AIT_SCAN_SUMMARY` |
| `AIT_ICON_URL` and uploaded icon evidence | `ATTACH_ICON_EVIDENCE` |
| Node version and execution time | `ATTACH_RUNTIME_AND_TIME` |

## Device and console evidence

The passing automated config/package proof does not prove URL reachability, console registration or ownership, uploaded-icon byte equality, Sandbox launch, real-Toss QR launch, or physical-device behavior. Every row below remains `PENDING_EXTERNAL` until a workspace member runs it against the artifact identified above.

| ID | Required check and exact expected result | Status | Evidence |
| --- | --- | --- | --- |
| D1 | The console app ID/display name match the artifact, `AIT_ICON_URL` identifies the uploaded 600x600 original icon, and the latest Android and iOS Sandbox apps launch the `.ait` and return a mock game user key without boot failure. | `PENDING_EXTERNAL` | `ATTACH_ANDROID_AND_IOS_SANDBOX` |
| D2 | A console private QR opens in the real Toss app and returns a stable HASH identity; `INVALID_CATEGORY`, `ERROR`, and unsupported-app-version screens do not appear. | `PENDING_EXTERNAL` | `ATTACH_REAL_TOSS_QR` |
| D3 | Portrait lock, Dynamic Island/Safe Area, the native game X, the in-app exit confirmation, and confirmed `closeView()` work without overlap or browser-history navigation. | `PENDING_EXTERNAL` | `ATTACH_LAYOUT_AND_EXIT_VIDEO` |
| D4 | Both equal 10x20 boards remain visible at once; joystick, single rotation, all three items, AI item effects, incoming/offset/return effects, and resume countdown are usable. | `PENDING_EXTERNAL` | `ATTACH_GAMEPLAY_VIDEO` |
| D5 | Backgrounding immediately stops match ticks, AI, item timers, sound, and held input; foregrounding resumes only after the 3-2-1 countdown. | `PENDING_EXTERNAL` | `ATTACH_LIFECYCLE_VIDEO_AND_LOG` |
| D6 | A ten-minute match has no sustained frame collapse, white screen, runaway memory growth, or lost WebGL context; decorative particles reduce before critical effects disappear. | `PENDING_EXTERNAL` | `ATTACH_TEN_MINUTE_PROFILE` |
| D7 | The first usable screen appears within 10 seconds and no bottom sheet opens automatically. | `PENDING_EXTERNAL` | `ATTACH_COLD_LAUNCH_TIMING` |
| D8 | Console visibility remains private and the build is not submitted for public review. | `PENDING_EXTERNAL` | `ATTACH_CONSOLE_VISIBILITY` |
| D9 | The retained Node 24 dependency-audit output and final `.ait` entry/content scan are attached together; the accepted toolchain risk is still recorded as `PENDING_UPSTREAM`, not zero vulnerabilities. | `PENDING_EXTERNAL` | `ATTACH_SECURITY_OUTPUTS` |

## Same-origin account-isolation protocol

This remains `PENDING_EXTERNAL` until every step is captured on a real console-authorized physical device. Automated unit isolation alone is not device evidence.

1. Fix one same private QR/origin and one physical device/WebView. Record two authorized test accounts as A and B. Do not reinstall the app, clear WebView/app data, clear localStorage, or change the QR URL/origin.
2. Sign in as A, open the private QR, create and persist a distinctive A state (for example, floor 3 unlocked with sound off and haptics on), close the view, and capture the visible saved state/evidence label.
3. Switch to B without clearing the WebView, reopen the exact same private QR/origin, and verify B starts at defaults with none of A's cleared floors or settings.
4. Create and persist a distinct B state (for example, only floor 2 unlocked with sound on and haptics off), close the view, and capture it.
5. Switch back to A without clearing the WebView, reopen the same private QR/origin, and verify A's original state is unchanged and contains none of B's distinct progression or settings.

Security-first legacy tradeoff: Apps HASH sessions intentionally do not auto-adopt owner-ambiguous unkeyed data. Preserving unchanged raw legacy data is recovery evidence for rollback or manual support; it is not proof of automatic user-visible continuity.

## Gate decision

- A private-QR claim is prohibited while any automated row lacks exact-commit evidence or any device row remains `PENDING_EXTERNAL`.
- Public submission stays `BLOCKED` while the dependency exception is active. An official compatible fix, a fully revalidated major-version migration, or separate formal risk acceptance is required before changing this decision.
- Repository automation cannot substitute for console credentials, Sandbox execution, or physical-device verification.
