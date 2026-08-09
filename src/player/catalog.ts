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
