// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LoadedImageRef } from '../../assets';
import { AssetIcon } from './AssetIcon';

function image(url: string, generation = 1): LoadedImageRef {
  return { generation, ref: { path: url }, source: new Image(), url };
}

describe('AssetIcon', () => {
  it('retries a changed URL and keeps the containing button name when artwork is absent or broken', () => {
    const result = render(<button aria-label="Rotate"><AssetIcon fallback="↻" image={image('a.svg')} /></button>);
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeInTheDocument();
    fireEvent.error(result.container.querySelector('img')!);
    expect(result.container.querySelector('img')).toBeNull();

    result.rerender(<button aria-label="Rotate"><AssetIcon fallback="↻" image={image('a.svg')} /></button>);
    expect(result.container.querySelector('img')).toBeNull();
    result.rerender(<button aria-label="Rotate"><AssetIcon fallback="↻" image={image('b.svg', 2)} /></button>);
    expect(result.container.querySelector('img')).toHaveAttribute('src', 'b.svg');
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeInTheDocument();
  });
});
