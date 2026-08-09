# Arcade Profile, Score Run, and Firestore Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an arcade title/onboarding flow, three equal-strength playable characters, a deterministic whole-tower score run, local best records, and an optional anonymous Firestore TOP 20 leaderboard while improving NEXT previews and portrait framing.

**Architecture:** Keep player identity, score calculation, progression persistence, and leaderboard transport in separate pure modules. `AppRoot` orchestrates route transitions and a memory-only `ScoreRunController`; `TowerController` remains the owner of persisted progress; UI screens consume typed view data and never import Firebase. Firebase is selected behind a `LeaderboardRepository` only when all four Vite config values exist, with local records remaining authoritative for offline play.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 4, Testing Library, Playwright 1.62, Firebase JS SDK 12.17.1, Firestore Security Rules, Python/Pillow authored-asset tooling.

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on `feat/pve-delivery`.
- Preserve the existing untracked `tmp/` tree; stage only explicit files for each task.
- Keep the package engine contract `node >=24.15.0 <25`; the current host reports Node 22, so record that mismatch if Node 24 is unavailable during final verification.
- Do not require Firebase config, network access, or a Firebase project for boot, local play, unit tests, asset validation, or the web build.
- Player initials must match `^[A-Z]{3}$` exactly.
- Playable IDs are exactly `hero-engineer`, `cloud-courier`, and `star-alchemist`.
- All three playable characters use identical core, AI, item, attack, and score behavior.
- Score values are fixed: line clears `100/300/500/800`, attack line `50`, item use `100`, match win `1,000`, floor clear `2,000`, owl win `5,000`.
- Ranked runs always start at floor 1; loss or draw ends the run; owl victory completes it; a new attempt starts at zero.
- Rankings are separate for EASY, NORMAL, and HARD; do not add a difficulty multiplier.
- Firestore submissions cap `score` at `10,000,000`, `durationTicks` at `100,000,000`, and `encountersWon` at `16`.
- Treat online scores as prototype client-submitted records. Rules enforce ownership, shape, bounds, and personal-best monotonicity, but no UI, documentation, or handoff may describe them as cheat-proof; competitive integrity requires a future server-side replay/command-log verifier.
- UI components and scoring modules must not import `firebase/*`; only `src/leaderboard/firebase-*` may import the Firebase SDK.
- New character masters must be original project artwork. Do not reproduce characters, logos, UI, sprites, or named visual elements from commercial puzzle games.
- Character full art is `1024x1024` transparent WebP; portraits are `256x256` transparent WebP in `idle/focus/attack/hit/win/loss` states.
- Runtime assets must remain under the existing 30 MiB delivery ceiling.
- Existing modal centering, Apps-in-Toss close behavior, safe areas, and resume 3-2-1 behavior must remain intact.
- The local host has no Java executable. Prepare Firestore Rules and emulator-ready configuration, but do not claim runtime Rules verification until a JRE-backed emulator or Firebase development project has executed them.

---

### Task 1: Player Catalog and Progress Schema v4

**Files:**
- Create: `src/player/catalog.ts`
- Create: `src/player/profile.ts`
- Create: `src/player/index.ts`
- Create: `src/player/profile.test.ts`
- Modify: `src/progression/schema.ts`
- Modify: `src/progression/index.ts`
- Modify: `tests/progression/schema.test.ts`
- Modify: `tests/progression/localProgressRepository.test.ts`
- Modify: `tests/progression/progressRepositoryFactory.test.ts`
- Modify: `tests/progression/tower.test.ts`
- Modify: `tests/app/towerController.test.ts`
- Modify: `src/app/AppRoot.test.tsx`

**Interfaces:**
- Produces: `PlayerCharacterId`, `PLAYER_CHARACTER_IDS`, `PlayerCharacterDefinition`, `PLAYER_CHARACTERS`, `PlayerProfile`, `isPlayerCharacterId()`, `isPlayerProfile()`.
- Produces: `ScoreRecord`, `LocalBestScores`, `PendingLeaderboardSubmissions`, and `ProgressState` schema 4 fields `profile`, `localBestScores`, `pendingLeaderboardSubmissions`.
- Preserves: v1/v2/v3 migration, strict exact-key parsing, clone isolation, corruption backup behavior.

- [ ] **Step 1: Write failing profile and schema tests**

```ts
// src/player/profile.test.ts
import { describe, expect, it } from 'vitest';
import {
  PLAYER_CHARACTER_IDS,
  isPlayerCharacterId,
  isPlayerProfile,
} from './index';

describe('player profile', () => {
  it('accepts only three uppercase initials and the three playable ids', () => {
    expect(PLAYER_CHARACTER_IDS).toEqual([
      'hero-engineer',
      'cloud-courier',
      'star-alchemist',
    ]);
    expect(isPlayerProfile({ initials: 'RVT', characterId: 'hero-engineer' })).toBe(true);
    expect(isPlayerProfile({ initials: 'rvT', characterId: 'hero-engineer' })).toBe(false);
    expect(isPlayerProfile({ initials: 'FOUR', characterId: 'hero-engineer' })).toBe(false);
    expect(isPlayerCharacterId('demon-king')).toBe(false);
  });
});
```

```ts
// tests/progression/schema.test.ts additions
it('migrates schema 3 to schema 4 without changing tower progress or settings', () => {
  const parsed = parsePersistedProgress(VERSION_3_PROGRESS);
  expect(parsed?.migrated).toBe(true);
  expect(parsed?.state).toMatchObject({
    schemaVersion: 4,
    profile: null,
    localBestScores: { easy: null, normal: null, hard: null },
    pendingLeaderboardSubmissions: {},
    difficultyProgress: VERSION_3_PROGRESS.difficultyProgress,
    settings: VERSION_3_PROGRESS.settings,
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx vitest run src/player/profile.test.ts tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts`

Expected: FAIL because `src/player` exports do not exist and schema 3 is still the current shape.

- [ ] **Step 3: Add the player catalog and validators**

```ts
// src/player/catalog.ts
export const PLAYER_CHARACTER_IDS = [
  'hero-engineer',
  'cloud-courier',
  'star-alchemist',
] as const;

export type PlayerCharacterId = typeof PLAYER_CHARACTER_IDS[number];

export interface PlayerCharacterDefinition {
  readonly id: PlayerCharacterId;
  readonly name: '리벳' | '루미' | '세라';
  readonly role: string;
  readonly title: string;
  readonly story: string;
  readonly palette: readonly [string, string, string];
}

export const PLAYER_CHARACTERS: Readonly<Record<PlayerCharacterId, PlayerCharacterDefinition>> = {
  'hero-engineer': {
    id: 'hero-engineer', name: '리벳', role: '견습 마도공학자',
    title: '별빛 수리공', story: '고장 난 별빛 동력핵을 수리한다.',
    palette: ['#35c8c2', '#fff4cf', '#b86f3c'],
  },
  'cloud-courier': {
    id: 'cloud-courier', name: '루미', role: '구름 우편기사',
    title: '바람길의 전령', story: '멈춘 바람길을 되찾는다.',
    palette: ['#4d8fff', '#ffd84d', '#f8fbff'],
  },
  'star-alchemist': {
    id: 'star-alchemist', name: '세라', role: '별가루 연금술사',
    title: '빛의 추적자', story: '도난당한 동력핵의 빛을 추적한다.',
    palette: ['#8c5bd9', '#ff76aa', '#dce4ef'],
  },
};
```

```ts
// src/player/profile.ts
import { PLAYER_CHARACTER_IDS, type PlayerCharacterId } from './catalog';

export const PLAYER_INITIALS_PATTERN = /^[A-Z]{3}$/;
export interface PlayerProfile {
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
}

export function isPlayerCharacterId(value: unknown): value is PlayerCharacterId {
  return typeof value === 'string'
    && PLAYER_CHARACTER_IDS.includes(value as PlayerCharacterId);
}

export function isPlayerProfile(value: unknown): value is PlayerProfile {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && 'initials' in value
    && typeof value.initials === 'string'
    && PLAYER_INITIALS_PATTERN.test(value.initials)
    && 'characterId' in value
    && isPlayerCharacterId(value.characterId);
}
```

- [ ] **Step 4: Upgrade progression parsing and cloning to schema 4**

