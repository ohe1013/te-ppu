import type { FloorOpponentId } from '../assets/types';
import type { Floor } from './floors';

export type EncounterIndex = 0 | 1 | 2;

export interface FloorEncounter {
  readonly floor: Floor;
  readonly index: EncounterIndex;
  readonly characterId: FloorOpponentId;
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

function encounter(
  floor: Floor,
  index: EncounterIndex,
  characterId: FloorOpponentId,
  displayName: string,
  title: string,
  intro: string,
  winLine: string,
  lossLine: string,
): FloorEncounter {
  return Object.freeze({
    floor,
    index,
    characterId,
    displayName,
    title,
    intro,
    winLine,
    lossLine,
  });
}

const floorOne = Object.freeze([
  encounter(1, 0, 'quartermaster', '기어 창고장', '고장 난 동력핵의 관리자', '부서진 부품을 정리해야 다음 문이 열린다.', '창고의 기어가 다시 맞물린다.', '기어가 엉켜 길을 막았다.'),
  encounter(1, 1, 'clock-moth', '시계나방 틱', '시간을 훔치는 감시자', '틱이 탑의 시계를 늦추며 네 움직임을 읽는다.', '멈췄던 초침이 다시 움직인다.', '시간이 한 박자 먼저 흘렀다.'),
  encounter(1, 2, 'moss-golem', '이끼 골렘 모스', '균열을 덮은 수호자', '모스는 동력핵의 균열을 이끼로 봉인하고 있다.', '돌 틈 사이로 별빛이 새어 나온다.', '무거운 돌벽이 다시 내려앉았다.'),
] as const);

const floorTwo = Object.freeze([
  encounter(2, 0, 'alchemist', '거품 연금술사', '불안정한 거품의 제조자', '연금술사는 동력핵의 잔광을 거품 속에 가두었다.', '거품이 터지며 길이 맑아진다.', '거품 속에서 길을 잃었다.'),
  encounter(2, 1, 'glass-oracle', '유리 예언자 프리즘', '깨진 거울의 예언자', '프리즘은 깨진 거울로 네 다음 수를 비춘다.', '거울에 처음으로 밝은 미래가 비친다.', '예언이 네 수보다 빨랐다.'),
  encounter(2, 2, 'spark-slime', '전광 슬라임 볼트', '실험실을 뛰쳐나온 전하', '볼트가 코일에 모은 전기로 동력핵의 회로를 마구 뒤섞는다.', '코일의 전류가 가지런히 탑으로 흐른다.', '과충전된 회로가 길을 튕겨 냈다.'),
] as const);

const floorThree = Object.freeze([
  encounter(3, 0, 'guard-captain', '구름 경비대장', '폭풍 관문의 지휘관', '경비대장은 구름 관문을 닫고 별빛을 위로 보내지 않는다.', '구름 관문이 갈라져 위층이 보인다.', '폭풍이 관문을 다시 닫았다.'),
  encounter(3, 1, 'frost-smith', '서리 대장장이 브룸', '빙결 장비를 벼리는 장인', '브룸이 얼음 망치로 관문의 균열을 단단히 봉합한다.', '얼음 모루가 갈라지며 길이 열린다.', '서리 망치가 블록을 꽁꽁 묶었다.'),
  encounter(3, 2, 'storm-harpy', '폭풍 하피 제피라', '구름 위의 날개 검객', '제피라가 두 날개로 폭풍의 흐름을 베어 네 수를 흩뜨린다.', '갈라진 바람 사이로 다음 층이 드러난다.', '날개바람이 길을 구름 밖으로 밀어냈다.'),
] as const);

const floorFour = Object.freeze([
  encounter(4, 0, 'dark-engineer', '뒤틀린 기술자', '그림자 동력의 설계자', '뒤틀린 기술자는 마왕의 그림자로 새 동력핵을 만들고 있다.', '그림자 회로가 빛을 받아들인다.', '그림자 회로가 모든 빛을 삼켰다.'),
  encounter(4, 1, 'brass-minotaur', '황동 미노타우로스 브라스', '용광로의 중장 수문장', '브라스가 황동 뿔을 달구며 왕좌로 가는 주조문을 지킨다.', '식은 황동문이 천천히 양쪽으로 열린다.', '용광로의 압력이 길을 밀어 닫았다.'),
  encounter(4, 2, 'cinder-witch', '잿불 마녀 신더', '꺼지지 않는 화로의 술사', '신더가 잿불 지팡이로 별빛을 왕좌의 불씨로 바꾸려 한다.', '잿불 문양이 사라지고 맑은 별빛이 남는다.', '검은 망토가 불길처럼 길을 덮었다.'),
] as const);

const floorFive = Object.freeze([
  encounter(5, 0, 'chain-knight', '사슬 기사 카덴', '왕좌 감옥의 마지막 문지기', '카덴이 사슬 방패를 펼쳐 마왕의 알현실을 단단히 잠근다.', '풀린 사슬이 왕좌까지 이어지는 길이 된다.', '사슬 고리가 네 수를 한데 묶었다.'),
  encounter(5, 1, 'night-archivist', '밤의 기록관 베스퍼', '금지된 결말을 기록한 서기', '베스퍼가 초승달 책에 녹스가 이기는 결말만 남기려 한다.', '봉인된 페이지가 열리며 진짜 결말이 돌아온다.', '보랏빛 봉인이 다음 수를 지워 버렸다.'),
  encounter(5, 2, 'demon-king', '탑의 마왕 녹스', '별빛 동력핵을 묶은 최종 지배자', '녹스가 별빛 동력핵을 왕좌에 묶고 탑의 시간을 움켜쥐고 있다.', '왕좌의 봉인이 풀리고 별빛이 탑을 타고 오른다.', '녹스가 왕좌의 봉인을 더 깊이 잠갔다.'),
] as const);

export const FLOOR_ENCOUNTERS: Readonly<Record<Floor, readonly [FloorEncounter, FloorEncounter, FloorEncounter]>> = {
  1: floorOne,
  2: floorTwo,
  3: floorThree,
  4: floorFour,
  5: floorFive,
};

export function getFloorEncounters(floor: Floor): readonly [FloorEncounter, FloorEncounter, FloorEncounter] {
  return FLOOR_ENCOUNTERS[floor];
}

export function getFloorEncounter(floor: Floor, index: EncounterIndex): FloorEncounter {
  if (index !== 0 && index !== 1 && index !== 2) {
    throw new RangeError('Invalid floor encounter.');
  }
  return FLOOR_ENCOUNTERS[floor][index];
}
