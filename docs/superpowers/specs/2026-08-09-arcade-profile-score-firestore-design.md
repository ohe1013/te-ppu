# Arcade Profile, Score Run, and Firestore Leaderboard Design

**Status:** Approved for implementation on 2026-08-09.

## 1. 목적

현재 게임은 부팅 뒤 곧바로 타워 화면으로 이동하고, 플레이어 캐릭터가 한 명뿐이며, 실력을 비교할 점수와 랭킹이 없다. 이번 변경은 다음 경험을 하나의 흐름으로 연결한다.

1. 오락실 게임처럼 타이틀 화면에서 게임을 시작한다.
2. 첫 시작 때 조이스틱으로 영문 대문자 세 글자 이름을 입력한다.
3. 성능이 같은 세 명의 오리지널 주인공 중 한 명을 선택한다.
4. 1층부터 숨겨진 부엉이 보스까지 이어지는 한 번의 탑 도전에서 점수를 누적한다.
5. 난이도별 개인 최고 기록을 로컬에 보존하고, Firebase가 설정되면 Firestore TOP 20 랭킹과 동기화한다.
6. NEXT 조각과 대전 초상화를 정리해 실제 조각 모양과 캐릭터 표정이 화면의 중심이 되게 한다.

## 2. 범위

### 포함

- 타이틀, 이름 입력, 캐릭터 선택, 랭킹 화면
- 영문 대문자 세 글자 플레이어 프로필
- 세 명의 동일 성능 플레이어 캐릭터
- 한 번의 전체 탑 도전을 단위로 한 점수 런
- EASY, NORMAL, HARD별 로컬 최고 기록
- 익명 Firebase Authentication과 Firestore 랭킹 어댑터
- Firebase 미설정 및 네트워크 실패 시 로컬 fallback
- Firestore Security Rules와 복합 인덱스 파일
- NEXT 문자 제거와 조각 중앙 정렬
- 대전 HUD 초상화 확대 및 얼굴 중심 크롭
- 신규 캐릭터 전신 및 표정별 초상화 에셋

### 제외

- 캐릭터별 능력, 점수 배율 또는 아이템 차이
- 이메일, 소셜 로그인 또는 계정 연동
- 여러 기기 사이의 프로필·해금 진행 동기화
- 서버에서 게임 리플레이를 재실행하는 부정행위 방지
- 실시간 멀티플레이와 시즌 운영 도구
- 네이티브 소프트 키보드를 이용한 이름 입력

클라이언트가 계산한 점수를 직접 제출하므로 Firestore Rules와 App Check만으로 조작을 완전히 막을 수 없다. 이번 랭킹은 프로토타입 랭킹이며, 경쟁 서비스로 운영할 때에는 서버가 리플레이 또는 명령 로그를 검증해야 한다.

## 3. 플레이어 프로필

### 3.1 이름 규칙

- 이름은 `AAA` 형식의 영문 대문자 정확히 세 글자다.
- 허용 정규식은 `^[A-Z]{3}$`다.
- 첫 글자를 선택하기 전에는 빈 슬롯 세 개를 표시한다.
- 세 글자가 모두 채워져야 `END`가 활성화된다.
- `DEL`은 마지막 글자를 하나 지운다.
- 금칙어 필터는 이번 범위에 넣지 않는다. 추후 공개 운영 시 서버 정책으로 추가한다.

### 3.2 이름 입력 조작

화면에는 다음 고정 자판을 표시한다.

```text
[_] [_] [_]

A B C D E F
G H I J K L
M N O P Q R
S T U V W X
Y Z  DEL  END
```

- 화면 조이스틱의 상하좌우로 포커스를 이동한다.
- 확인 버튼으로 현재 키를 선택한다.
- 자판 키를 직접 터치할 수도 있다.
- 실제 키보드의 방향키와 Enter, Backspace도 동일하게 동작한다.
- 포커스는 행 끝에서 임의로 반대편으로 순간 이동하지 않고 가장 가까운 유효 키에 머문다.
- `END`를 확정하기 전에는 프로필 저장이나 화면 전환을 하지 않는다.

### 3.3 등록과 변경

