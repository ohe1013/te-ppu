import type { Floor } from '../../app/app-route';
import type { LoadedImageRef, RivalCharacterAssets } from '../../assets';
import type { FloorEncounter, FloorSeriesState } from '../../progression';
import { AssetImage } from '../match/AssetImage';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface FloorIntroScreenProps {
  readonly floor: Floor;
  readonly encounter: FloorEncounter;
  readonly series: FloorSeriesState;
  readonly rival?: RivalCharacterAssets;
  readonly background?: LoadedImageRef;
  readonly onBack: () => void;
  readonly onStart: () => void;
}

export function FloorIntroScreen({
  background,
  encounter,
  floor,
  onBack,
  onStart,
  rival,
  series,
}: FloorIntroScreenProps) {
  return (
    <section
      className="screen-shell floor-intro-screen"
      data-encounter-index={encounter.index}
      data-testid="floor-intro-screen"
    >
      <ScreenBackdrop image={background} />
      <div className="character-intro-panel">
        <div className="character-intro-panel__rival">
          <div className="character-intro-panel__full-art">
            <AssetImage
              alt={`${encounter.displayName} 전신 일러스트`}
              url={rival?.fullArt?.url}
            />
          </div>
          <CharacterPortrait
            alt={`${encounter.displayName} 입장 초상`}
            image={rival?.portraits.idle}
            state="idle"
          />
        </div>
        <div className="character-intro-panel__copy">
          <p className="eyebrow">{floor}층 · {series.wins}/3 승리</p>
          <h1>{encounter.displayName}</h1>
          <p className="character-intro-panel__title">{encounter.title}</p>
          <p className="character-intro-panel__speech">{encounter.intro}</p>
          <p className="character-intro-panel__badge">상대 {encounter.index + 1}/3</p>
        </div>
      </div>
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onBack}>타워로</button>
        <button type="button" onClick={onStart}>대전 시작</button>
      </div>
    </section>
  );
}
