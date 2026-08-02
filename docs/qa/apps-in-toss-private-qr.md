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
| A3 | `npm run test:delivery-gates` | Archive, dependency-policy, source-policy, and checklist contract tests all pass. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A4 | `npm run test:e2e` | Both required portrait projects pass, including routing, controls, lifecycle, and equal-board layout. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A5 | `npm run check:dependency-audit` | Exit 0 only for the reviewed records; final line reports `status=PENDING_UPSTREAM` and never claims a clean audit. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A6 | `npm run build:ait` | Exit 0 using the exact console-registered app ID and 600x600 uploaded icon URL. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A7 | `npm run check:ait` | Exactly one `.ait`; every entry is listed; uncompressed size is at most 104857600 bytes; vulnerable package markers are zero. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |
| A8 | `npm run check:source-policy` | No authored runtime/config finding for forbidden dynamic code, WebGPU, server rendering, or iframe usage. | `PENDING_AUTOMATED` | `ATTACH_OUTPUT` |

### Artifact identity

| Field | Recorded value |
| --- | --- |
| Git commit | `ATTACH_COMMIT` |
| Console app ID / display name | `ATTACH_CONSOLE_ID_AND_NAME` |
| `.ait` relative path | `ATTACH_AIT_PATH` |
| `.ait` SHA-256 | `ATTACH_SHA256` |
| Uncompressed bytes / entry count | `ATTACH_AIT_SCAN_SUMMARY` |
| `AIT_ICON_URL` and uploaded icon evidence | `ATTACH_ICON_EVIDENCE` |
| Node version and execution time | `ATTACH_RUNTIME_AND_TIME` |

## Device and console evidence

Every row below is device-only and remains `PENDING_EXTERNAL` until a workspace member runs it against the artifact identified above.

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

## Gate decision

- A private-QR claim is prohibited while any automated row lacks exact-commit evidence or any device row remains `PENDING_EXTERNAL`.
- Public submission stays `BLOCKED` while the dependency exception is active. An official compatible fix, a fully revalidated major-version migration, or separate formal risk acceptance is required before changing this decision.
- Repository automation cannot substitute for console credentials, Sandbox execution, or physical-device verification.
