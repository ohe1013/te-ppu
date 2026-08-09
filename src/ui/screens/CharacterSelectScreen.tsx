import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LoadedImageRef } from '../../assets';
import {
  PLAYER_CHARACTER_IDS,
  PLAYER_CHARACTERS,
  type PlayerCharacterDefinition,
  type PlayerCharacterId,
} from '../../player';
import { ArcadeDirectionPad } from '../arcade/ArcadeDirectionPad';
import type { ArcadeDirection } from '../arcade/grid-navigation';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface PlayerCharacterArt {
  readonly fullArt?: LoadedImageRef;
}

export interface CharacterSelectScreenProps {
  readonly players?: Readonly<Record<PlayerCharacterId, PlayerCharacterDefinition>>;
  readonly assets?: Partial<Readonly<Record<PlayerCharacterId, PlayerCharacterArt>>>;
  readonly initialCharacterId?: PlayerCharacterId;
  readonly onComplete: (characterId: PlayerCharacterId) => void;
  readonly onBack: () => void;
}

export function CharacterSelectScreen({
  assets = {},
  initialCharacterId = 'hero-engineer',
  onBack,
  onComplete,
  players = PLAYER_CHARACTERS,
}: CharacterSelectScreenProps) {
  const [selectedId, setSelectedId] = useState<PlayerCharacterId>(initialCharacterId);
  const cardRailRef = useRef<HTMLDivElement>(null);
  const previousSelectedIdRef = useRef<PlayerCharacterId>(selectedId);
  const selectedIndex = PLAYER_CHARACTER_IDS.indexOf(selectedId);

  useEffect(() => {
    if (previousSelectedIdRef.current === selectedId) return;
    previousSelectedIdRef.current = selectedId;
    cardRailRef.current
      ?.querySelector<HTMLElement>(`[data-character-id="${selectedId}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selectedId]);

  const moveSelection = (direction: ArcadeDirection) => {
    if (direction !== 'left' && direction !== 'right') return;
    const offset = direction === 'left' ? -1 : 1;
    const nextIndex = Math.max(0, Math.min(PLAYER_CHARACTER_IDS.length - 1, selectedIndex + offset));
    const nextId = PLAYER_CHARACTER_IDS[nextIndex];
    if (nextId !== undefined) setSelectedId(nextId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowLeft' ? 'left' : 'right');
      return;
    }
    if (event.key === 'Enter') {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onComplete(selectedId);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      onBack();
    }
  };

  return (
    <section
      autoFocus
      className="screen-shell onboarding-screen character-select-screen"
      data-selected-character-id={selectedId}
      data-testid="character-select-screen"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <ScreenBackdrop className="screen-backdrop--art" image={assets[selectedId]?.fullArt} />
      <header className="onboarding-screen__header">
        <p className="eyebrow">CHOOSE YOUR HERO</p>
        <h1>캐릭터 선택</h1>
        <p>세 캐릭터의 전투 성능은 모두 같습니다.</p>
      </header>
      <div
        aria-label="플레이어 캐릭터"
        className="character-select-screen__cards"
        ref={cardRailRef}
        role="group"
      >
        {PLAYER_CHARACTER_IDS.map((characterId) => {
          const player = players[characterId];
          return (
            <button
              aria-pressed={selectedId === characterId}
              className="character-select-card"
              data-character-id={characterId}
              key={characterId}
              onClick={() => setSelectedId(characterId)}
              type="button"
            >
              <AssetImage
                alt={`${player.name} 전신 일러스트`}
                className="character-select-card__art"
                url={assets[characterId]?.fullArt?.url}
              />
              <span className="character-select-card__identity">
                <strong>{player.name}</strong>
                <small>{player.role}</small>
              </span>
              <span className="character-select-card__title">{player.title}</span>
              <span className="character-select-card__story">{player.story}</span>
            </button>
          );
        })}
      </div>
      <div className="onboarding-controls">
        <ArcadeDirectionPad onDirection={moveSelection} />
        <div className="onboarding-controls__actions">
          <button onClick={() => onComplete(selectedId)} type="button">SELECT</button>
          <button className="secondary-button" onClick={onBack} type="button">BACK</button>
        </div>
      </div>
    </section>
  );
}
