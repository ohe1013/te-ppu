# 타워 라이벌 연속 대전과 아케이드 전투 정체성 개편 설계

## 목표

현재 프로토타입의 핵심 문제를 하나의 플레이 흐름으로 해결한다.

1. 타워·모드 선택·층 소개·대전 화면에서 상징 캐릭터와 상대를 즉시 알아볼 수 있게 한다.
2. 층마다 서로 다른 라이벌 3명과 연속 대전하고 3승해야 다음 층을 해금한다.
3. 긴 상태 문구와 숫자 telemetry를 줄이고, 보드·캐릭터 표정·공격 흐름을 화면의 중심으로 둔다.
4. 공격, 피격, 위험, 승리·패배가 상대 캐릭터의 표정과 보드 효과로 연결되게 한다.
5. 게임 나가기의 SDK 대기 상태가 게임을 멈춘 것처럼 보이지 않게 한다.

이번 설계에서 참고하는 것은 1994년작 `ぷよぷよ通(Puyo Puyo Tsu/Puyo Puyo 2)`의 장르 문법뿐이다. 공식 캐릭터, 로고, 스프라이트, 문구, 고유 그래픽을 복제하지 않는다.

## 조사 결과와 적용 원칙

공개 자료를 실제로 확인한 결과, 다음 요소를 제품 요구사항으로 채택한다.

- 싱글 플레이는 라이벌이 기다리는 타워를 오르며 상대를 차례로 이기는 구조다. `SEGA AGES ぷよぷよ通` 공식 페이지는 타워의 라이벌들과 싸우는 `かちぬき` 흐름을 설명하고, 공식 버추얼 콘솔 페이지는 싱글 플레이에서 타워 캐릭터를 물리치며 위층으로 진행하는 흐름을 설명한다.
- 상대 선택·등장 화면은 캐릭터의 이름과 큰 초상화를 진행 정보와 함께 보여준다. 상대는 작은 장식이 아니라 다음 플레이 목표를 설명하는 콘텐츠다.
- 실제 대전 화면은 양쪽 필드가 가장 크고, 중앙의 작은 마스코트·NEXT·점수·공격 관련 정보가 보조한다. 긴 문장형 상태 헤더가 필드보다 우선하지 않는다.
- 공격은 액션 게임의 큰 탄환 자체보다 연쇄·공격 예고·상쇄·상대 필드의 방해 블록 낙하가 읽혀야 한다. 따라서 이 게임도 `공격 준비 → 중앙 공격 신호 → 상대 피격 표정 → 방해 블록 도착` 순서로 표현한다.

참고 자료:

- https://archives.sega.jp/segaages/puyo2/
- https://vc.sega.jp/vc_puyo2/
- https://www.inside-games.jp/article/img/2011/06/03/49416/197567.fullscreen.html
- https://segabits.com/blog/2016/04/12/users-guide-puyo-puyo-tsu-puyo-puyo-2/
- https://www.mobygames.com/game/13047/puyo-puyo-2/screenshots/

## 사용자 여정

```text
BOOT
  -> TOWER (마왕의 실루엣 + 동료 마스코트 + 5층 경로)
  -> FLOOR_INTRO (현재 층의 3인 라이벌 순서와 첫 상대)
  -> MATCH #1
  -> ENCOUNTER_RESULT
  -> FLOOR_INTRO (다음 상대 소개, 1승/3승)
  -> MATCH #2
  -> ENCOUNTER_RESULT
  -> FLOOR_INTRO (다음 상대 소개, 2승/3승)
  -> MATCH #3
  -> FLOOR_RESULT (층 클리어, 다음 층 해금)
  -> TOWER 또는 ENDING
```

패배나 무승부는 해당 층의 연승 기록을 초기화하고 층 결과 화면으로 이동한다. 사용자는 `다시 대전`으로 같은 층의 첫 상대부터 새로 시작할 수 있다. 한두 명을 이긴 상태는 저장하지 않는다. 저장되는 것은 최종 3승으로 확정된 층 해금과 클리어 기록뿐이다.

## 스토리와 캐릭터 카탈로그

### 세계관

타워의 꼭대기에는 `탑의 마왕 녹스`가 봉인한 별빛 동력핵이 있다. 동력핵은 타워를 떠받치지만, 녹스가 핵을 독점하면서 아래층의 기계·구름·연금·그림자 설비가 차례로 고장 난다. 수리공 영웅 `리벳`과 동력핵의 길을 읽는 부엉이 동료 `코일`은 타워를 무너뜨리지 않고 핵을 되돌리기 위해 올라간다.

