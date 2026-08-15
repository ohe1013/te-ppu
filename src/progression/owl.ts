export interface OwlEncounter {
  readonly characterId: 'owl-companion';
  readonly displayName: string;
  readonly title: string;
  readonly intro: string;
  readonly winLine: string;
  readonly lossLine: string;
}

export const OWL_ENCOUNTER: OwlEncounter = Object.freeze({
  characterId: 'owl-companion',
  displayName: '태엽 부엉이 아르카',
  title: '탑의 설계자',
  intro: '악마왕은 미끼였을 뿐이야. 이제 탑의 진짜 주인과 대결하자.',
  winLine: '부엉이의 태엽이 멎고, 탑의 꼭대기에 새벽빛이 들어온다.',
  lossLine: '부엉이가 다시 날개를 접었다. 설계자의 방에서 재도전하자.',
});
