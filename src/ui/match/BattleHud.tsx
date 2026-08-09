import type { ItemType, PieceKind, PublicSideView, SideId } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
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
  readonly side: SideId;
  readonly tiles?: Partial<Record<PieceKind, LoadedImageRef>>;
  readonly items?: Partial<Record<ItemType, LoadedImageRef>>;
}

const ITEM_LABELS: Readonly<Record<ItemType, string>> = {
  'row-clear': 'ROW',
  freeze: 'FREEZE',
  'queue-swap': 'SWAP',
};

export function BattleHud({ character, items, model, portrait, side, tiles }: BattleHudProps) {
  const presentation = portrait ?? {
    alt: `${character.name} idle portrait`,
    state: 'idle' as const,
  };
  const plate = createCharacterPlateModel(character, side, presentation, model);
  return (
    <section
      aria-label={`${character.name} battle status`}
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
        >
          <AssetImage alt={presentation.alt} url={presentation.url} />
        </span>
        <div className="battle-hud__character-copy">
          <h2>{plate.name}</h2>
          <p>{plate.title}</p>
        </div>
        <span className="battle-hud__danger" data-testid={`${side}-top-out`}>
          {plate.danger ? 'DANGER' : 'READY'}
        </span>
      </header>

      <div className="battle-hud__next-heading">NEXT</div>
      <ol
        aria-label={`${plate.name} next pieces`}
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

      <div aria-label={`${plate.name} item slots`} className="battle-hud__item-ribbon">
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
                alt={`${ITEM_LABELS[item]} item`}
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
