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
  encounter(2, 2, 'clock-moth', '시계나방 틱', '시간을 훔치는 감시자', '틱이 다시 나타나 동력핵의 시간을 되감는다.', '되감긴 톱니가 앞으로 굴러간다.', '시간이 다시 첫 칸으로 돌아갔다.'),
] as const);

const floorThree = Object.freeze([
  encounter(3, 0, 'guard-captain', '구름 경비대장', '폭풍 관문의 지휘관', '경비대장은 구름 관문을 닫고 별빛을 위로 보내지 않는다.', '구름 관문이 갈라져 위층이 보인다.', '폭풍이 관문을 다시 닫았다.'),
  encounter(3, 1, 'moss-golem', '이끼 골렘 모스', '균열을 덮은 수호자', '모스가 더 깊은 균열을 돌덩이와 뿌리로 묶었다.', '뿌리가 길을 놓아준다.', '뿌리가 발목을 붙잡았다.'),
  encounter(3, 2, 'glass-oracle', '유리 예언자 프리즘', '깨진 거울의 예언자', '프리즘이 폭풍 속에서 동력핵의 진짜 상처를 보여준다.', '깨진 거울이 하나의 길로 합쳐진다.', '거울 조각이 길을 산산이 흩뜨렸다.'),
] as const);

const floorFour = Object.freeze([
  encounter(4, 0, 'dark-engineer', '뒤틀린 기술자', '그림자 동력의 설계자', '뒤틀린 기술자는 마왕의 그림자로 새 동력핵을 만들고 있다.', '그림자 회로가 빛을 받아들인다.', '그림자 회로가 모든 빛을 삼켰다.'),
  encounter(4, 1, 'quartermaster', '기어 창고장', '마왕의 부품을 모은 관리자', '창고장은 마지막 부품을 마왕의 왕좌로 옮기려 한다.', '마지막 기어가 네 편으로 돌아선다.', '부품 상자가 다시 잠겼다.'),
  encounter(4, 2, 'alchemist', '거품 연금술사', '왕좌를 위한 마지막 실험', '연금술사는 별빛을 뒤틀어 왕좌의 문을 열려 한다.', '실험관이 맑아지며 왕좌가 드러난다.', '불안정한 빛이 다시 솟구쳤다.'),
] as const);

const floorFive = Object.freeze([
  encounter(5, 0, 'clock-moth', '시계나방 틱', '왕좌의 시간을 지키는 파수꾼', '틱은 마왕의 시간을 멈춘 채 왕좌로 향하는 길을 봉인한다.', '멈춘 시간이 다시 흐르기 시작한다.', '왕좌의 시계가 네 움직임을 삼켰다.'),
  encounter(5, 1, 'glass-oracle', '유리 예언자 프리즘', '왕좌를 비추는 거울', '프리즘은 녹스가 숨긴 마지막 결말을 유리 속에 감췄다.', '거울이 동력핵의 진짜 빛을 돌려준다.', '거울 속 결말이 닫혀 버렸다.'),
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
