import { useEffect } from 'react';
import type { ItemType } from '../../core/index';
import type { GameCommand, PublicSideView } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import { AssetImage } from './AssetImage';
import './items.css';

export interface ItemControlsProps {
  readonly player: PublicSideView;
  readonly dispatch: (command: GameCommand) => void;
  readonly rowSelectionActive: boolean;
  /**
   * Controls row-selection mode. When this receives `false` for explicit
   * cancel or eligibility loss, the parent must also clear its selected row.
   */
  readonly onRowSelectionChange: (active: boolean) => void;
  readonly items?: Partial<Record<ItemType, LoadedImageRef>>;
}

const ITEM_LABELS: Readonly<Record<ItemType, string>> = {
  'row-clear': '행 제거',
  freeze: '빙결',
  'queue-swap': '교체',
};

export function ItemControls({
  dispatch,
  onRowSelectionChange,
  player,
  rowSelectionActive,
  items,
}: ItemControlsProps) {
  const controlsActive = player.phase === 'active';
  const canUseRowClear = controlsActive && player.inventory.rowClear > 0;
  const canUseFreeze = controlsActive && player.inventory.freeze > 0;
  const canUseQueueSwap = controlsActive && player.inventory.queueSwap > 0;

  useEffect(() => {
    if (rowSelectionActive && !canUseRowClear) {
      onRowSelectionChange(false);
    }
  }, [canUseRowClear, onRowSelectionChange, rowSelectionActive]);

  return (
    <section aria-label="아이템" className="item-controls">
      {rowSelectionActive ? (
        <button
          aria-label="취소"
          className="item-control item-control--cancel"
          type="button"
          onClick={() => onRowSelectionChange(false)}
        >
          <span className="item-control__label">취소</span>
        </button>
      ) : (
        <button
          aria-label={`행 제거 · ${player.inventory.rowClear}회`}
          aria-pressed={false}
          className="item-control"
          data-item="row-clear"
          disabled={!canUseRowClear}
          type="button"
          onClick={() => onRowSelectionChange(true)}
        >
          <AssetImage
            alt="행 제거 아이템"
            className="item-control__image"
            url={items?.['row-clear']?.url}
          />
          <span className="item-control__label">{ITEM_LABELS['row-clear']}</span>
          <span aria-hidden="true" className="item-control__count">{player.inventory.rowClear}회</span>
        </button>
      )}
      <button
        aria-label={`빙결 · ${player.inventory.freeze}회`}
        className="item-control"
        data-item="freeze"
        disabled={!canUseFreeze}
        type="button"
        onClick={() => dispatch({ type: 'use-freeze' })}
      >
        <AssetImage
          alt="빙결 아이템"
          className="item-control__image"
          url={items?.freeze?.url}
        />
        <span className="item-control__label">{ITEM_LABELS.freeze}</span>
        <span aria-hidden="true" className="item-control__count">{player.inventory.freeze}회</span>
      </button>
      <button
        aria-label={`교체 · ${player.inventory.queueSwap}회`}
        className="item-control"
        data-item="queue-swap"
        disabled={!canUseQueueSwap}
        type="button"
        onClick={() => dispatch({ type: 'use-queue-swap' })}
      >
        <AssetImage
          alt="교체 아이템"
          className="item-control__image"
          url={items?.['queue-swap']?.url}
        />
        <span className="item-control__label">{ITEM_LABELS['queue-swap']}</span>
        <span aria-hidden="true" className="item-control__count">{player.inventory.queueSwap}회</span>
      </button>
    </section>
  );
}