```ts
// src/progression/schema.ts core additions
export interface ScoreRecord {
  readonly schemaVersion: 1;
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly achievedAt: string;
}

export interface ProgressState {
  schemaVersion: 4;
  profile: PlayerProfile | null;
  localBestScores: Record<Difficulty, ScoreRecord | null>;
  pendingLeaderboardSubmissions: Partial<Record<Difficulty, ScoreRecord>>;
  selectedDifficulty: Difficulty;
  unlockedDifficulties: Record<Difficulty, boolean>;
  difficultyProgress: DifficultyProgressMap;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}
```

Implement exact-key parsers for profile, score records, all three best-score keys, and the partial pending map. Rename the current schema-3 parser to `parseVersion3Progress()`, add `parseVersion4Progress()`, and make every older migration terminate in `migrateVersion3()` with the new fields initialized to `null/{}`. Clone every nested record and never return persisted object references.

- [ ] **Step 5: Run progression tests and typecheck**

Run: `npx vitest run src/player/profile.test.ts tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS after updating test fixtures from schema 3 to schema 4 helpers.

- [ ] **Step 6: Commit the profile and schema slice**

```bash
git add -- src/player src/progression/schema.ts src/progression/index.ts tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts src/app/AppRoot.test.tsx
git commit -m "feat: persist arcade player profiles"
```

---

### Task 2: Deterministic Score Rules and Whole-Tower Run Controller

**Files:**
- Create: `src/scoring/types.ts`
- Create: `src/scoring/score-rules.ts`
- Create: `src/scoring/score-run-controller.ts`
- Create: `src/scoring/index.ts`
- Create: `src/scoring/score-rules.test.ts`
- Create: `src/scoring/score-run-controller.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `MatchResult`, `Difficulty`, `Floor`, `EncounterIndex`, `PlayerProfile`, `ScoreRecord`.
- Produces: `scorePlayerEvents(events)`, `isBetterScore(candidate, current)`, `ScoreRunSnapshot`, `ScoreRunController`, `createScoreRecord(summary, profile, achievedAt)`.
- Invariant: the controller is memory-only and never reads storage, UI, Firebase, or progression state.

- [ ] **Step 1: Write failing score-table tests**

```ts
// src/scoring/score-rules.test.ts
import { describe, expect, it } from 'vitest';
import { scorePlayerEvents } from './score-rules';

describe('scorePlayerEvents', () => {
  it.each([[1, 100], [2, 300], [3, 500], [4, 800]] as const)(
    'scores a %i-line clear as %i',
    (amount, score) => {
      expect(scorePlayerEvents([
        { type: 'lines-cleared', side: 'player', amount },
      ])).toBe(score);
    },
  );

  it('adds attacks and item uses while ignoring every opponent event', () => {
    expect(scorePlayerEvents([
      { type: 'attack-sent', side: 'player', amount: 3 },
      { type: 'item-used', side: 'player', item: 'freeze' },
      { type: 'lines-cleared', side: 'opponent', amount: 4 },
      { type: 'attack-sent', side: 'opponent', amount: 99 },
    ])).toBe(250);
  });
});
```

- [ ] **Step 2: Write failing run-controller tests**

```ts
// src/scoring/score-run-controller.test.ts
it('forces floor one, advances after each three-win floor, and ends on loss', () => {
  const run = ScoreRunController.start('easy');
  expect(run.canSelectFloor(1)).toBe(true);
  expect(run.canSelectFloor(2)).toBe(false);

  run.completeMatch({ floor: 1, encounterIndex: 0, isOwl: false, result: 'win', durationTicks: 600 });
  run.completeMatch({ floor: 1, encounterIndex: 1, isOwl: false, result: 'win', durationTicks: 500 });
  run.completeMatch({ floor: 1, encounterIndex: 2, isOwl: false, result: 'win', durationTicks: 400 });
  expect(run.snapshot).toMatchObject({ score: 5_000, requiredFloor: 2, encountersWon: 3 });

  const ended = run.completeMatch({
    floor: 2, encounterIndex: 0, isOwl: false, result: 'loss', durationTicks: 300,
  });
  expect(ended.kind).toBe('ended');
  expect(run.snapshot.phase).toBe('ended');
});

it('awards the normal win and owl bonuses and records all sixteen victories', () => {
  const run = ScoreRunController.start('easy');
  for (const floor of [1, 2, 3, 4, 5] as const) {
    for (const encounterIndex of [0, 1, 2] as const) {
      run.completeMatch({
        floor,
        encounterIndex,
        isOwl: false,
        result: 'win',
        durationTicks: 240,
      });
    }
  }
  const result = run.completeMatch({
    floor: 5, encounterIndex: 2, isOwl: true, result: 'win', durationTicks: 240,
  });
  expect(result).toMatchObject({ kind: 'ended', summary: { owlDefeated: true, encountersWon: 16 } });
  expect(run.snapshot.score).toBe(31_000);
});
```

- [ ] **Step 3: Run scoring tests and confirm RED**

Run: `npx vitest run src/scoring/score-rules.test.ts src/scoring/score-run-controller.test.ts`

Expected: FAIL because the scoring modules do not exist.

- [ ] **Step 4: Implement immutable score rules and controller state**

```ts
// src/scoring/score-rules.ts
const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800] as const;

export function scorePlayerEvents(events: readonly GameEvent[]): number {
  return events.reduce((score, event) => {
    if (event.side !== 'player') return score;
    if (event.type === 'lines-cleared') {
      const amount = Math.max(0, Math.min(4, event.amount ?? 0));
      return score + LINE_CLEAR_SCORES[amount]!;
    }
    if (event.type === 'attack-sent') return score + Math.max(0, event.amount ?? 0) * 50;
    if (event.type === 'item-used') return score + 100;
    return score;
  }, 0);
}
```

```ts
// src/scoring/types.ts
export interface MatchScoreOutcome {
  readonly floor: Floor;
  readonly encounterIndex: EncounterIndex;
  readonly isOwl: boolean;
  readonly result: MatchResult;
  readonly durationTicks: number;
}

export interface ScoreRunSnapshot {
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly durationTicks: number;
  readonly requiredFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly phase: 'active' | 'ended';
}
```

Implement `ScoreRunController` with private mutable state and cloned `snapshot` output. `recordEvents()` adds only `scorePlayerEvents()`. `completeMatch()` adds duration, gives `1_000` only for wins, gives `2_000` when non-owl encounter index 2 is won, gives `5_000` for owl victory, advances `requiredFloor`, and ends immediately on loss/draw or owl completion. Reject calls after end and mismatched floors with `RangeError`.

- [ ] **Step 5: Implement record comparison and conversion**

```ts
export function isBetterScore(candidate: ScoreRecord, current: ScoreRecord | null): boolean {
  return current === null
    || candidate.score > current.score
    || (candidate.score === current.score
      && candidate.durationTicks < current.durationTicks);
}

export function createScoreRecord(
  summary: EndedScoreRun,
  profile: PlayerProfile,
  achievedAt: string,
): ScoreRecord {
  return {
    schemaVersion: 1,
    initials: profile.initials,
    characterId: profile.characterId,
    difficulty: summary.difficulty,
    score: summary.score,
    durationTicks: summary.durationTicks,
    reachedFloor: summary.reachedFloor,
    encountersWon: summary.encountersWon,
    owlDefeated: summary.owlDefeated,
    achievedAt,
  };
}
```

- [ ] **Step 6: Run scoring tests and commit**

Run: `npx vitest run src/scoring`

Expected: PASS.

```bash
git add -- src/scoring
git commit -m "feat: add deterministic tower score runs"
```

---

### Task 3: Optional Firebase Leaderboard Boundary and Rules

