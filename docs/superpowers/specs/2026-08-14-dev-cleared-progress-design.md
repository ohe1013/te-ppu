# Development Cleared Progress Design

## Goal

Make `npm run dev` open a local testing profile that has completed every tower floor and the owl battle through Hard difficulty. Keep normal development progress available through `npm run dev:clean`, and never include the cleared profile in Android, Apps-in-Toss, E2E, or production web builds.

## User-visible behavior

- `npm run dev` starts with profile initials `ADM` and character `hero-engineer`.
- Easy, Normal, and Hard are unlocked.
- Floors 1 through 5 are marked cleared on every difficulty.
- The owl battle is marked defeated on every difficulty.
- Hard is selected when the cleared profile is first created.
- Local best scores and pending leaderboard submissions start empty. The fixture must not create or submit a fabricated ranking score.
- The existing character and initials controls remain usable, and settings or profile changes may persist within the development-cleared profile.
- `npm run dev:clean` retains the current browser-development behavior and storage namespace.

## Architecture

Add a dedicated Vite mode used only by `npm run dev`. That mode enables an explicit development-cleared flag while retaining browser runtime behavior. Move the existing browser-development command to `npm run dev:clean`.

The flag selects a development-only progress repository factory in application composition. The factory uses a storage namespace disjoint from the normal browser, Android, Apps-in-Toss, and identity-scoped namespaces. On the first load for an identity, it returns and persists a validated schema-v5 cleared fixture. Later loads use the same isolated saved state so profile and settings changes survive refreshes.

The cleared fixture is created by a pure progression helper. It clones the canonical default state, applies the `ADM` profile, selects Hard, unlocks all difficulties, and sets every difficulty run to floor 5 with all floors and the owl marked cleared. It does not populate scores or leaderboard submission queues.

## Isolation and safety

- The cleared flag is false unless the dedicated local Vite mode explicitly sets it.
- `npm run build:web`, `npm run build:android:web`, Apps-in-Toss packaging, and E2E mode keep their existing environment files and repository factory.
- The development-cleared repository never reads, migrates, overwrites, or backs up the normal browser progress key.
- Tests must prove the cleared and normal storage keys differ and that production-oriented modes do not enable the cleared factory.
- Existing user-owned `tmp/` content remains outside this work.

## Error handling

The development-cleared repository follows the existing local repository behavior for read, backup, and write failures. Corrupt data in its isolated namespace is backed up only under a development-cleared backup prefix and then reset to the cleared fixture rather than the ordinary default fixture.

## Verification

Use test-driven development for each behavior:

1. A progression unit test proves the fixture has `ADM`, `hero-engineer`, Hard selected, all difficulties unlocked, every floor cleared, every owl defeated, and no fabricated scores.
2. Repository tests prove first-load seeding, persistence after a save, corruption recovery to the cleared fixture, and storage-key isolation.
3. Application-composition tests prove only the explicit development-cleared flag selects the special factory.
4. Script or configuration tests prove `npm run dev` uses the cleared mode while `npm run dev:clean`, Android, Apps-in-Toss, web build, and E2E remain unchanged.
5. Focused tests, type checking, the full Vitest suite, and a browser smoke check must pass before delivery.

## Delivery

Commit the feature on `feat/pve-delivery`. The user runs `npm run dev` from `.worktrees/delivery` and opens the printed Vite URL to test the completed tower. No Android APK or Apps-in-Toss artifact is required for this request.
