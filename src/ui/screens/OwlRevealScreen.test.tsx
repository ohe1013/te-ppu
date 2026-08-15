// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommonAssets } from '../../assets';
import { OwlRevealScreen } from './OwlRevealScreen';

afterEach(cleanup);

const commonAssets = {
  owl: {
    fullArt: { url: '/owl.webp' },
    portraits: {},
  },
} as unknown as CommonAssets;

describe('OwlRevealScreen', () => {
  it('reveals the owl architect and starts the hidden boss fight', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <OwlRevealScreen
        commonAssets={commonAssets}
        difficulty="easy"
        onBack={vi.fn()}
        onStart={onStart}
      />,
    );

    expect(screen.getByTestId('owl-reveal-screen')).toHaveTextContent('탑의 설계자');
    expect(screen.getByRole('img', { name: '탑의 설계자' })).toHaveAttribute(
      'src',
      '/owl.webp',
    );
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
