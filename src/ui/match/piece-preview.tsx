import type { PieceKind } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import { AssetImage } from './AssetImage';

export const PIECE_PREVIEW_CELLS: Readonly<Record<PieceKind, readonly [number, number][]>> = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

export interface PiecePreviewProps {
  readonly image?: LoadedImageRef;
  readonly kind: PieceKind;
}

export function PiecePreview({ image, kind }: PiecePreviewProps) {
  return (
    <span
      aria-label={`${kind} 블록`}
      className="battle-hud__piece-preview"
      data-piece-preview
      data-piece-kind={kind}
      role="img"
    >
      {image?.url ? (
        <AssetImage
          alt=""
          className="battle-hud__next-image"
          url={image.url}
        />
      ) : null}
      <span aria-hidden="true" className="battle-hud__piece-grid">
        {PIECE_PREVIEW_CELLS[kind].map(([column, row], index) => (
          <span
            aria-hidden="true"
            className="battle-hud__piece-cell"
            data-piece-cell
            key={`${column}-${row}-${index}`}
            style={{ gridColumn: column + 1, gridRow: row + 1 }}
          />
        ))}
      </span>
      <span aria-hidden="true" className="battle-hud__piece-label">{kind}</span>
    </span>
  );
}