- 첫 실행에는 타이틀의 `START RUN`을 누른 뒤 이름 입력과 캐릭터 선택을 순서대로 진행한다.
- 최초 캐릭터 선택이 끝나면 EASY 탑 도전을 시작한다.
- 등록된 프로필이 있으면 이후 부팅은 항상 타이틀로 이동한다.
- `PLAYER CHANGE`는 이름 입력과 캐릭터 선택을 다시 실행한 뒤 타이틀로 돌아온다.
- 프로필 변경은 과거 최고 기록의 이름과 캐릭터를 소급 변경하지 않는다. 다음에 갱신한 최고 기록부터 새 프로필이 반영된다.

## 4. 플레이어 캐릭터

플레이어 캐릭터 ID와 표시 설정은 순수 카탈로그 데이터로 관리한다.

| ID | 이름 | 역할 | 팔레트 | 탑에 오르는 이유 |
| --- | --- | --- | --- | --- |
| `hero-engineer` | 리벳 | 견습 마도공학자, 별빛 수리공 | 청록, 크림, 구리 | 고장 난 별빛 동력핵을 수리한다. |
| `cloud-courier` | 루미 | 구름 우편기사 | 파랑, 노랑, 흰색 | 멈춘 바람길을 되찾는다. |
| `star-alchemist` | 세라 | 별가루 연금술사 | 보라, 분홍, 은색 | 도난당한 동력핵의 빛을 추적한다. |

세 캐릭터는 게임 코어, AI, 아이템, 공격, 점수 계산에서 완전히 같은 성능을 가진다. 차이는 다음 표현에만 존재한다.

- 타이틀 프로필 카드
- 캐릭터 선택 전신 일러스트와 소개 문구
- 층 소개 및 결과 화면의 플레이어 이미지
- 대전 HUD의 `idle`, `focus`, `attack`, `hit`, `win`, `loss` 초상화
- 캐릭터별 이름, 역할 문구, 색상 강조

## 5. 화면 흐름

### 5.1 라우트

```text
BOOT
  -> TITLE
       -> START RUN
            -> NAME ENTRY (프로필이 없을 때)
            -> CHARACTER SELECT (프로필이 없을 때)
            -> TOWER / RUN START
       -> RANKING
       -> PLAYER CHANGE
            -> NAME ENTRY
            -> CHARACTER SELECT
            -> TITLE
```

기존 `boot-ready`는 타워가 아니라 타이틀로 이동한다. 타이틀은 큰 로고와 안내자 상태의 부엉이를 중심에 두고, 현재 프로필의 세 글자 이름, 캐릭터 초상화, 선택 난이도, 로컬 최고점을 함께 표시한다.

### 5.2 타이틀 메뉴

- `START RUN`: 선택한 해금 난이도의 타워로 이동한다.
- `RANKING`: EASY, NORMAL, HARD 탭을 가진 TOP 20 화면을 연다.
- `PLAYER CHANGE`: 이름과 캐릭터를 다시 선택한다.

프로필이 없을 때 `RANKING`은 볼 수 있지만 `START RUN`은 등록 흐름을 먼저 거친다. `START RUN` 뒤의 타워 준비 화면에서 해금된 난이도를 고르고 1층을 선택할 때 런이 생성된다. 최초 등록 직후에는 EASY가 선택된 타워 준비 화면으로 이동한다. 아직 잠긴 난이도는 타이틀과 랭킹 탭에서 `LOCKED`로 표시한다.

### 5.3 캐릭터 선택

- 선택 캐릭터를 중앙에 크게 표시하고 양옆에는 나머지 캐릭터의 축소 카드를 둔다.
- 조이스틱 좌우, 화면 버튼, 직접 터치로 선택을 이동한다.
- 확인 버튼으로 선택을 저장한다.
- 각 카드에는 이름, 역할, 짧은 동기만 표시한다.
- 능력치나 캐릭터별 배율은 표시하지 않는다.

## 6. 점수 런

### 6.1 런 단위