**Files:**
- Create: `src/leaderboard/types.ts`
- Create: `src/leaderboard/firebase-config.ts`
- Create: `src/leaderboard/firebase-gateway.ts`
- Create: `src/leaderboard/localLeaderboardRepository.ts`
- Create: `src/leaderboard/firestoreLeaderboardRepository.ts`
- Create: `src/leaderboard/createLeaderboardRepository.ts`
- Create: `src/leaderboard/index.ts`
- Create: `src/leaderboard/firebase-config.test.ts`
- Create: `src/leaderboard/firestoreLeaderboardRepository.test.ts`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `firebase.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: `Difficulty`, `ScoreRecord`, `PlayerCharacterId`.
- Produces: `LeaderboardEntry`, `LeaderboardRepository`, `LeaderboardReadResult`, `LeaderboardWriteResult`, `FirebaseWebConfig`, `parseFirebaseWebConfig()`, `createLeaderboardRepository()`.
- Runtime dependency: exact `firebase@12.17.1`.
- Local limitation: Rules files are prepared and reviewed, but emulator execution remains external until Java is available.

- [ ] **Step 1: Write failing config and repository contract tests**

```ts
// src/leaderboard/firebase-config.test.ts
it('enables Firebase only when all four trimmed values exist', () => {
  expect(parseFirebaseWebConfig({})).toBeNull();
  expect(() => parseFirebaseWebConfig({
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_AUTH_DOMAIN: 'domain',
  })).toThrow(/partial Firebase configuration/i);
  expect(parseFirebaseWebConfig({
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_AUTH_DOMAIN: 'game.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'game',
    VITE_FIREBASE_APP_ID: '1:web:abc',
  })).toEqual({
    apiKey: 'key', authDomain: 'game.firebaseapp.com', projectId: 'game', appId: '1:web:abc',
  });
});
```

```ts
// src/leaderboard/firestoreLeaderboardRepository.test.ts
it('writes only a better personal record and reads an ordered top twenty', async () => {
  const gateway = new FakeFirestoreGateway();
  const repository = createFirestoreLeaderboardRepository(gateway);
  await expect(repository.submitBest(RECORD)).resolves.toMatchObject({ ok: true });
  expect(gateway.writes[0]).toMatchObject({
    path: 'leaderboards/easy/players/firebase-user',
    data: { initials: 'RVT', characterId: 'hero-engineer', score: RECORD.score },
  });
  await expect(repository.getTop('easy', 20)).resolves.toMatchObject({
    ok: true,
    source: 'firestore',
  });
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run src/leaderboard/firebase-config.test.ts src/leaderboard/firestoreLeaderboardRepository.test.ts`

Expected: FAIL because leaderboard modules do not exist.

- [ ] **Step 3: Install the modular Firebase client**

Run: `npm install firebase@12.17.1 --save-exact`

Expected: `package.json` and `package-lock.json` record exactly `firebase: 12.17.1` without adding Firebase development servers to runtime dependencies.

- [ ] **Step 4: Implement repository types and local mode**

```ts
// src/leaderboard/types.ts
export interface LeaderboardEntry extends Omit<ScoreRecord, 'achievedAt'> {
  readonly userId: string;
  readonly updatedAt: string;
}

export type LeaderboardReadResult =
  | {
      readonly ok: true;
      readonly source: 'local' | 'firestore';
      readonly currentUserId: string | null;
      readonly entries: readonly LeaderboardEntry[];
    }
  | { readonly ok: false; readonly reason: 'AUTH_FAILED' | 'READ_FAILED'; readonly entries: readonly [] };

export type LeaderboardWriteResult =
  | { readonly ok: true; readonly source: 'local' | 'firestore' }
  | { readonly ok: false; readonly reason: 'AUTH_FAILED' | 'WRITE_FAILED' };

export interface LeaderboardRepository {
  readonly kind: 'local' | 'firestore';
  getTop(difficulty: Difficulty, limit: 20): Promise<LeaderboardReadResult>;
  submitBest(record: ScoreRecord): Promise<LeaderboardWriteResult>;
}
```

`createLocalLeaderboardRepository()` returns `kind: 'local'`, an empty remote list, and successful no-op writes. `RankingScreen` will merge the persisted local best record itself, so no second localStorage key is introduced.

- [ ] **Step 5: Implement the Firestore gateway and repository**

Use `initializeApp`, `getAuth`, `signInAnonymously`, `getFirestore`, `runTransaction`, `collection`, `query`, `orderBy`, `limit`, `getDocs`, and `serverTimestamp` only inside `src/leaderboard/firebase-*` and `firestoreLeaderboardRepository.ts`. Authentication is lazy and cached. A transaction reads the UID document and writes only if `isBetterScore()` approves the candidate. The Firestore serializer omits `difficulty`, `achievedAt`, and `userId`; reads rehydrate `difficulty` from the collection path, `userId` from the document ID, and `updatedAt` from the Firestore timestamp.

```ts
export function createLeaderboardRepository(
  env: Record<string, string | boolean | undefined>,
  onConfigurationError: (error: Error) => void = () => undefined,
): LeaderboardRepository {
  try {
    const config = parseFirebaseWebConfig(env);
    return config === null
      ? createLocalLeaderboardRepository()
      : createFirestoreLeaderboardRepository(createFirebaseGateway(config));
  } catch (error) {
    onConfigurationError(error instanceof Error ? error : new Error(String(error)));
    return createLocalLeaderboardRepository();
  }
}
```

Add the four optional `VITE_FIREBASE_*` declarations to `src/vite-env.d.ts`. Never add real Firebase values, a project ID, credentials, or `.env` files to the repository.

- [ ] **Step 6: Add Firestore Rules and indexes**

```rules
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function validDifficulty(value) {
      return value == 'easy' || value == 'normal' || value == 'hard';
    }
    function validCharacter(value) {
      return value == 'hero-engineer'
        || value == 'cloud-courier'
        || value == 'star-alchemist';
    }
    function validScore(data) {
      return data.keys().hasOnly([
        'schemaVersion', 'initials', 'characterId', 'score', 'durationTicks',
        'reachedFloor', 'encountersWon', 'owlDefeated', 'updatedAt'
      ])
      && data.schemaVersion == 1
      && data.initials is string
      && data.initials.matches('^[A-Z]{3}$')
      && validCharacter(data.characterId)
      && data.score is int && data.score >= 0 && data.score <= 10000000
      && data.durationTicks is int && data.durationTicks >= 0 && data.durationTicks <= 100000000
      && data.reachedFloor is int && data.reachedFloor >= 1 && data.reachedFloor <= 5
      && data.encountersWon is int && data.encountersWon >= 0 && data.encountersWon <= 16
      && data.owlDefeated is bool
      && (!data.owlDefeated || (data.reachedFloor == 5 && data.encountersWon == 16))
      && data.updatedAt == request.time;
    }
    function improvesScore(next, current) {
      return next.score > current.score
        || (next.score == current.score && next.durationTicks < current.durationTicks);
    }
    match /leaderboards/{difficulty}/players/{userId} {
      allow read: if request.auth != null && validDifficulty(difficulty);
      allow create: if request.auth != null
        && request.auth.uid == userId
        && validDifficulty(difficulty)
        && validScore(request.resource.data);
      allow update: if request.auth != null
        && request.auth.uid == userId
        && validDifficulty(difficulty)
        && validScore(request.resource.data)
        && improvesScore(request.resource.data, resource.data);
      allow delete: if false;
    }
  }
}
```

`firestore.indexes.json` must define collection group `players` with `score DESCENDING`, `durationTicks ASCENDING`, `updatedAt ASCENDING`. `firebase.json` must point to `firestore.rules` and `firestore.indexes.json` without embedding a project ID.

- [ ] **Step 7: Run client tests, typecheck, and static review**

Run: `npx vitest run src/leaderboard`

Expected: PASS without contacting Firebase.

Run: `npm run typecheck`

Expected: PASS.

Run: `Get-Content firestore.rules | Select-String -Pattern "request.auth.uid == userId","allow delete: if false","next.durationTicks < current.durationTicks"`

Expected: all three required protections are present. Record that this is a static review, not emulator proof.

- [ ] **Step 8: Commit the leaderboard boundary**

```bash
git add -- package.json package-lock.json src/vite-env.d.ts src/leaderboard firebase.json firestore.rules firestore.indexes.json
git commit -m "feat: prepare optional Firestore leaderboards"
```

---

### Task 4: Arcade Direction Controls, Name Entry, and Character Selection

**Files:**
- Create: `src/ui/arcade/grid-navigation.ts`
- Create: `src/ui/arcade/grid-navigation.test.ts`
- Create: `src/ui/arcade/ArcadeDirectionPad.tsx`
- Create: `src/ui/arcade/ArcadeDirectionPad.test.tsx`
- Create: `src/ui/screens/NameEntryScreen.tsx`
- Create: `src/ui/screens/NameEntryScreen.test.tsx`
- Create: `src/ui/screens/CharacterSelectScreen.tsx`
- Create: `src/ui/screens/CharacterSelectScreen.test.tsx`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- Consumes: `PLAYER_CHARACTERS`, `PlayerCharacterId`, optional player full-art assets.
- Produces: `ArcadeDirection = 'up' | 'down' | 'left' | 'right'`, `moveNameKey()`, `NameEntryScreen({ initialValue, onComplete, onBack })`, `CharacterSelectScreen({ players, onComplete, onBack })`.
- Accessibility: touch, arrow keys, Enter, and Backspace mirror the visible arcade controls.

- [ ] **Step 1: Write failing deterministic grid-navigation tests**

```ts
it('moves through the fixed keyboard without wrapping across row edges', () => {
  expect(moveNameKey('A', 'left')).toBe('A');
  expect(moveNameKey('A', 'right')).toBe('B');
  expect(moveNameKey('F', 'right')).toBe('F');
  expect(moveNameKey('S', 'down')).toBe('Y');
  expect(moveNameKey('W', 'down')).toBe('END');
});
```

- [ ] **Step 2: Write failing screen behavior tests**

```tsx
it('requires exactly three letters before END can complete', async () => {
  const user = userEvent.setup();
  const onComplete = vi.fn();
  render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={onComplete} />);
  expect(screen.getByRole('button', { name: 'END' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'A' }));
  await user.click(screen.getByRole('button', { name: 'B' }));
  await user.click(screen.getByRole('button', { name: 'C' }));
  await user.click(screen.getByRole('button', { name: 'END' }));
  expect(onComplete).toHaveBeenCalledWith('ABC');
});

