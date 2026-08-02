import type { PublicSideView, SideId } from '../../core/index';

export interface BattleHudProps {
  readonly label: string;
  readonly model: PublicSideView;
  readonly side: SideId;
}

export function BattleHud({ label, model, side }: BattleHudProps) {
  return (
    <section
      aria-label={`${label} battle status`}
      className="battle-hud"
      data-side={side}
      role="region"
    >
      <header className="battle-hud__header">
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
            {piece.kind}
          </li>
        ))}
      </ol>

      <dl className="battle-hud__stats">
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