- 런은 선택한 난이도의 1층 첫 상대에서 시작한다.
- 각 층의 세 상대를 기존 순서대로 이기고 5층 뒤 숨겨진 부엉이 보스와 대결한다.
- 런 중에는 다음에 싸워야 할 층과 상대만 선택할 수 있다.
- 기존 `difficultyProgress`는 해금 이력으로 유지하되 런 진행 커서와 분리한다. 이전에 5층까지 해금한 사용자도 새 랭킹 런은 항상 1층부터 시작한다.
- 런이 시작된 타워 화면에서는 이전 층과 아직 도달하지 않은 층을 비활성화하고 다음 목표만 강조한다.
- 승리하면 같은 런의 다음 상대 또는 다음 층으로 이어진다.
- 패배 또는 무승부는 현재 점수로 런을 종료한다.
- 런 종료 후 재도전은 1층, 0점부터 새 런을 만든다.
- 부엉이 승리는 런을 완료하고 기존 규칙대로 다음 난이도를 해금한다.
- 화면이 백그라운드로 갔다 돌아오면 런을 유지하고 기존 3-2-1 카운트다운 뒤 재개한다.
- 페이지 새로고침이나 프로세스 종료로 사라진 진행 중 매치는 복원하지 않으며 해당 런은 중단 처리한다. 완료된 최고 기록과 층 해금은 유지한다.

### 6.2 점수 규칙

플레이어 측 이벤트만 점수에 반영한다.

| 행동 | 점수 |
| --- | ---: |
| 1줄 삭제 | 100 |
| 2줄 동시 삭제 | 300 |
| 3줄 동시 삭제 | 500 |
| 4줄 동시 삭제 | 800 |
| 상대에게 보낸 공격 1줄 | 50 |
| 아이템 사용 1회 | 100 |
| 대전 승리 | 1,000 |
| 한 층의 3연전 완료 | 2,000 |
| 부엉이 격파 | 5,000 |

- `piece-locked`, 이동, 회전, 소프트 드롭, 하드 드롭에는 점수를 주지 않는다.
- 상대의 줄 삭제, 공격, 아이템 이벤트는 플레이어 점수에 영향을 주지 않는다.
- 공격 점수는 줄 삭제 점수와 별도로 더한다. 이는 실제로 상대에게 보낸 압박을 보상한다.
- 난이도별 랭킹을 분리하므로 난이도 배율은 사용하지 않는다.
- 점수는 0 아래로 내려가지 않으며 Firestore 제출 상한은 `10,000,000`이다.

### 6.3 시간과 동점

- `durationTicks`는 대전이 실제로 진행된 매치 틱의 합이다.
- 메뉴, 결과 화면, 설정, 백그라운드 일시정지, 3-2-1 카운트다운 시간은 포함하지 않는다.
- 순위는 `score` 내림차순, `durationTicks` 오름차순, `updatedAt` 오름차순으로 결정한다.

### 6.4 기록 제출 시점

- 패배, 무승부 또는 부엉이 승리로 런이 종료될 때 기록 후보를 만든다.
- 로컬 최고 기록보다 좋은 경우 즉시 로컬에 저장한다.
- Firestore가 활성화되어 있으면 같은 후보를 제출한다.
- 기존 점수보다 높거나, 점수가 같고 시간이 짧을 때만 최고 기록을 갱신한다.
- 완료하지 못한 런도 `reachedFloor`, `encountersWon`, `owlDefeated`와 함께 기록할 수 있다.

## 7. 로컬 데이터

진행 데이터는 `schemaVersion: 4`로 올린다.

```ts
type PlayerCharacterId =
  | 'hero-engineer'
  | 'cloud-courier'
  | 'star-alchemist';

interface PlayerProfile {
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
}

interface ScoreRecord {
  readonly schemaVersion: 1;
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly difficulty: 'easy' | 'normal' | 'hard';
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: 1 | 2 | 3 | 4 | 5;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly achievedAt: string;
}

interface ProgressStateV4 {
  readonly schemaVersion: 4;
  readonly profile: PlayerProfile | null;
  readonly localBestScores: Record<Difficulty, ScoreRecord | null>;
  readonly pendingLeaderboardSubmissions: Partial<Record<Difficulty, ScoreRecord>>;
  // 기존 selectedDifficulty, unlockedDifficulties,
  // difficultyProgress, settings 필드는 그대로 유지한다.
}
```