it('selects one of three equal-strength characters with left and right input', async () => {
  const onComplete = vi.fn();
  render(<CharacterSelectScreen assets={{}} initialCharacterId="hero-engineer" onBack={vi.fn()} onComplete={onComplete} />);
  fireEvent.keyDown(screen.getByTestId('character-select-screen'), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByTestId('character-select-screen'), { key: 'Enter' });
  expect(onComplete).toHaveBeenCalledWith('cloud-courier');
});
```

- [ ] **Step 3: Run focused UI tests and confirm RED**

Run: `npx vitest run src/ui/arcade src/ui/screens/NameEntryScreen.test.tsx src/ui/screens/CharacterSelectScreen.test.tsx`

Expected: FAIL because controls and screens do not exist.

- [ ] **Step 4: Implement the keyboard model and shared direction pad**

Represent keys as five rows with six logical columns. Give `DEL` columns `2-3` and `END` columns `4-5`; vertical movement chooses the destination with the nearest center column. `ArcadeDirectionPad` renders four buttons with Korean accessible labels and calls one `onDirection` callback. Do not reuse game-command `Joystick`, because onboarding directions are focus navigation rather than core commands.

- [ ] **Step 5: Implement final name and character screens**

`NameEntryScreen` owns only draft text and focused key. `CharacterSelectScreen` owns only selected ID. Both expose complete values through callbacks, keep back navigation explicit, and use `ScreenBackdrop`/existing safe-area shell classes. Character cards show name, role, title, story, and art; do not show stats or ability labels.

- [ ] **Step 6: Run tests, typecheck, and commit**

Run: `npx vitest run src/ui/arcade src/ui/screens/NameEntryScreen.test.tsx src/ui/screens/CharacterSelectScreen.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

```bash
git add -- src/ui/arcade src/ui/screens/NameEntryScreen.tsx src/ui/screens/NameEntryScreen.test.tsx src/ui/screens/CharacterSelectScreen.tsx src/ui/screens/CharacterSelectScreen.test.tsx src/ui/screens/screens.css
git commit -m "feat: add arcade profile onboarding screens"
```

---

### Task 5: Title, Ranking, and Profile Routes

**Files:**
- Create: `src/ui/screens/TitleScreen.tsx`
- Create: `src/ui/screens/TitleScreen.test.tsx`
- Create: `src/ui/screens/RankingScreen.tsx`
- Create: `src/ui/screens/RankingScreen.test.tsx`
- Modify: `src/app/app-route.ts`
- Modify: `src/app/app-route.test.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/app/towerController.ts`
- Modify: `tests/app/towerController.test.ts`
- Modify: `src/platform/audio-route.ts`
- Modify: `src/platform/audio-route.test.ts`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- Consumes: profile/catalog/schema outputs from Task 1 and onboarding screens from Task 4.
- Produces routes: `title`, `name-entry`, `character-select`, `ranking`.
- Produces events: `start-run`, `open-ranking`, `change-player`, `name-completed`, `character-selected`, `return-to-title`.
- Produces: `TowerController.updateProfile(profile): Promise<TowerSaveResult>`.

- [ ] **Step 1: Write failing route tests for first-run and returning-player flows**

```ts
it('routes boot to title and a first start through name and character selection', () => {
  let route: AppRoute = { name: 'boot' };
  route = reduceRoute(route, { type: 'boot-ready' });
  expect(route).toEqual({ name: 'title' });
  route = reduceRoute(route, { type: 'start-run', hasProfile: false });
  expect(route).toEqual({ name: 'name-entry', intent: 'start-run' });
  route = reduceRoute(route, { type: 'name-completed', initials: 'RVT' });
  expect(route).toEqual({ name: 'character-select', intent: 'start-run', initials: 'RVT' });
  route = reduceRoute(route, { type: 'character-selected' });
  expect(route).toEqual({ name: 'tower' });
});

it('returns PLAYER CHANGE to title after selection', () => {
  const name = reduceRoute({ name: 'title' }, { type: 'change-player' });
  const character = reduceRoute(name, { type: 'name-completed', initials: 'LUM' });
  expect(reduceRoute(character, { type: 'character-selected' })).toEqual({ name: 'title' });
});
```

- [ ] **Step 2: Write failing AppRoot and controller profile tests**

```tsx
it('shows title after boot and saves a first profile before entering the tower', async () => {
  const user = userEvent.setup();
  const repository = new TestProgressRepository(DEFAULT_PROGRESS);
  renderGame(repository);
  expect(await screen.findByTestId('title-screen')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'START RUN' }));
  await enterInitials(user, 'RVT');
  await chooseCharacter(user, 'hero-engineer');
  expect(await screen.findByTestId('tower-screen')).toBeVisible();
  expect(repository.saves.at(-1)?.profile).toEqual({ initials: 'RVT', characterId: 'hero-engineer' });
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npx vitest run src/app/app-route.test.ts src/app/AppRoot.test.tsx tests/app/towerController.test.ts src/platform/audio-route.test.ts src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.test.tsx`

Expected: FAIL because the new routes and screens do not exist.

- [ ] **Step 4: Implement title and ranking presentation**

`TitleScreen` renders logo, owl, profile card, selected difficulty/local best, and exactly three primary menu actions. `RankingScreen` renders difficulty tabs, a TOP 20 table with rank/initials/character/score/reached status, local fallback, loading, unavailable, and sync-pending states. Locked difficulty tabs remain visible and disabled.

- [ ] **Step 5: Implement route reducer and AppRoot orchestration**

Boot must dispatch to `title`. Store initials in the `character-select` route value, call `controller.updateProfile()` before leaving selection, and preserve the route if save fails so retry remains possible. Returning-player START goes to tower; profile-less START goes to name entry. Map title/onboarding/ranking music to the existing tower track.

- [ ] **Step 6: Run route/UI tests and commit**

Run: `npx vitest run src/app/app-route.test.ts src/app/AppRoot.test.tsx tests/app/towerController.test.ts src/platform/audio-route.test.ts src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.test.tsx`

Expected: PASS.

```bash
git add -- src/app/app-route.ts src/app/app-route.test.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/app/towerController.ts tests/app/towerController.test.ts src/platform/audio-route.ts src/platform/audio-route.test.ts src/ui/screens/TitleScreen.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.tsx src/ui/screens/RankingScreen.test.tsx src/ui/screens/screens.css
git commit -m "feat: add title profile and ranking routes"
```

---

### Task 6: Three-Player Authored Asset Pack

