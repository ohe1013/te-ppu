export type ArcadeDirection = 'up' | 'down' | 'left' | 'right';

export type NameKey =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'
  | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
  | 'S' | 'T' | 'U' | 'V' | 'W' | 'X'
  | 'Y' | 'Z' | 'DEL' | 'END';

export interface NameKeyLayout {
  readonly key: NameKey;
  readonly columnStart: number;
  readonly columnEnd: number;
}

export const NAME_KEY_ROWS: readonly (readonly NameKeyLayout[])[] = [
  ['A', 'B', 'C', 'D', 'E', 'F'].map((key, column) => ({
    key: key as NameKey,
    columnStart: column,
    columnEnd: column,
  })),
  ['G', 'H', 'I', 'J', 'K', 'L'].map((key, column) => ({
    key: key as NameKey,
    columnStart: column,
    columnEnd: column,
  })),
  ['M', 'N', 'O', 'P', 'Q', 'R'].map((key, column) => ({
    key: key as NameKey,
    columnStart: column,
    columnEnd: column,
  })),
  ['S', 'T', 'U', 'V', 'W', 'X'].map((key, column) => ({
    key: key as NameKey,
    columnStart: column,
    columnEnd: column,
  })),
  [
    { key: 'Y', columnStart: 0, columnEnd: 0 },
    { key: 'Z', columnStart: 1, columnEnd: 1 },
    { key: 'DEL', columnStart: 2, columnEnd: 3 },
    { key: 'END', columnStart: 4, columnEnd: 5 },
  ],
] as const;

function findKey(key: NameKey): { readonly row: number; readonly index: number; readonly layout: NameKeyLayout } {
  for (const [row, layouts] of NAME_KEY_ROWS.entries()) {
    const index = layouts.findIndex((layout) => layout.key === key);
    const layout = layouts[index];
    if (layout !== undefined) return { row, index, layout };
  }
  throw new Error(`Unknown name key: ${key}`);
}

function center(layout: NameKeyLayout): number {
  return (layout.columnStart + layout.columnEnd) / 2;
}

export function moveNameKey(key: NameKey, direction: ArcadeDirection): NameKey {
  const current = findKey(key);
  if (direction === 'left' || direction === 'right') {
    const offset = direction === 'left' ? -1 : 1;
    return NAME_KEY_ROWS[current.row]?.[current.index + offset]?.key ?? key;
  }

  const rowOffset = direction === 'up' ? -1 : 1;
  const destinationRow = NAME_KEY_ROWS[current.row + rowOffset];
  if (destinationRow === undefined) return key;

  const sourceCenter = center(current.layout);
  return destinationRow.reduce((nearest, candidate) => (
    Math.abs(center(candidate) - sourceCenter) < Math.abs(center(nearest) - sourceCenter)
      ? candidate
      : nearest
  )).key;
}