- v1, v2, v3 데이터는 기존 진행과 설정을 보존하면서 v4로 마이그레이션한다.
- 마이그레이션된 기존 사용자의 `profile`은 `null`이므로 다음 `START RUN`에서만 등록을 요구한다.
- 각 난이도에 하나의 pending 제출을 두어 여러 난이도를 오프라인에서 플레이해도 기록을 잃지 않는다.
- 저장 데이터는 기존처럼 엄격한 키, 타입, 범위 검증과 corruption backup 정책을 사용한다.

## 8. Firestore 경계

### 8.1 저장소 인터페이스

UI와 점수 컨트롤러는 Firebase SDK를 직접 호출하지 않는다.

```ts
interface LeaderboardRepository {
  getTop(
    difficulty: Difficulty,
    limit: 20,
  ): Promise<LeaderboardReadResult>;

  submitBest(record: ScoreRecord): Promise<LeaderboardWriteResult>;
}
```

- `LocalLeaderboardRepository`는 Firebase 설정이 없을 때 로컬 최고 기록을 제공한다.
- `FirestoreLeaderboardRepository`는 익명 인증 UID로 Firestore를 읽고 쓴다.
- 앱 서비스 팩토리가 환경 설정을 검사해 한 구현만 선택한다.
- 점수 계산, 프로필 저장, 게임 실행은 선택된 repository 종류에 의존하지 않는다.

### 8.2 Firebase 설정

클라이언트는 다음 Vite 환경값을 사용한다.

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

네 값이 모두 유효할 때만 Firebase를 초기화한다. 일부만 존재하면 설정 오류로 기록하고 로컬 repository를 사용한다. Firebase 웹 설정값은 클라이언트에 포함될 수 있으나 데이터 보호는 반드시 Authentication과 Firestore Rules가 담당한다.

Firebase 프로젝트 연결 시 필요한 콘솔 작업은 다음과 같다.

1. Web App을 등록하고 위 설정값을 제공한다.
2. Anonymous Authentication을 활성화한다.
3. Cloud Firestore 데이터베이스를 생성한다.
4. 저장소의 Rules와 Indexes를 배포한다.
5. 실제 배포 origin을 Firebase 허용 도메인에 등록한다.

### 8.3 문서 경로와 데이터

```text
leaderboards/easy/players/{firebaseUid}
leaderboards/normal/players/{firebaseUid}
leaderboards/hard/players/{firebaseUid}
```

```ts
interface FirestoreScoreDocument {
  readonly schemaVersion: 1;
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: 1 | 2 | 3 | 4 | 5;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly updatedAt: ServerTimestamp;
}
```

문서 ID가 Firebase UID이므로 문서 내부에 UID를 중복 저장하지 않는다. TOP 20은 난이도별 `players` 컬렉션에서 점수, 시간, 갱신 시각 순으로 조회한다.

### 8.4 Security Rules 요구사항

- 읽기와 쓰기는 `request.auth != null`일 때만 허용한다.
- 쓰기는 `request.auth.uid == userId`인 문서에만 허용한다.
- 난이도 path는 `easy`, `normal`, `hard` 중 하나여야 한다.
- 필드는 정의된 아홉 개만 허용한다.
- `initials`는 `^[A-Z]{3}$`를 만족해야 한다.
- `characterId`는 세 개의 플레이어 ID 중 하나여야 한다.
- `schemaVersion`은 정수 `1`이어야 한다.
- `score`는 `0` 이상 `10,000,000` 이하의 정수여야 한다.
- `durationTicks`는 `0` 이상 `100,000,000` 이하의 정수여야 한다.
- `reachedFloor`는 `1` 이상 `5` 이하의 정수여야 한다.
- `encountersWon`은 `0` 이상 `16` 이하의 정수여야 한다. 16은 층 보스 15명과 부엉이를 모두 이긴 상태다.
- `owlDefeated`는 boolean이어야 하며 `true`일 때 `reachedFloor == 5`와 `encountersWon == 16`을 함께 요구한다.
- `updatedAt == request.time`을 요구한다.
- create는 유효한 문서만 허용한다.
- update는 기존보다 점수가 높거나, 같은 점수에서 시간이 짧을 때만 허용한다.
- delete는 항상 거부한다.

