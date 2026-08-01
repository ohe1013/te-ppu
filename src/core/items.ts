import {
  type AppearedItems,
  type Inventory,
  type ItemType,
  type PieceToken,
} from './model';
import { pieceKindAt } from './pieces';
import { counterU32, randomInt, RandomStream } from './random';

const ITEM_TYPES: readonly ItemType[] = ['row-clear', 'freeze', 'queue-swap'];
const ITEM_ROLL_THRESHOLD = Math.floor(0.15 * 0x1_0000_0000);

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
