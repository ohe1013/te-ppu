// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LoadedImageRef } from '../../assets';
import { ScreenBackdrop } from './ScreenBackdrop';

function image(url: string, generation = 1): LoadedImageRef {
  return { generation, ref: { path: url }, source: new Image(), url };
}

describe('ScreenBackdrop', () => {
  it('retries a new resolved reference after the previous backdrop fails', () => {
    const result = render(<ScreenBackdrop image={image('a.webp')} />);
    fireEvent.error(result.container.querySelector('img')!);
    expect(result.container.querySelector('img')).toBeNull();

    result.rerender(<ScreenBackdrop image={image('a.webp')} />);
    expect(result.container.querySelector('img')).toBeNull();
    result.rerender(<ScreenBackdrop image={image('b.webp', 2)} />);
    expect(result.container.querySelector('img')).toHaveAttribute('src', 'b.webp');
  });
});