녹스는 직접 내려오지 않고 각 층의 관리자에게 핵의 열쇠 조각을 맡긴다. 각 관리자와 수문장은 같은 층의 주제와 기계 고장 원인을 공유한다. 따라서 라이벌은 임의로 나열된 캐릭터가 아니라, 다음 층으로 가기 위해 해결해야 하는 사건의 순서가 된다.

### 상징 캐릭터 배치

- `탑의 마왕 녹스`: 타워 화면의 가장 큰 실루엣·문장·층 배경의 상징. 대전 HUD에서는 최종 층의 상대이거나 작은 왕좌 엠블럼으로 표시한다.
- `코일`: 플레이어의 조력자이자 안내 마스코트. 타워 노드 옆, 층 소개의 말풍선, 결과 화면의 짧은 반응에 등장한다.
- `리벳`: 플레이어 캐릭터. 대전 HUD와 승패 화면에서 고정적으로 보이며, 공격·피격·집중 상태를 가진다.

### 라이벌 로스터

현재 5개 층을 유지하되, 각 층에 3개 `FloorEncounter`를 둔다. 기존 5명은 재사용하되 역할과 등장 순서를 데이터로 명확히 하고, 다음 3명의 오리지널 악당을 추가해 상대 수와 시각적 다양성을 늘린다.

| ID | 표시 이름 | 역할 | 주요 층 주제 |
| --- | --- | --- | --- |
| `quartermaster` | 기어 창고장 브라스 | 열쇠 조각을 숨긴 물자 관리자 | 기계 입구 |
| `alchemist` | 거품 연금술사 버블 | 동력액을 불안정하게 만든 실험자 | 연금 공방 |
| `guard-captain` | 구름 경비대장 스트라토 | 상층 통로를 봉쇄한 수문장 | 구름 갑판 |
| `dark-engineer` | 뒤틀린 기술자 그라프 | 그림자 엔진을 개조한 기술자 | 그림자 엔진 |
| `clock-moth` | 시계나방 틱 | 시간을 훔쳐 전투를 지연시키는 정찰자 | 기계 입구·시간 회랑 |
| `glass-oracle` | 유리 예언자 프리즘 | 고장 난 거울로 가짜 경로를 만드는 예언자 | 연금 공방·거울 회랑 |
| `moss-golem` | 이끼 골렘 모스 | 동력핵 폐열을 먹고 자란 수호 골렘 | 구름 갑판·그림자 엔진 |
| `demon-king` | 탑의 마왕 녹스 | 별빛 동력핵을 독점한 최종 상대 | 왕좌층 |

층별 3연전은 각 층의 주제와 위협이 점점 커지는 순서로 배치한다. 마지막 층의 세 번째 상대는 항상 `demon-king`이다. 같은 캐릭터가 다른 층에 재등장할 때에는 별칭·대사·상태 색상으로 사건의 연결을 설명하며, 초상화는 캐릭터의 핵심 실루엣을 유지한다.

## 진행 상태와 모듈 경계

### 새 데이터 단위

`src/progression/encounters.ts`에 다음 읽기 전용 데이터를 둔다.

```ts
export type EncounterIndex = 0 | 1 | 2;

export interface FloorEncounter {
  readonly floor: Floor;
  readonly index: EncounterIndex;
  readonly characterId: CharacterId;
  readonly displayName: string;
  readonly title: string;
  readonly intro: string;
  readonly winLine: string;
  readonly lossLine: string;
}

export interface FloorSeriesState {
  readonly floor: Floor;
  readonly encounterIndex: EncounterIndex;
  readonly wins: 0 | 1 | 2;
}
```

`FLOOR_ENCOUNTERS[floor]`는 항상 길이 3이며, 각 항목의 `index`는 배열 위치와 일치해야 한다. 화면은 상대 이름을 직접 하드코딩하지 않고 이 카탈로그를 소비한다.

### `TowerController` 책임

- `startFloor(floor, seed)`: 해금된 층의 첫 상대와 새 매치를 만든다. `FloorSeriesState`를 `{ floor, encounterIndex: 0, wins: 0 }`으로 초기화한다.
- `completeEncounter(result)`: 현재 매치를 종료하고 결과를 계산한다. `WIN`이면서 `encounterIndex < 2`이면 wins를 1 증가시켜 다음 소개 화면으로 보낸다. 세 번째 `WIN`에서만 `applyFloorResult`를 호출한다.
- `LOSS`·`DRAW`: 시리즈 상태를 폐기하고 층 결과 화면으로 보낸다. 다음 재도전은 첫 상대부터 새 매치다.
- 진행 저장에는 `MatchState`, AI 상태, `FloorSeriesState`, 보드, 시드가 포함되지 않는다. 저장 실패 시 현재 메모리 진행과 재시도 경로는 기존 계약을 유지한다.