복합 인덱스는 `score DESC`, `durationTicks ASC`, `updatedAt ASC` 순으로 제공한다.

## 9. 실패와 동기화

- Firebase 설정 없음: 타이틀과 랭킹에 `LOCAL RECORDS`를 표시하고 게임을 정상 실행한다.
- 익명 인증 실패: 로컬 repository로 전환하고 해당 세션에서는 재인증을 반복하지 않는다.
- 랭킹 읽기 실패: 로컬 최고 기록과 `ONLINE RANKING UNAVAILABLE`을 표시한다.
- 최고 기록 쓰기 실패: 난이도별 pending 제출에 저장하고 `ONLINE RANKING SYNC PENDING`을 표시한다.
- 타이틀 또는 랭킹 진입: pending 제출을 난이도별로 한 번 재시도한다.
- 재시도 성공: 해당 pending만 제거한다.
- 재시도 실패: 게임을 막지 않고 다음 진입 때 다시 시도한다.
- 더 좋은 기록이 오프라인에서 생기면 같은 난이도의 이전 pending을 대체한다.
- 저장 실패는 점수 결과, 층 해금, 캐릭터 선택 화면을 되돌리지 않는다.

## 10. HUD 변경

### 10.1 NEXT

- 조각 카드에서 `I`, `J`, `L`, `O`, `S`, `T`, `Z` 문자를 렌더링하지 않는다.
- 스크린 리더용 조각 이름은 `aria-label`로 유지한다.
- 각 조각은 실제 네 개 셀만 표시한다.
- 조각별 점유 영역을 계산해 카드의 가로·세로 중앙에 배치한다.
- 배경 색상만으로 모양을 전달하지 않으며 각 셀의 테두리와 타일 이미지를 유지한다.
- 두 개의 NEXT 조각은 같은 크기와 간격을 사용한다.

### 10.2 점수

- 대전 상단에 고정 폭 `SCORE 012450` 표시를 둔다.
- 현재 런 점수만 표시하며 상대 점수는 만들지 않는다.
- 숫자 갱신 때문에 헤더 폭이나 보드 크기가 변하지 않게 tabular 숫자를 사용한다.
- 기존에 숨긴 telemetry와 긴 `playing` 문구를 다시 노출하지 않는다.

### 10.3 초상화

- 플레이어와 상대 모두 같은 크기의 둥근 사각형 플레이트를 사용한다.
- 360×640에서도 기존보다 큰 얼굴과 어깨가 보이게 한다.
- 이미지 크롭은 `object-position: center top`을 기준으로 캐릭터별 미세 조정 변수를 허용한다.
- 이름과 역할 문구는 한 줄 말줄임으로 제한해 초상화 공간을 침범하지 않는다.
- `attack`, `hit`, 위험, 승패 상태 전환은 현재 이벤트 기반 우선순위를 유지한다.
- HUD 확대 때문에 양쪽 게임판의 가용 크기를 줄이지 않는다.

## 11. 에셋

### 11.1 파일 규격

`루미`와 `세라`는 기존 프로젝트와 같은 밝은 판타지 일러스트와 레트로 전투 UI 조합으로 제작한다.

```text
public/assets/characters/cloud-courier/full.webp
public/assets/characters/cloud-courier/portrait-{state}.webp
public/assets/characters/star-alchemist/full.webp
public/assets/characters/star-alchemist/portrait-{state}.webp
```

- 전신: 캐릭터당 `1024×1024` 투명 WebP 한 장
- 초상화: 캐릭터당 `256×256` 투명 WebP 여섯 장
- 상태: `idle`, `focus`, `attack`, `hit`, `win`, `loss`
- 초상화는 얼굴과 어깨 중심, 같은 눈높이, 같은 여백을 사용한다.
- 세 캐릭터는 서로 다른 실루엣, 머리 모양, 소도구, 주조색을 가진다.
- 기존 리벳 초상화도 얼굴과 어깨가 잘리지 않는 동일 기준으로 다시 검토한다.
- 특정 상용 게임의 캐릭터, 의상, 로고, 고유 스프라이트를 복제하지 않는다.

