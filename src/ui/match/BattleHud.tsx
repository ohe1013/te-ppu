import type { ItemType, PieceKind, PublicSideView, SideId } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import type { CSSProperties } from 'react';
import { AssetImage } from './AssetImage';
import {
  createCharacterPlateModel,
  type CharacterPlateCharacter,
} from './character-plate';
import { PiecePreview } from './piece-preview';
import type { PortraitPresentation } from './portrait-state';

export interface BattleHudProps {
  readonly character: CharacterPlateCharacter;
  readonly model: PublicSideView;
  readonly portrait?: PortraitPresentation;
  readonly portraitPosition?: string;
  readonly side: SideId;
  readonly tiles?: Partial<Record<PieceKind, LoadedImageRef>>;
  readonly items?: Partial<Record<ItemType, LoadedImageRef>>;
}

const ITEM_LABELS: Readonly<Record<ItemType, string>> = {
  'row-clear': '행 제거',
  freeze: '빙결',
  'queue-swap': '교체',
};

export function BattleHud({
  character,
  items,
  model,
  portrait,
  portraitPosition = '50% 18%',
  side,
  tiles,
}: BattleHudProps) {
  const presentation = portrait ?? {
    alt: `${character.name} 기본 표정`,
    state: 'idle' as const,
  };
  const plate = createCharacterPlateModel(character, side, presentation, model);
  return (
    <section
      aria-label={`${character.name} 대전 상태`}
      className="battle-hud"
      data-character-id={plate.characterId}
      data-danger={plate.danger ? 'true' : 'false'}
      data-side={side}
      role="region"
    >
      <header className="battle-hud__header">
        <span
          className="battle-hud__portrait battle-hud__portrait--plate"
          data-portrait-state={presentation.state}
          style={{ '--portrait-position': portraitPosition } as CSSProperties}
        >
          <AssetImage alt={`${character.name} 기본 표정`} url={presentation.url} />
        </span>
        <div className="battle-hud__character-copy">
          <h2>{plate.name}</h2>
          <p>{plate.title}</p>
        </div>
        <span className="battle-hud__danger" data-testid={`${side}-top-out`}>
          {plate.danger ? '위험' : '준비'}
        </span>
      </header>

      <div className="battle-hud__next-heading">다음 블록</div>
      <ol
        aria-label={`${plate.name} 다음 블록`}
        className="battle-hud__next"
        data-testid={`${side}-next`}
      >
        {model.next.slice(0, 2).map((piece, index) => (
          <li
            aria-label={`${piece.kind} 블록`}
            data-item={piece.marker?.item ?? 'none'}
            data-kind={piece.kind}
            key={`${piece.kind}-${index}`}
          >
            <PiecePreview image={tiles?.[piece.kind]} kind={piece.kind} />
          </li>
        ))}
      </ol>

      <div aria-label={`${plate.name} 아이템`} className="battle-hud__item-ribbon">
        {(Object.keys(ITEM_LABELS) as ItemType[]).map((item) => {
          const count = item === 'row-clear'
            ? model.inventory.rowClear
            : item === 'freeze' ? model.inventory.freeze : model.inventory.queueSwap;
          return (
            <span
              className="battle-hud__item-slot"
              data-item={item}
              data-item-state={count > 0 ? 'ready' : 'empty'}
              key={item}
            >
              <AssetImage
                alt={`${ITEM_LABELS[item]} 아이템`}
                className="battle-hud__item-image"
                url={items?.[item]?.url}
              />
              <span className="battle-hud__item-label">{ITEM_LABELS[item]}</span>
            </span>
          );
        })}
      </div>

      <dl aria-hidden="true" className="battle-hud__stats">
        <div><dt>Combo</dt><dd data-testid={`${side}-combo`}>{model.combo}</dd></div>
        <div><dt>Incoming</dt><dd data-testid={`${side}-incoming`}>{model.incoming}</dd></div>
        <div><dt>Row</dt><dd data-testid={`${side}-row-clear`}>{model.inventory.rowClear}</dd></div>
        <div><dt>Freeze</dt><dd data-testid={`${side}-freeze`}>{model.inventory.freeze}</dd></div>
        <div><dt>Swap</dt><dd data-testid={`${side}-queue-swap`}>{model.inventory.queueSwap}</dd></div>
        <div><dt>Frozen</dt><dd data-testid={`${side}-freeze-ticks`}>{model.freezeTicks}</dd></div>
        <div><dt>Phase</dt><dd data-testid={`${side}-phase`}>{model.phase}</dd></div>
      </dl>
    </section>
  );
}
