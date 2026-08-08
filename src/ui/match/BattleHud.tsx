import type { ItemType, PieceKind, PublicSideView, SideId } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import { AssetImage } from './AssetImage';
import type { PortraitPresentation } from './portrait-state';

export interface BattleHudProps {
  readonly label: string;
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

export function BattleHud({ items, label, model, portrait, side, tiles }: BattleHudProps) {
  const presentation = portrait ?? {
    alt: `${label} idle portrait`,
    state: 'idle' as const,
  };
  return (
    <section
      aria-label={`${label} battle status`}
      className="battle-hud"
      data-side={side}
      role="region"
    >
      <header className="battle-hud__header">
        <span
          className="battle-hud__portrait"
          data-portrait-state={presentation.state}
        >
          <AssetImage alt={presentation.alt} url={presentation.url} />
        </span>
        <h2>{label}</h2>
        <span data-testid={`${side}-top-out`}>
          {model.topOut ? 'TOP OUT' : 'READY'}
        </span>
      </header>

      <ol
        aria-label={`${label} next pieces`}
        className="battle-hud__next"
        data-testid={`${side}-next`}
      >
        {model.next.map((piece, index) => (
          <li
            data-item={piece.marker?.item ?? 'none'}
            data-kind={piece.kind}
            key={`${piece.kind}-${index}`}
          >
            <AssetImage
              alt={`${piece.kind} block`}
              className="battle-hud__next-image"
              url={tiles?.[piece.kind]?.url}
            />
            <span className="battle-hud__next-label">{piece.kind}</span>
          </li>
        ))}
      </ol>

      <div aria-label={`${label} item slots`} className="battle-hud__item-ribbon">
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