**Files:**
- Create: `public/assets/characters/cloud-courier/full.webp`
- Create: `public/assets/characters/cloud-courier/portrait-idle.webp`
- Create: `public/assets/characters/cloud-courier/portrait-focus.webp`
- Create: `public/assets/characters/cloud-courier/portrait-attack.webp`
- Create: `public/assets/characters/cloud-courier/portrait-hit.webp`
- Create: `public/assets/characters/cloud-courier/portrait-win.webp`
- Create: `public/assets/characters/cloud-courier/portrait-loss.webp`
- Create: `public/assets/characters/star-alchemist/full.webp`
- Create: `public/assets/characters/star-alchemist/portrait-idle.webp`
- Create: `public/assets/characters/star-alchemist/portrait-focus.webp`
- Create: `public/assets/characters/star-alchemist/portrait-attack.webp`
- Create: `public/assets/characters/star-alchemist/portrait-hit.webp`
- Create: `public/assets/characters/star-alchemist/portrait-win.webp`
- Create: `public/assets/characters/star-alchemist/portrait-loss.webp`
- Create: `scripts/import-player-character-sheet.py`
- Modify: `src/assets/types.ts`
- Modify: `src/assets/manifest.ts`
- Modify: `src/assets/asset-manager.ts`
- Modify: `src/assets/asset-manager.test.ts`
- Modify: `src/assets/test-fixtures/complete-manifest.ts`
- Modify: `public/assets/manifest.json`
- Modify: `scripts/generate-authored-assets.py`
- Modify: `scripts/validate-assets.mjs`
- Modify: `scripts/validate-assets.test.mjs`
- Inspect and modify only if framing fails: `public/assets/characters/hero-engineer/full.webp` and `portrait-{idle,focus,attack,hit,win,loss}.webp`

**Interfaces:**
- Consumes: `PlayerCharacterId` and six hero portrait states.
- Produces: asset manifest schema 3 and `CommonAssets.players: Readonly<Record<PlayerCharacterId, PlayerCharacterAssets>>`.
- Produces: two original full-art masters plus twelve expression portraits.

- [ ] **Step 1: Write failing manifest and loader tests**

```ts
it('requires all three playable characters and six portraits in schema 3', () => {
  const parsed = parseAssetManifest(COMPLETE_ASSET_MANIFEST);
  expect(parsed.schemaVersion).toBe(3);
  if (parsed.mode !== 'assets') throw new Error('expected authored assets');
  expect(Object.keys(parsed.common.characters)).toEqual(expect.arrayContaining([
    'hero-engineer', 'cloud-courier', 'star-alchemist',
  ]));
});

it('publishes all three playable bundles from common assets', async () => {
  await manager.loadCommon();
  expect(Object.keys(manager.getCommonAssets()!.players)).toEqual([
    'hero-engineer', 'cloud-courier', 'star-alchemist',
  ]);
});
```

- [ ] **Step 2: Run asset tests and confirm RED**

Run: `npx vitest run src/assets/asset-manager.test.ts`

Expected: FAIL because schema 2 has one singular hero.

Run: `node --test scripts/validate-assets.test.mjs`

Expected: FAIL after fixture expectations are changed to require the two missing players.

- [ ] **Step 3: Generate original character contact sheets with the imagegen skill**

Before any image-generation call, read and follow `C:/Users/USER/.codex/skills/.system/imagegen/SKILL.md`. Generate one transparent 4x2 contact sheet per character: top-left full body, the remaining six used cells as aligned bust portraits for idle/focus/attack/hit/win/loss, and the final cell empty. Inspect each generated sheet before importing.

```text
Cloud courier prompt:
Original cheerful fantasy cloud courier named Lumi for The Gearlight Tower, blue yellow and white palette, winged boots, compact brass mail satchel, cloud-shaped scarf, distinct original silhouette, bright soft 2D fantasy illustration with subtle retro pixel accents, transparent background. Strict 4 by 2 contact sheet with equal guttered cells: full-body neutral pose, then six consistent head-and-shoulders portraits in this exact order idle, focused, attacking, hit, victory, loss; final cell empty. Same face, costume, eye height, lighting and proportions in every cell. No letters, labels, logos, existing game characters, or scenery.

Star alchemist prompt:
Original calm fantasy star-dust alchemist named Sera for The Gearlight Tower, violet pink and silver palette, floating glass astrolabe flask, crescent apron and short cape, distinct original silhouette, bright soft 2D fantasy illustration with subtle retro pixel accents, transparent background. Strict 4 by 2 contact sheet with equal guttered cells: full-body neutral pose, then six consistent head-and-shoulders portraits in this exact order idle, focused, attacking, hit, victory, loss; final cell empty. Same face, costume, eye height, lighting and proportions in every cell. No letters, labels, logos, existing game characters, or scenery.
```

Save source sheets under `tmp/imagegen/cloud-courier-sheet.png` and `tmp/imagegen/star-alchemist-sheet.png`. These source sheets remain untracked; only validated runtime WebPs are committed.

- [ ] **Step 4: Implement deterministic contact-sheet import**

`scripts/import-player-character-sheet.py` must accept `--character`, `--source`, verify a 4x2 cell layout, crop fixed gutters, fit the full-body cell into 1024x1024 transparent RGBA, fit each bust into 256x256 transparent RGBA, and write the seven exact files. Reject missing alpha, non-image input, unsupported character IDs, and near-empty cells. Do not overwrite any other character.

- [ ] **Step 5: Upgrade manifest schema, loader, generator, and validator**

Change authored manifest schema from 2 to 3, add both player IDs with six required portraits, replace runtime `hero` with `players`, update complete fixtures and required canonical paths, and add both player IDs to `PORTRAITS` in `generate-authored-assets.py`. Keep procedural fallback schema 1 accepted. Preserve exact-object rejection for old authored schema 2. Change derived-portrait generation to preserve an existing portrait by default and add an explicit `--force-derived-portraits` flag for the old overwrite behavior; test both branches so a later asset-generation run cannot destroy imported expression art.

- [ ] **Step 6: Import assets and run visual/structural checks**

Run:

```powershell
python scripts/import-player-character-sheet.py --character cloud-courier --source tmp/imagegen/cloud-courier-sheet.png
python scripts/import-player-character-sheet.py --character star-alchemist --source tmp/imagegen/star-alchemist-sheet.png
python scripts/generate-authored-assets.py
npm run check:assets
```

Expected: `ASSETS_OK`, every full art is 1024x1024 with alpha, every portrait is 256x256 with alpha, and runtime bytes remain below 30 MiB.

Inspect all fourteen new runtime files with `view_image`; regenerate a sheet if a face, shoulder, panel boundary, or transparency is visibly broken.
Inspect Rivet's full art and six existing portraits in the same pass. Re-crop only the failing files if the face or shoulders are outside the safe area; otherwise leave their bytes untouched.

- [ ] **Step 7: Run asset tests, typecheck, and commit**

Run: `npx vitest run src/assets`

Expected: PASS.

Run: `node --test scripts/validate-assets.test.mjs`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

```bash
git add -- public/assets/manifest.json public/assets/characters/cloud-courier public/assets/characters/star-alchemist scripts/import-player-character-sheet.py scripts/generate-authored-assets.py scripts/validate-assets.mjs scripts/validate-assets.test.mjs src/assets
git commit -m "feat: add three selectable player character assets"
```

---

### Task 7: Selected Character Propagation, NEXT Shapes, and Portrait Framing

**Files:**
- Modify: `src/ui/match/piece-preview.tsx`
- Create: `src/ui/match/piece-preview.test.tsx`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.test.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.test.tsx`
- Modify: `src/ui/screens/OwlResultScreen.tsx`
- Create: `src/ui/screens/OwlResultScreen.test.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `tests/e2e/portrait-layout.spec.ts`

**Interfaces:**
- Consumes: `ProgressState.profile`, `PLAYER_CHARACTERS`, `CommonAssets.players`.
- Produces: `PiecePreview` with four visible centered cells and no visible kind text.
- Produces: selected player definition/assets props for intro, match, result, owl-result, and ending screens.

- [ ] **Step 1: Write failing NEXT and selected-player tests**

```tsx
it('renders four centered cells without visible piece letters', () => {
  render(<PiecePreview kind="L" image={tile} />);
  const preview = screen.getByRole('img', { name: 'L 블록' });
  expect(preview.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
  expect(preview).not.toHaveTextContent('L');
  expect(preview).toHaveAttribute('data-shape-width', '3');
  expect(preview).toHaveAttribute('data-shape-height', '2');
});

it('uses the selected player identity and portrait set in match HUD', () => {
  renderMatch({ profile: { initials: 'LUM', characterId: 'cloud-courier' } });
  expect(screen.getByRole('region', { name: '구름 우편기사 battle status' }))
    .toHaveAttribute('data-character-id', 'cloud-courier');
  expect(screen.getByAltText('PLAYER idle portrait')).toHaveAttribute(
    'src', '/assets/characters/cloud-courier/portrait-idle.webp',
  );
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run src/ui/match/piece-preview.test.tsx src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/FloorIntroScreen.test.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/OwlResultScreen.test.tsx src/ui/screens/EndingScreen.test.tsx src/app/AppRoot.test.tsx`