### 라우트 책임

현재 `floor-intro`, `match`, `result` 라우트에 `encounterIndex`와 `wins`를 포함시킨다. 별도 전투 규칙을 만들지 않고, 각 상대전은 기존 `MatchScreen` 하나를 새 시드로 실행한다. `AppRoot`는 `TowerController`가 반환한 현재 상대 데이터만 라우트에 전달한다.

## 화면 설계

### 타워·층 소개·결과

- `TowerScreen`은 중앙 세로 경로를 유지하되, 각 노드에 층 번호·현재 층의 3인 초상화 스트립·잠금/클리어 표시를 넣는다.
- 타워 배경의 뒤쪽에는 `demon-king`의 큰 반투명 실루엣을 배치해 타워의 목적을 즉시 설명한다.
- `owl-companion`은 선택 가능한 모드와 타워 상단의 안내 마스코트로 사용한다.
- `FloorIntroScreen`은 현재 상대 한 명의 전신 아트·큰 초상화·이름·짧은 대사를 보여주고, 아래에 `1승 / 3승` 같은 짧은 진행 배지만 둔다. AI 반응 간격과 내부 수치는 숨긴다.
- 전투 결과는 한 상대의 승패와 다음 상대 소개를 구분한다. 세 번째 승리일 때만 `층 클리어`를 표시한다.

### 대전 HUD

현재의 `층 대전`, `대전 진행 중`, 상태 문장을 한 줄의 작은 메타 배지로 축소하고, 보드 높이를 확보한다.

각 캐릭터 플레이트는 다음을 표시한다.

- 48~64px 초상화 또는 얼굴판
- 고유 이름과 짧은 역할명
- `idle`, `focus`, `attack`, `hit`, `panic`, `rage`, `win`, `loss`, `defeat` 상태별 이미지
- NEXT 블록 2개
- 공격 예고를 숫자 대신 점등 링·색상·작은 경고 아이콘으로 표시

combo, incoming, freeze tick, match tick, AI 반응 간격은 화면에 숫자로 노출하지 않는다. 기존 `data-testid`와 숨김 접근성 텍스트는 회귀 테스트를 위해 유지한다.

### 보드와 공격 연출

두 보드는 항상 동시에 같은 크기의 주 시각 요소로 남긴다. 공격 이벤트의 시각 순서는 다음과 같다.

```text
lines-cleared / attack-sent
  -> 공격자 보드의 연쇄·충격 플래시
  -> 중앙 공격 레인에 짧은 에너지 리본 또는 마커 이동
  -> 대상 캐릭터 portrait=hit 또는 panic
  -> garbage-landed 시 대상 보드 상단 경고와 낙하 충격
```

공격 효과가 atlas에 없을 때는 같은 순서를 유지하는 단순한 색상 리본·점·충격 링으로 대체한다. 보드 상태가 판정을 결정하고, 렌더러는 `GameEvent`와 공개 뷰를 표현한다.

## 종료 흐름

`ExitConfirmation`은 다음 상태를 명시적으로 가진다.

- `idle`: 확인 전
- `closing`: `platform.close()` 호출 중, 중복 호출 금지
- `failed`: 제한 시간 안에 완료되지 않아 재시도 가능

`closing`에서는 즉시 “게임을 닫는 중” 피드백을 보여주고 입력을 잠근다. SDK Promise가 정해진 제한 시간 안에 끝나지 않으면 `failed`로 바꾸며, 같은 확인 창에서 다시 시도할 수 있다. 브라우저 포트는 기존처럼 즉시 완료되고, 실제 Apps-in-Toss 포트만 SDK 대기 보호를 적용한다.

제한 시간은 `1,200ms`로 고정한다. 제한 시간은 SDK 호출을 취소하는 값이 아니라 UI가 무한 대기처럼 보이지 않게 하는 값이다. 제한 시간이 지나도 이미 시작한 `closeView()` 호출은 한 번만 유지하며, 재시도는 이전 호출이 정리된 뒤에만 허용한다.

## 구현 경계

