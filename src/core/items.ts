import {
  type AppearedItems,
  type GameEvent,
  type Inventory,
  type ItemType,
  type PieceToken,
  type SideId,
  type SideState,
} from './model';
import { canPlace, deleteVisibleRow } from './board';
import { cellsFor, pieceKindAt } from './pieces';
import { counterU32, randomInt, RandomStream } from './random';

const ITEM_TYPES: readonly ItemType[] = ['row-clear', 'freeze', 'queue-swap'];
const ITEM_ROLL_THRESHOLD = Math.floor(0.15 * 0x1_0000_0000);

export type ItemAction = {
  readonly state: SideState;
  readonly outgoingAttack: number;
  readonly events: readonly GameEvent[];
};

function unused(state: SideState): ItemAction {
  return { state, outgoingAttack: 0, events: [] };
}

function itemEvent(
  side: SideId,
  type: GameEvent['type'],
  item?: ItemType,
  row?: number,
): GameEvent {
  return {
    type,
    side,
    ...(item === undefined ? {} : { item }),
    ...(row === undefined ? {} : { row }),
  };
}

export function resolveNormalClear(
  previousCombo: number,
  clearedLines: number,
): { readonly combo: number; readonly attack: number } {
  if (clearedLines === 0) return { combo: 0, attack: 0 };

  const combo = previousCombo + 1;
  return { combo, attack: clearedLines + Math.max(0, combo - 1) };
}

export function makePieceToken(
  seed: number,
  serial: number,
  appeared: AppearedItems,
): { readonly token: PieceToken; readonly appeared: AppearedItems } {
  const unseen = ITEM_TYPES.filter((item) => !appeared[item]);
  if (
    unseen.length === 0
    || counterU32(seed, RandomStream.ITEM, serial, 0) >= ITEM_ROLL_THRESHOLD
  ) {
    return {
      token: { serial, kind: pieceKindAt(seed, serial), marker: null },
      appeared,
    };
  }

  const item = unseen[randomInt(seed, RandomStream.ITEM, serial, unseen.length, 1)]!;
  const token: PieceToken = {
    serial,
    kind: pieceKindAt(seed, serial),
    marker: {
      item,
      minoIndex: randomInt(seed, RandomStream.ITEM, serial, 4, 2),
    },
  };

  return { token, appeared: { ...appeared, [item]: true } };
}

export function acquireMarkers(
  inventory: Inventory,
  markers: readonly ItemType[],
): Inventory {
  let rowClear = inventory.rowClear;
  let freeze = inventory.freeze;
  let queueSwap = inventory.queueSwap;

  for (const marker of markers) {
    if (marker === 'row-clear') rowClear += 1;
    else if (marker === 'freeze') freeze += 1;
    else queueSwap += 3;
  }

  return { rowClear, freeze, queueSwap };
}

export function useRowClear(
  state: SideState,
  visibleRow: number,
  side: SideId,
): ItemAction {
  if (state.phase !== 'active' || state.inventory.rowClear <= 0) return unused(state);

  const deletion = deleteVisibleRow(state.board, visibleRow);
  if (!deletion.deleted) return unused(state);

  const acquired = acquireMarkers(state.inventory, deletion.markers);
  const inventory: Inventory = { ...acquired, rowClear: acquired.rowClear - 1 };
  const events: GameEvent[] = [
    ...deletion.markers.map((item) => itemEvent(side, 'item-acquired', item)),
    itemEvent(side, 'item-used', 'row-clear', visibleRow),
  ];

  let active = state.active;
  if (active !== null && !canPlace(deletion.board, active)) {
    const maximumLift = Math.min(...cellsFor(active).map(({ y }) => y));
    active = null;
    for (let lift = 1; lift <= maximumLift; lift += 1) {
      const candidate = { ...state.active!, y: state.active!.y - lift };
      if (canPlace(deletion.board, candidate)) {
        active = candidate;
        break;
      }
    }
  }

  if (state.active !== null && active === null) {
    return {
      state: {
        ...state,
        board: deletion.board,
        active: null,
        inventory,
        phase: 'top-out',
        topOut: true,
      },
      outgoingAttack: 1,
      events: [...events, itemEvent(side, 'top-out')],
    };
  }

  return {
    state: { ...state, board: deletion.board, active, inventory },
    outgoingAttack: 1,
    events,
  };
}

export function useQueueSwap(state: SideState, side: SideId): ItemAction {
  if (state.phase !== 'active' || state.inventory.queueSwap <= 0) return unused(state);

  return {
    state: {
      ...state,
      next: [state.next[1], state.next[0]],
      inventory: { ...state.inventory, queueSwap: state.inventory.queueSwap - 1 },
    },
    outgoingAttack: 0,
    events: [itemEvent(side, 'item-used', 'queue-swap')],
  };
}