Expected: FAIL because visible labels remain and screens still hard-code `hero-engineer`.

- [ ] **Step 3: Normalize and center actual piece cells**

Add `normalizePreviewCells(kind)` that subtracts minimum row/column and returns `width`, `height`, and four normalized coordinates. Render a tight CSS grid centered by the preview container. Put the supplied tile image inside each cell; delete `.battle-hud__piece-label` and the full-card faded image. Keep only `aria-label={`${kind} 블록`}` for assistive technology.

- [ ] **Step 4: Propagate the selected character**

Resolve the profile once in `AppRoot` using a safe `hero-engineer` display fallback only when a corrupted in-memory test fixture bypasses schema parsing. Pass the selected definition and assets to intro, match, result, owl result, and ending screens. Replace hard-coded hero name/title/portraits in `MatchScreen` with those props. Keep all gameplay config identical.

- [ ] **Step 5: Enlarge and reframe portrait plates without shrinking boards**

Use a rounded rectangle at least 60x60 CSS px on 360x640 and 68x68 above 700px height. Set player/rival image to `object-fit: cover; object-position: var(--portrait-position, center top)`. Reduce name/title copy before changing stage dimensions. Update the portrait E2E assertions to require visible non-zero image area, face plate width at least 60px, and unchanged board/canvas fit within the viewport.

- [ ] **Step 6: Run UI and portrait tests and commit**

Run: `npx vitest run src/ui/match/piece-preview.test.tsx src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/FloorIntroScreen.test.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/OwlResultScreen.test.tsx src/ui/screens/EndingScreen.test.tsx src/app/AppRoot.test.tsx`

Expected: PASS.

Run: `npx playwright test tests/e2e/portrait-layout.spec.ts`

Expected: PASS at both configured portrait projects.

```bash
git add -- src/ui/match/piece-preview.tsx src/ui/match/piece-preview.test.tsx src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/screens/FloorIntroScreen.tsx src/ui/screens/FloorIntroScreen.test.tsx src/ui/screens/ResultScreen.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/OwlResultScreen.tsx src/ui/screens/OwlResultScreen.test.tsx src/ui/screens/EndingScreen.tsx src/ui/screens/EndingScreen.test.tsx src/ui/match/match-layout.css src/ui/screens/screens.css src/app/AppRoot.tsx src/app/AppRoot.test.tsx tests/e2e/portrait-layout.spec.ts
git commit -m "feat: center next shapes and selected portraits"
```

---

### Task 8: Match Score Events, Duration Outcome, and Compact Score HUD

**Files:**
- Modify: `src/app/app-route.ts`
- Modify: `src/app/use-match-loop.ts`
- Modify: `src/app/use-match-loop.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/test-support/e2e-match.tsx`
- Modify: `src/test-support/e2e-driver.ts`
- Modify: `src/test-support/e2e-driver.test.ts`

**Interfaces:**
- Produces: `MatchOutcome = { result: MatchResult; durationTicks: number }`.
- Changes: `UseMatchLoopOptions.onFinished`, `MatchScreenProps.onFinished`, and `MatchRouteViewProps.onFinished` to accept `MatchOutcome`.
- Produces: `MatchScreenProps.runScore` and `MatchScreenProps.onScoreEvents(events)`.

- [ ] **Step 1: Write failing duration and event-forwarding tests**

```tsx
it('reports terminal duration without the core countdown or paused frames', async () => {
  const onFinished = vi.fn();
  coreSpies.stepMatch.mockImplementation((state: MatchState) => {
    const tick = state.tick + 1;
    return {
      events: tick === 4 ? [{ type: 'match-ended', side: 'player' }] : [],
      state: {
        ...state,
        countdownTicks: Math.max(0, 3 - tick),
        status: tick === 4 ? 'player-won' : tick < 3 ? 'countdown' : 'playing',
        tick,
      },
    };
  });
  const { clock, result } = renderLoop({
    config: { matchSeed: 17, countdownTicks: 3 },
    onFinished,
  });
  clock.advanceBy(STEP_MS);
  clock.advanceBy(STEP_MS);
  act(() => result.current.setPaused('background', true));
  clock.advanceBy(5_000);
  act(() => result.current.setPaused('background', false));
  clock.advanceBy(STEP_MS);
  clock.advanceBy(STEP_MS);
  clock.advanceBy(STEP_MS);
  expect(onFinished).toHaveBeenCalledWith({ result: 'win', durationTicks: 1 });
});

it('forwards player score events and displays a fixed-width score', () => {
  const onScoreEvents = vi.fn();
  const loop = activeLoop();
  render(
    <MatchScreen
      {...lifecycleProps}
      floor={2}
      onFinished={vi.fn()}
      onScoreEvents={onScoreEvents}
      runScore={12_450}
      seed={17}
    />,
  );
  const options = useMatchLoopMock.mock.calls.at(-1)?.[0];
  act(() => options.onEvents([
    { type: 'lines-cleared', side: 'player', amount: 2, rows: [18, 19] },
  ], loop.view));
  expect(screen.getByTestId('run-score')).toHaveTextContent('SCORE 012450');
  expect(onScoreEvents).toHaveBeenCalledWith([
    { type: 'lines-cleared', side: 'player', amount: 2, rows: [18, 19] },
  ]);
});
```

Extend the existing `renderLoop()` test helper with an optional `config: MatchConfig` argument defaulting to `{ matchSeed: 17, countdownTicks: 0 }`; keep its `FrameClock`, `STEP_MS`, and real hook setup unchanged.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run src/app/use-match-loop.test.tsx src/ui/screens/MatchScreen.test.tsx src/test-support/e2e-driver.test.ts src/app/AppRoot.test.tsx`

Expected: FAIL because completion only reports a result string and no score props exist.

- [ ] **Step 3: Implement `MatchOutcome` at the clock boundary**

Capture `stateRef.current.countdownTicks` immediately after the match state is created. On terminal state, report `durationTicks = max(0, finalTick - initialCountdownTicks)`. Paused frames already do not advance the core tick, so do not add wall-clock arithmetic. Update every test fake and E2E finish binding to use `MatchOutcome`; make the public E2E driver `finish(result, durationTicks = 600)` convenience method create that object deterministically.

- [ ] **Step 4: Forward score events and render score**

Compose `onScoreEvents(events)` into MatchScreen's existing `handleMatchEvents` callback after audio/haptic feedback. This callback is already invoked exactly once per flattened frame event list by `useMatchLoop`; do not score `match.eventBatches` again. Keep callback failures inside the loop's existing presentation-callback isolation. Render one `SCORE ${String(runScore).padStart(6, '0')}` element in the match header with tabular numerals. Do not add opponent score or reveal hidden telemetry.

- [ ] **Step 5: Run match tests and commit**

Run: `npx vitest run src/app/use-match-loop.test.tsx src/ui/screens/MatchScreen.test.tsx src/test-support/e2e-driver.test.ts src/app/AppRoot.test.tsx`

Expected: PASS.

```bash
git add -- src/app/app-route.ts src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/match-layout.css src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/test-support/e2e-match.tsx src/test-support/e2e-driver.ts src/test-support/e2e-driver.test.ts
git commit -m "feat: expose match score events and duration"
```

---

### Task 9: Ranked Run Integration and Local Best Persistence

**Files:**
- Modify: `src/app/towerController.ts`
- Modify: `tests/app/towerController.test.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/app/app-route.ts`
- Modify: `src/app/app-route.test.ts`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.test.tsx`
- Modify: `src/ui/screens/OwlResultScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.test.tsx`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- Consumes: `ScoreRunController`, `MatchOutcome`, `ScoreRecord`, `isBetterScore()`.
- Produces: `TowerController.recordScore(record, queueForOnline)`, `TowerController.clearPendingSubmission(difficulty, expectedRecord)`.
- Produces: `TowerScreen.requiredFloor: Floor`, `TowerScreen.runActive: boolean`.
- Behavior: result routes end a ranked run on loss/draw, remove same-run retry, and return a new attempt to title/tower at zero.

- [ ] **Step 1: Write failing persistence and run-gating tests**