### 11.2 manifest와 로더

- authored asset manifest를 schema 3으로 올린다.
- `common.characters`에 신규 플레이어 ID 두 개와 여섯 상태를 필수로 추가한다.
- 런타임 `CommonAssets`는 단일 `hero` 대신 `players: Record<PlayerCharacterId, PlayerCharacterAssets>`를 제공한다.
- 선택한 플레이어 에셋만 화면 컴포넌트로 전달한다.
- asset validator, complete fixture, generator portrait map을 같은 커밋에서 갱신한다.
- 전체 runtime asset은 기존 30 MiB 제한을 계속 만족해야 한다.

## 12. 테스트 전략

### 12.1 순수 로직

- 줄 삭제 1~4개 점수 표
- 플레이어 공격량과 아이템 사용 점수
- 상대 이벤트 무시
- 대전, 층, 부엉이 승리 보너스
- 패배, 무승부, 부엉이 승리의 런 종료
- 난이도별 최고 기록 비교와 동점 시간 비교
- 새로고침 중단 런이 최고 기록을 덮어쓰지 않는 동작

### 12.2 저장과 Firestore 경계

- v1, v2, v3에서 v4로의 마이그레이션
- 프로필 정규식과 캐릭터 ID 검증
- 난이도별 pending 기록 교체와 성공 시 제거
- Firebase 환경값 전체, 일부, 미설정 분기
- Firestore serializer와 TOP 20 정렬 query 계약
- 인증, 읽기, 쓰기 실패의 로컬 fallback
- Security Rules의 필드·타입·소유자·최고점 갱신 조건

실제 Firebase 프로젝트가 없어도 repository contract와 serialization은 fake adapter로 검증한다. Firebase 프로젝트가 연결되면 Emulator Suite 또는 전용 개발 프로젝트로 Rules 통합 검증을 추가 실행한다.

### 12.3 UI와 E2E

- 부팅 후 타이틀 표시
- 최초 START에서 이름 입력과 캐릭터 선택으로 이동
- 조이스틱 이동, 글자 선택, DEL, 비활성 END, 유효 END
- 세 캐릭터 선택과 프로필 저장
- 재부팅 시 온보딩 생략
- PLAYER CHANGE 후 타이틀 프로필 갱신
- 런 시작 시 1층과 0점으로 초기화
- 점수 이벤트 후 HUD 숫자 갱신
- 패배 후 런 종료와 최고 기록 표시
- 난이도별 TOP 20과 로컬 fallback 표시
- NEXT 문자 미표시와 네 셀 중앙 배치
- 360×640, 430×932에서 양쪽 얼굴·어깨와 게임판 가시성
- 기존 모달 중앙 정렬과 복귀 3-2-1 동작 회귀 검증

## 13. 완료 조건

- Firebase 설정 없이도 타이틀부터 전체 로컬 게임 흐름이 동작한다.
- 세 글자 이름과 세 캐릭터 선택이 저장되고 다시 변경할 수 있다.
- 세 캐릭터가 동일한 게임 규칙과 점수 규칙을 사용한다.
- 점수 표가 게임 이벤트에 결정적으로 적용된다.
- 랭킹 런은 반드시 1층부터 시작하고 패배·무승부 또는 부엉이 승리로 끝난다.
- 난이도별 로컬 최고 기록과 pending 제출이 데이터 손실 없이 유지된다.
- Firebase 설정 후 익명 사용자별 최고 기록과 TOP 20 조회가 동작한다.
- Firestore Rules가 다른 UID 쓰기, 필드 변조, 낮은 기록 덮어쓰기, 삭제를 거부한다.
- NEXT에는 문자가 보이지 않고 조각이 중앙에 놓인다.
- 360×640과 430×932에서 초상화가 얼굴·어깨 중심으로 보이며 게임판을 축소하지 않는다.
- typecheck, 전체 Vitest, Playwright, asset validation, source policy, web build, delivery gates가 통과한다.
