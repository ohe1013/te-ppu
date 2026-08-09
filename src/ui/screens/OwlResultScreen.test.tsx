// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommonAssets, PlayerCharacterAssets } from '../../assets';
import type { PlayerCharacterDefinition } from '../../player';
import { OwlResultScreen } from './OwlResultScreen';

afterEach(cleanup);

const player = {
  id: 'cloud-courier',
  name: '루미',
  role: '구름 우편기사',
  title: '바람길의 전령',
  story: '멈춘 바람길을 되찾는다.',
  palette: ['#4d8fff', '#ffd84d', '#f8fbff'],
} satisfies PlayerCharacterDefinition;

const playerAssets = {
  fullArt: { url: '/cloud-courier-full.webp' },
  portraits: {
    idle: { url: '/cloud-courier-idle.webp' },
    win: { url: '/cloud-courier-win.webp' },
    loss: { url: '/cloud-courier-loss.webp' },
  },
} as PlayerCharacterAssets;

const commonAssets = {
  owl: { fullArt: { url: '/owl-full.webp' }, portraits: {} },
} as CommonAssets;

describe('OwlResultScreen', () => {
  it.each([
    ['win', 'win', '/cloud-courier-win.webp'],
    ['loss', 'loss', '/cloud-courier-loss.webp'],
    ['draw', 'idle', '/cloud-courier-idle.webp'],
  ] as const)('keeps the selected player visible for an owl %s', (
    result,
    portraitState,
    portraitUrl,
  ) => {
    render(
      <OwlResultScreen
        commonAssets={commonAssets}
        onContinue={vi.fn()}
        player={player}
        playerAssets={playerAssets}
        result={result}
      />,
    );

    const selectedPlayer = screen.getByRole('group', { name: '루미 owl result identity' });
    expect(selectedPlayer).toHaveAttribute('data-character-id', 'cloud-courier');
    expect(selectedPlayer).toHaveTextContent('바람길의 전령');
    expect(screen.getByAltText('루미 owl result full illustration')).toHaveAttribute(
      'src',
      '/cloud-courier-full.webp',
    );
    expect(screen.getByAltText(`루미 ${portraitState} portrait`)).toHaveAttribute(
      'src',
      portraitUrl,
    );
  });
});