```ts
it('stores only a better local record and queues it by difficulty', async () => {
  const repository = new RecordingRepository();
  const controller = new TowerController(DEFAULT_PROGRESS, repository);
  const easyScore: ScoreRecord = {
    schemaVersion: 1,
    initials: 'RVT',
    characterId: 'hero-engineer',
    difficulty: 'easy',
    score: 5_000,
    durationTicks: 1_500,
    reachedFloor: 1,
    encountersWon: 3,
    owlDefeated: false,
    achievedAt: '2026-08-09T00:00:00.000Z',
  };
  await controller.recordScore(easyScore, true);
  expect(controller.progress.localBestScores.easy).toEqual(easyScore);
  expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(easyScore);
  await controller.recordScore({ ...easyScore, score: easyScore.score - 1 }, true);
  expect(controller.progress.localBestScores.easy).toEqual(easyScore);
});

it('allows only the required floor during an active score run', () => {
  const unlocked = cloneProgressState(DEFAULT_PROGRESS);
  unlocked.difficultyProgress.easy.highestUnlockedFloor = 5;
  render(
    <TowerScreen
      notice={null}
      onSelectFloor={vi.fn()}
      progress={unlocked}
      requiredFloor={1}
      runActive
    />,
  );
  expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
});
```

- [ ] **Step 2: Write failing AppRoot full-run tests**

```tsx
it('starts at zero on floor one, accumulates wins, and ends the run on loss', async () => {
  const user = userEvent.setup();
  const initial = cloneProgressState(DEFAULT_PROGRESS);
  initial.profile = { initials: 'RVT', characterId: 'hero-engineer' };
  const repository = new TestProgressRepository(initial);
  renderGame(repository);
  await screen.findByTestId('title-screen');
  await user.click(screen.getByRole('button', { name: 'START RUN' }));
  await enterMatch(user, 1, 0);
  expect(screen.getByTestId('run-score')).toHaveTextContent('SCORE 000000');
  await user.click(screen.getByRole('button', { name: 'finish win' }));
  expect(await screen.findByTestId('result-screen')).toHaveTextContent('1,000');
  await continueToNextEncounter(user);
  await user.click(screen.getByRole('button', { name: 'finish loss' }));
  await screen.findByTestId('result-screen');
  await user.click(screen.getByRole('button', { name: '도전 종료' }));
  expect(await screen.findByTestId('title-screen')).toBeVisible();
  expect(repository.saves.at(-1)?.localBestScores.easy?.score).toBe(1_000);
});
```

Update the existing `TestMatch` fixture in `AppRoot.test.tsx` so its finish buttons call `onFinished({ result, durationTicks })` with deterministic values (`600` for win, `300` for loss/draw). Reuse the existing `renderGame()`, `enterMatch()`, and `continueToNextEncounter()` helpers; do not add a second app harness.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npx vitest run src/app/AppRoot.test.tsx tests/app/towerController.test.ts src/app/app-route.test.ts src/ui/screens/TowerScreen.test.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/EndingScreen.test.tsx`

Expected: FAIL because no score run is connected to app routes or progress.

- [ ] **Step 4: Add score persistence methods to `TowerController`**

`recordScore()` clones progress, replaces `localBestScores[difficulty]` only when better, writes pending only when `queueForOnline` is true, and persists through the existing serialized save queue. `clearPendingSubmission()` removes only an exact still-current candidate so an older network response cannot clear a newer offline record.

- [ ] **Step 5: Integrate the memory-only run in `AppRoot`**

Create `scoreRunRef` when a returning player's `START RUN` is accepted, or immediately after first-run profile selection succeeds. Enter the tower with `requiredFloor: 1`, `runActive: true`, and score zero; do not allow an unlocked historical floor to bypass floor 1. Reject selecting a floor other than `requiredFloor`. Feed each player event list to `recordEvents()`, pass snapshot score to MatchScreen, and call `completeMatch()` with the terminal duration. Convert an ended summary to a `ScoreRecord` using the current profile and injected ISO clock. Persist before leaving the result flow.

- [ ] **Step 6: Update result, owl, ending, and tower flows**

- Win before the third encounter continues the series.
- Floor-series win returns to the tower with only the next required floor active.
- Loss/draw labels the action `도전 종료`, records the partial run, and returns to title.
- Same-run retry buttons are removed while a ranked run is ended.
- Owl loss/draw ends the run instead of reopening only the owl fight.
- Owl victory records the completed run, shows ending, and returns to title with the next difficulty unlocked.
- Starting another run creates a fresh controller at zero.

- [ ] **Step 7: Run integration tests and commit**

Run: `npx vitest run src/app/AppRoot.test.tsx tests/app/towerController.test.ts src/app/app-route.test.ts src/ui/screens/TowerScreen.test.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/EndingScreen.test.tsx`

Expected: PASS.

```bash
git add -- src/app/towerController.ts tests/app/towerController.test.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/app/app-route.ts src/app/app-route.test.ts src/ui/screens/TowerScreen.tsx src/ui/screens/TowerScreen.test.tsx src/ui/screens/ResultScreen.tsx src/ui/screens/ResultScreen.test.tsx src/ui/screens/OwlResultScreen.tsx src/ui/screens/EndingScreen.tsx src/ui/screens/EndingScreen.test.tsx src/ui/screens/screens.css
git commit -m "feat: connect ranked tower runs and local records"
```

---

### Task 10: Leaderboard Reads, Submission Queue, and Retry UI

**Files:**
- Create: `src/app/use-leaderboard.ts`
- Create: `src/app/use-leaderboard.test.tsx`
- Modify: `src/app/app-services.ts`
- Modify: `src/app/app-services.test.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/TitleScreen.tsx`
- Modify: `src/ui/screens/TitleScreen.test.tsx`
- Modify: `src/ui/screens/RankingScreen.tsx`
- Modify: `src/ui/screens/RankingScreen.test.tsx`

**Interfaces:**
- Adds: `AppServices.leaderboardRepository` and matching override.
- Produces: `useLeaderboard({ repository, progress, onClearPending })` with `load(difficulty)` and `retryPending()`.
- Behavior: local mode shows local records without pending warnings; Firestore failures preserve and retry pending records.

- [ ] **Step 1: Write failing service and hook tests**

```ts
it('constructs local leaderboard mode when Firebase env is absent', () => {
  const services = createAppServices('browser', storage, { firebaseEnv: {} });
  expect(services.leaderboardRepository.kind).toBe('local');
});

it('keeps a failed remote write pending and clears only after retry succeeds', async () => {
  const candidate: ScoreRecord = {
    schemaVersion: 1,
    initials: 'RVT',
    characterId: 'hero-engineer',
    difficulty: 'easy',
    score: 5_000,
    durationTicks: 1_500,
    reachedFloor: 1,
    encountersWon: 3,
    owlDefeated: false,
    achievedAt: '2026-08-09T00:00:00.000Z',
  };
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.pendingLeaderboardSubmissions.easy = candidate;
  const repository: LeaderboardRepository = {
    kind: 'firestore',
    getTop: vi.fn(async () => ({
      ok: true,
      source: 'firestore',
      currentUserId: 'firebase-user',
      entries: [],
    })),
    submitBest: vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'WRITE_FAILED' })
      .mockResolvedValueOnce({ ok: true, source: 'firestore' }),
  };
  const clearPending = vi.fn();
  const { result } = renderHook(() => useLeaderboard({ repository, progress, onClearPending: clearPending }));
  await act(async () => { await result.current.retryPending(); });
  expect(clearPending).not.toHaveBeenCalled();
  await act(async () => { await result.current.retryPending(); });
  expect(clearPending).toHaveBeenCalledWith('easy', candidate);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run src/app/use-leaderboard.test.tsx src/app/app-services.test.ts src/app/AppRoot.test.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.test.tsx`

Expected: FAIL because services and UI do not expose a leaderboard repository or sync state.

- [ ] **Step 3: Add repository creation to app services**

Extend overrides with `leaderboardRepository` and `firebaseEnv`. Defaults use `import.meta.env` and `createLeaderboardRepository()`. Construction must be lazy with respect to authentication: creating services may parse config but must not call network or anonymous sign-in. Existing asset/progress factory tests must remain valid.

- [ ] **Step 4: Implement leaderboard hook and stale-response protection**

Track a monotonically increasing request token for reads. Only the latest selected-difficulty response may update entries. `retryPending()` processes easy/normal/hard in order, submits one candidate per difficulty, and calls `onClearPending` only for successful Firestore writes. Local mode performs no remote retry and does not clear future migration candidates based on a no-op write.

- [ ] **Step 5: Connect title/ranking states and run-end submission**

After `recordScore()` succeeds, submit immediately in Firestore mode. On failure leave pending and show `ONLINE RANKING SYNC PENDING`. Entering title or ranking retries once. Ranking read failure displays the selected local best plus `ONLINE RANKING UNAVAILABLE`; local mode displays `LOCAL RECORDS`. In Firestore mode, use `currentUserId` and each entry's `userId` to avoid duplicating the current player's equal remote record. If the local record has no matching remote row, display it with rank `—` and badge `LOCAL`; never invent a global rank.

- [ ] **Step 6: Run integration tests and commit**

Run: `npx vitest run src/app/use-leaderboard.test.tsx src/app/app-services.test.ts src/app/AppRoot.test.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.test.tsx src/leaderboard`

Expected: PASS with no Firebase network calls.

```bash
git add -- src/app/use-leaderboard.ts src/app/use-leaderboard.test.tsx src/app/app-services.ts src/app/app-services.test.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/TitleScreen.tsx src/ui/screens/TitleScreen.test.tsx src/ui/screens/RankingScreen.tsx src/ui/screens/RankingScreen.test.tsx
git commit -m "feat: sync best scores with optional leaderboards"
```

---

### Task 11: End-to-End Journeys and Delivery Verification

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/app-flow.spec.ts`
- Modify: `tests/e2e/lifecycle-controls.spec.ts`
- Modify: `tests/e2e/portrait-layout.spec.ts`
- Modify: `src/test-support/e2e-driver.ts`
- Modify: `src/test-support/e2e-driver.test.ts`
- Modify: `src/test-support/e2e-match.tsx`
- Modify: `docs/qa/apps-in-toss-private-qr.md` only if the persisted profile/leaderboard boundary changes an existing documented QA assertion.

