import type { GameCommand, PublicSideView } from '../../core/index';
import './items.css';

export interface ItemControlsProps {
  readonly player: PublicSideView;
  readonly dispatch: (command: GameCommand) => void;
  readonly rowSelectionActive: boolean;
  readonly onRowSelectionChange: (active: boolean) => void;
}

export function ItemControls({
  dispatch,
  onRowSelectionChange,
  player,
  rowSelectionActive,
}: ItemControlsProps) {
  const controlsActive = player.phase === 'active';
  const canUseRowClear = controlsActive && player.inventory.rowClear > 0;
  const canUseFreeze = controlsActive && player.inventory.freeze > 0;
  const canUseQueueSwap = controlsActive && player.inventory.queueSwap > 0;

  return (
    <section aria-label="아이템" className="item-controls">
      <button
        aria-pressed={rowSelectionActive}
        className="item-control"
        disabled={!canUseRowClear || rowSelectionActive}
        type="button"
        onClick={() => onRowSelectionChange(true)}
      >
        행 제거 · {player.inventory.rowClear}회
      </button>
      {rowSelectionActive && (
        <button
          className="item-control item-control--cancel"
          type="button"
          onClick={() => onRowSelectionChange(false)}
        >
          행 선택 취소
        </button>
      )}
      <button
        className="item-control"
        disabled={!canUseFreeze}
        type="button"
        onClick={() => dispatch({ type: 'use-freeze' })}
      >
        상대 정지 · {player.inventory.freeze}회
      </button>
      <button
        className="item-control"
        disabled={!canUseQueueSwap}
        type="button"
        onClick={() => dispatch({ type: 'use-queue-swap' })}
      >
        다음 교환 · {player.inventory.queueSwap}회
      </button>
    </section>
  );
}
