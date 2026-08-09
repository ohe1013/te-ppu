import type { HeroPortraitState, PlayerCharacterAssets } from '../../assets';
import type { PlayerCharacterDefinition } from '../../player';
import { AssetImage } from '../match/AssetImage';
import { CharacterPortrait } from './CharacterPortrait';

export interface SelectedPlayerIdentityProps {
  readonly assets?: PlayerCharacterAssets;
  readonly context: 'player' | 'result' | 'owl result' | 'ending';
  readonly player: PlayerCharacterDefinition;
  readonly portraitState: HeroPortraitState;
}

export function SelectedPlayerIdentity({
  assets,
  context,
  player,
  portraitState,
}: SelectedPlayerIdentityProps) {
  const fullArtPrefix = context === 'player' ? '' : `${context} `;
  return (
    <div
      aria-label={`${player.name} ${context} identity`}
      className={`selected-player-identity selected-player-identity--${context.replaceAll(' ', '-')}`}
      data-character-id={player.id}
      role="group"
    >
      <div className="selected-player-identity__full-art">
        <AssetImage
          alt={`${player.name} ${fullArtPrefix}full illustration`}
          url={assets?.fullArt?.url}
        />
      </div>
      <CharacterPortrait
        alt={`${player.name} ${portraitState} portrait`}
        image={assets?.portraits[portraitState]}
        state={portraitState}
      />
      <div className="selected-player-identity__copy">
        <strong>{player.name}</strong>
        <span>{player.title}</span>
      </div>
    </div>
  );
}