**Interfaces:**
- Consumes: final title/profile/run/ranking/HUD behavior from Tasks 1-10.
- Produces: reusable `seedReturningProfile(page, overrides)` and `completeFirstRunProfile(page, initials, characterId)` E2E helpers.
- Verifies: both Playwright portrait projects and all existing delivery gates.

- [ ] **Step 1: Add a first-launch E2E that starts from empty storage**

First add these concrete helpers to `tests/e2e/helpers.ts`:

```ts
type SeedProfile = {
  readonly initials: string;
  readonly characterId: 'hero-engineer' | 'cloud-courier' | 'star-alchemist';
};

export async function chooseArcadeLetters(page: Page, initials: string): Promise<void> {
  for (const letter of initials) {
    await page.getByRole('button', { name: letter, exact: true }).click();
  }
}

export async function seedReturningProfile(page: Page, profile: SeedProfile): Promise<void> {
  const emptyRun = {
    highestUnlockedFloor: 1,
    clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
    owlDefeated: false,
  };
  const progress = {
    schemaVersion: 4,
    profile,
    localBestScores: { easy: null, normal: null, hard: null },
    pendingLeaderboardSubmissions: {},
    selectedDifficulty: 'easy',
    unlockedDifficulties: { easy: true, normal: false, hard: false },
    difficultyProgress: {
      easy: { ...emptyRun, clearedFloors: { ...emptyRun.clearedFloors } },
      normal: { ...emptyRun, clearedFloors: { ...emptyRun.clearedFloors } },
      hard: { ...emptyRun, clearedFloors: { ...emptyRun.clearedFloors } },
    },
    settings: { soundEnabled: true, hapticsEnabled: true },
  };
  await page.addInitScript((serialized) => {
    window.localStorage.setItem('te-ppu.progress', serialized);
  }, JSON.stringify(progress));
}

export async function completeFirstRunProfile(
  page: Page,
  initials: string,
  characterId: SeedProfile['characterId'],
): Promise<void> {
  const labels: Record<SeedProfile['characterId'], string> = {
    'hero-engineer': '리벳',
    'cloud-courier': '루미',
    'star-alchemist': '세라',
  };
  await page.goto('/');
  await page.getByRole('button', { name: 'START RUN' }).click();
  await chooseArcadeLetters(page, initials);
  await page.getByRole('button', { name: 'END' }).click();
  await page.getByRole('button', { name: labels[characterId] }).click();
  await page.getByRole('button', { name: '선택 완료' }).click();
}
```

```ts
test('registers arcade initials and a character before the first easy run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByRole('button', { name: 'START RUN' }).click();
  await expect(page.getByRole('button', { name: 'END' })).toBeDisabled();
  await chooseArcadeLetters(page, 'LUM');
  await expect(page.getByRole('button', { name: 'END' })).toBeEnabled();
  await page.getByRole('button', { name: 'END' }).click();
  await page.getByRole('button', { name: '루미' }).click();
  await page.getByRole('button', { name: '선택 완료' }).click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '2층 선택' })).toBeDisabled();
});
```

- [ ] **Step 2: Add returning profile, score, and local ranking E2E coverage**

```ts
test('records a partial run and shows it on local ranking', async ({ page }) => {
  await seedReturningProfile(page, { initials: 'RVT', characterId: 'hero-engineer' });
  await openMatch(page);
  await page.evaluate(() => window.__TE_PPU_E2E__.finish('win'));
  await page.getByRole('button', { name: '다음 상대' }).click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await page.evaluate(() => window.__TE_PPU_E2E__.finish('loss'));
  await page.getByRole('button', { name: '도전 종료' }).click();
  await page.getByRole('button', { name: 'RANKING' }).click();
  await expect(page.getByText('LOCAL RECORDS')).toBeVisible();
  await expect(page.getByRole('row', { name: /RVT.*1000/ })).toBeVisible();
});
```

- [ ] **Step 3: Update existing helpers and layout assertions**

Existing gameplay tests should call `seedReturningProfile()` before `page.goto('/')`, except the dedicated first-launch test. Change `openTower()` to wait for title, click `START RUN`, and then wait for tower; keep `openMatch()` layered on it. Update lifecycle tests to enter through title without weakening close/countdown assertions. Assert no visible piece-kind letters inside NEXT, four cells per preview, centered shape boxes, portrait plates at least 60px, visible image bounds, and no horizontal overflow at 360x640 and 430x932.

- [ ] **Step 4: Run focused E2E and fix only observed regressions**

Run: `npx playwright test tests/e2e/app-flow.spec.ts tests/e2e/lifecycle-controls.spec.ts tests/e2e/portrait-layout.spec.ts`

Expected: all configured projects pass; browser error guard captures no console or page errors.

- [ ] **Step 5: Run complete verification from fresh command output**

Run each command separately and record exact results:

```powershell
npm run typecheck
npm test
npx playwright test
npm run check:assets
npm run check:source-policy
npm run build:web
npm run build:ait
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
npm run check:dependency-audit
npm run test:delivery-gates
git diff --check
git status --short
```

Expected:

- TypeScript passes.
- All Vitest files and tests pass; the long AI simulation suite may take over six minutes but must finish rather than being reported from an earlier run.
- All Playwright tests pass at 360x640 and 430x932.
- Asset validation reports runtime bytes below 30 MiB.
- Source policy reports zero findings.
- Web and AIT builds succeed; a pre-existing bundle-size warning is reported as a warning, not hidden.
- `artifacts/ait/game.ait` passes explicit package verification, and the dependency audit stays within its checked-in baseline.
- Delivery gates pass.
- `git diff --check` emits no errors.
- `git status --short` contains only the intentionally preserved untracked `tmp/` directory after the final implementation commit.

If a Java executable becomes available, additionally run:

```powershell
npx firebase emulators:exec --only firestore --project demo-te-ppu "npx vitest run tests/firestore"
```

If Java remains unavailable, report Firestore Rules as statically reviewed and emulator-unverified; do not label the Rules runtime behavior as confirmed.

- [ ] **Step 6: Review diff scope and create the final implementation commit**

Review `git diff ec29c3e..HEAD --stat`, inspect every changed authored source path, and ensure no generated cache, Firebase credential, `.env`, project ID, or `tmp/` file is staged. Commit only remaining E2E/QA changes:

```bash
git add -- tests/e2e src/test-support docs/qa/apps-in-toss-private-qr.md
git commit -m "test: cover arcade profiles scores and ranking journeys"
```

If `docs/qa/apps-in-toss-private-qr.md` is unchanged, omit it from `git add` rather than creating an empty documentation change.