- `src/progression/encounters.ts`: 캐릭터 카탈로그, 층별 3인 encounter 배열, 표시 문구를 순수 데이터로 제공한다.
- `src/progression/tower.ts` 및 `src/app/towerController.ts`: 3연전 상태 전이와 최종 3승 시점의 해금·저장을 소유한다.
- `src/app/app-route.ts`, `src/app/AppRoot.tsx`, `src/ui/screens/*`: 현재 encounter와 wins를 라우트에 전달하고 소개·결과 화면을 구성한다.
- `src/assets/types.ts`, `src/assets/manifest.ts`, `src/assets/asset-manager.ts`, `scripts/generate-authored-assets.py`, `public/assets/characters/*`: 신규 오리지널 라이벌과 상태별 초상화를 기존 fallback·manifest 계약에 맞춰 제공한다.
- `src/ui/match/portrait-state.ts`, `src/ui/match/BattleHud.tsx`, `src/ui/screens/MatchScreen.tsx`: 공개 게임 이벤트를 캐릭터 상태·이름·컴팩트 HUD로 변환한다.
- `src/render/event-animation-queue.ts`, `src/render/battle-animation-registry.ts`, `src/render/BattleCanvas.tsx`: 공격 이벤트의 순서·수명·atlas/fallback 연출을 소유한다.
- `src/ui/match/ExitConfirmation.tsx` 및 `src/platform/*`: 종료 확인의 `idle/closing/failed` 상태와 1,200ms 보호를 소유한다.

`src/core`의 블록 판정·공격 계산·AI 공개 관찰 계약은 변경하지 않는다. 새로운 연속 대전은 여러 개의 기존 `MatchState`를 진행성 컨트롤러가 연결하는 방식으로 구현한다.

## 오류 처리

- 에셋이 없거나 로드가 늦으면 기존 procedural fallback으로 대체하되, 캐릭터 이름·상태·연속 대전 상태는 계속 표시한다.
- 현재 층의 encounter 데이터가 없거나 잘못된 인덱스이면 매치를 시작하지 않고 타워로 돌아가며, 사용자에게 재시도 가능한 오류를 표시한다.
- 저장 실패는 기존 `SAVE_FAILED`와 재시도 버튼을 유지한다. 1승·2승 상태를 저장 실패와 혼동하지 않도록 시리즈는 메모리에서만 유지한다.
- close SDK가 실패해도 전투 상태를 복구하거나 브라우저 history를 변경하지 않는다.

## 테스트 전략

### 진행·데이터

- 각 층의 encounter 배열이 정확히 3개이고 인덱스가 연속인지 검증한다.
- 한 번 또는 두 번 이긴 뒤에는 다음 층이 해금되지 않는지 검증한다.
- 세 번째 승리에서만 층 클리어·다음 층 해금·최종 층 ending이 발생하는지 검증한다.
- 패배·무승부가 wins와 encounterIndex를 초기화하는지 검증한다.
- 매 경기 시작이 새 시드와 새 `MatchState`를 사용하는지 검증한다.

### 화면·연출

- 타워에 마왕 실루엣, 코일 마스코트, 층별 상대 초상화가 보이는지 검증한다.
- 층 소개와 전투 HUD에 상대 이름·초상화가 보이고, 긴 상태 문장과 숫자 telemetry가 시각적으로 노출되지 않는지 검증한다.
- 각 `GameEvent`가 공격자·대상 portrait 상태와 공격 효과 순서를 올바르게 바꾸는지 검증한다.
- atlas가 없어도 공격 연출 fallback이 사라지지 않는지 검증한다.

### 종료·통합

- 확인 버튼 한 번에 close가 한 번만 호출되는지 검증한다.
- close Promise가 제한 시간 안에 끝나면 성공 상태가 되고, 지연되면 재시도 상태가 되는지 검증한다.
- 360×640과 430×932에서 타워→3연전→다음 층 흐름과 보드 2개가 유지되는지 E2E로 검증한다.

## 범위 밖

- 실시간 멀티플레이, 서버 저장, 신규 퍼즐 규칙, 매치메이킹은 포함하지 않는다.
- 공식 게임의 캐릭터·이미지·사운드·로고를 사용하지 않는다.
- 최종 상용 브랜딩과 Apps-in-Toss 공개 출시 승인은 별도 작업이다.

## 완료 기준

- 층당 3명의 상대가 실제 플레이 흐름에 나타나고 3승 전에는 다음 층이 열리지 않는다.
- 타워·층 소개·대전·결과 화면에서 상대의 정체가 한눈에 보인다.
- 플레이 중 캐릭터 표정과 공격 흐름이 보드 상태 변화와 동기화된다.
- HUD가 보드와 캐릭터를 가리지 않으며, 숫자 telemetry가 화면을 차지하지 않는다.
- 게임 나가기 지연이 무한 대기처럼 보이지 않고, 성공·실패·재시도 상태가 명확하다.
- 기존 코어 규칙, AI 공개 관찰 경계, 에셋 fallback, 접근성 테스트 계약을 깨지 않는다.
