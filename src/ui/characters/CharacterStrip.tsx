import type { CommonAssets } from '../../assets';
import type { EncounterIndex, FloorEncounter } from '../../progression';
import { CharacterPortrait } from './CharacterPortrait';

export interface CharacterStripProps {
  readonly encounters: readonly [FloorEncounter, FloorEncounter, FloorEncounter];
  readonly rivals: CommonAssets['rivals'];
  readonly activeIndex: EncounterIndex;
  readonly unlocked: boolean;
}

export function CharacterStrip({ activeIndex, encounters, rivals, unlocked }: CharacterStripProps) {
  return (
    <ol
      aria-label="층별 라이벌 순서"
      className={`character-strip ${unlocked ? 'character-strip--unlocked' : 'character-strip--locked'}`}
      data-unlocked={unlocked ? 'true' : 'false'}
    >
      {encounters.map((encounter) => {
        const rival = rivals[encounter.characterId];
        const active = encounter.index === activeIndex;
        return (
          <li
            className={`character-strip__node ${active ? 'character-strip__node--active' : ''}`}
            data-encounter-index={encounter.index}
            data-encounter-state={active ? 'active' : 'queued'}
            key={`${encounter.floor}-${encounter.index}`}
          >
            <CharacterPortrait
              alt={`${encounter.displayName} ${active ? '현재 상대' : '대기 중'} 초상`}
              image={unlocked ? rival?.portraits.idle : undefined}
              state="idle"
            />
            <span className="character-strip__name">{encounter.displayName}</span>
            <small>{encounter.index + 1}</small>
          </li>
        );
      })}
    </ol>
  );
}
