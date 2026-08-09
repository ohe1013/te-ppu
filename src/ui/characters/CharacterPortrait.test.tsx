// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedImageRef } from '../../assets';
import { CharacterPortrait } from './CharacterPortrait';

afterEach(cleanup);

const image = { url: '/assets/rival-idle.webp' } as LoadedImageRef;

describe('CharacterPortrait', () => {
  it('renders the supplied image and state', () => {
    render(<CharacterPortrait alt="프리즘 idle" image={image} state="idle" />);

    expect(screen.getByRole('img', { name: '프리즘 idle' })).toHaveAttribute(
      'src',
      '/assets/rival-idle.webp',
    );
    expect(screen.getByTestId('character-portrait')).toHaveAttribute(
      'data-portrait-state',
      'idle',
    );
  });

  it('keeps a visible accessible fallback when the image is absent', () => {
    render(<CharacterPortrait alt="프리즘 hit" state="hit" />);

    expect(screen.getByRole('img', { name: '프리즘 hit' })).toBeInTheDocument();
    expect(screen.getByTestId('character-portrait')).toHaveAttribute(
      'data-portrait-state',
      'hit',
    );
  });
});
