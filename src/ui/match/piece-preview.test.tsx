// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedImageRef } from '../../assets';
import type { PieceKind } from '../../core';
import * as previewModule from './piece-preview';
import { PiecePreview } from './piece-preview';

afterEach(cleanup);

interface NormalizedPreviewShape {
  readonly cells: readonly (readonly [number, number])[];
  readonly width: number;
  readonly height: number;
}

const EXPECTED_SHAPES: Readonly<Record<PieceKind, NormalizedPreviewShape>> = {
  I: { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], width: 1, height: 4 },
  J: { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], width: 3, height: 2 },
  L: { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], width: 3, height: 2 },
  O: { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], width: 2, height: 2 },
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], width: 3, height: 2 },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], width: 3, height: 2 },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], width: 3, height: 2 },
};

function normalize(kind: PieceKind): NormalizedPreviewShape {
  expect(previewModule).toHaveProperty('normalizePreviewCells');
  const moduleWithNormalizer = previewModule as typeof previewModule & {
    normalizePreviewCells(pieceKind: PieceKind): NormalizedPreviewShape;
  };
  return moduleWithNormalizer.normalizePreviewCells(kind);
}

describe('PiecePreview', () => {
  it.each(Object.entries(EXPECTED_SHAPES) as [PieceKind, NormalizedPreviewShape][])(
    'normalizes %s to four literal cells in its tight bounds',
    (kind, expected) => {
      expect(normalize(kind)).toEqual(expected);
    },
  );

  it('renders four centered tile cells without visible kind text or a full-card image', () => {
    const tile = { url: '/tiles/L.webp' } as LoadedImageRef;
    render(<PiecePreview image={tile} kind="L" />);

    const preview = screen.getByRole('img', { name: /^L / });
    expect(preview).toHaveAttribute('data-piece-kind', 'L');
    expect(preview).toHaveAttribute('data-shape-width', '3');
    expect(preview).toHaveAttribute('data-shape-height', '2');
    expect(preview).toHaveTextContent('');

    const grid = preview.querySelector('[data-piece-grid]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({
      gridTemplateColumns: 'repeat(3, var(--piece-preview-cell-size))',
      gridTemplateRows: 'repeat(2, var(--piece-preview-cell-size))',
    });
    const cells = within(preview).getAllByTestId('piece-preview-cell');
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      expect(cell.querySelector('img')).toHaveAttribute('src', '/tiles/L.webp');
    }
    expect(preview.querySelector(':scope > img')).toBeNull();
  });

  it('keeps four deterministic fallback cells when no tile image is available', () => {
    render(<PiecePreview kind="O" />);

    const preview = screen.getByRole('img', { name: /^O / });
    expect(preview.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
    expect(preview.querySelector('img')).toBeNull();
    expect(preview).toHaveTextContent('');
  });
});
