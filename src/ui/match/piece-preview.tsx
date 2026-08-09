import type { PieceKind } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import { AssetImage } from './AssetImage';

type PreviewCoordinate = readonly [column: number, row: number];
type PreviewCells = readonly [
  PreviewCoordinate,
  PreviewCoordinate,
  PreviewCoordinate,
  PreviewCoordinate,
];

export const PIECE_PREVIEW_CELLS: Readonly<Record<PieceKind, PreviewCells>> = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

export interface NormalizedPreviewShape {
  readonly cells: PreviewCells;
  readonly width: number;
  readonly height: number;
}

export function normalizePreviewCells(kind: PieceKind): NormalizedPreviewShape {
  const source = PIECE_PREVIEW_CELLS[kind];
  const minimumColumn = Math.min(...source.map(([column]) => column));
  const minimumRow = Math.min(...source.map(([, row]) => row));
  const cells = source.map(([column, row]) => (
    [column - minimumColumn, row - minimumRow] as const
  )) as unknown as PreviewCells;
  return {
    cells,
    width: Math.max(...cells.map(([column]) => column)) + 1,
    height: Math.max(...cells.map(([, row]) => row)) + 1,
  };
}

export interface PiecePreviewProps {
  readonly image?: LoadedImageRef;
  readonly kind: PieceKind;
}

export function PiecePreview({ image, kind }: PiecePreviewProps) {
  const shape = normalizePreviewCells(kind);
  return (
    <span
      aria-label={`${kind} 블록`}
      className="battle-hud__piece-preview"
      data-piece-preview
      data-piece-kind={kind}
      data-shape-height={shape.height}
      data-shape-width={shape.width}
      role="img"
    >
      <span
        aria-hidden="true"
        className="battle-hud__piece-grid"
        data-piece-grid
        style={{
          gridTemplateColumns: `repeat(${shape.width}, var(--piece-preview-cell-size))`,
          gridTemplateRows: `repeat(${shape.height}, var(--piece-preview-cell-size))`,
        }}
      >
        {shape.cells.map(([column, row], index) => (
          <span
            aria-hidden="true"
            className="battle-hud__piece-cell"
            data-piece-cell
            data-testid="piece-preview-cell"
            key={`${column}-${row}-${index}`}
            style={{ gridColumn: column + 1, gridRow: row + 1 }}
          >
            {image?.url ? (
              <AssetImage
                alt=""
                className="battle-hud__next-image"
                url={image.url}
              />
            ) : null}
          </span>
        ))}
      </span>
    </span>
  );
}
