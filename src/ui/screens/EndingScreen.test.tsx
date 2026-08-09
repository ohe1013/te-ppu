// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerCharacterAssets } from '../../assets';
import type { PlayerCharacterDefinition } from '../../player';
import { EndingScreen } from './EndingScreen';

afterEach(cleanup);

const player = {
  id: 'star-alchemist',
  name: '세라',
  role: '별가루 연금술사',
  title: '빛의 추적자',
  story: '도난당한 동력핵의 빛을 추적한다.',
  palette: ['#8c5bd9', '#ff76aa', '#dce4ef'],
} satisfies PlayerCharacterDefinition;

const playerAssets = {
  fullArt: { url: '/star-alchemist-full.webp' },
  portraits: { win: { url: '/star-alchemist-win.webp' } },
} as PlayerCharacterAssets;

describe('EndingScreen', () => {
  it('points to the next unlocked difficulty after an owl victory', () => {
    render(
      <EndingScreen
        difficulty="easy"
        onReturnToTower={vi.fn()}
        player={player}
        playerAssets={playerAssets}
        unlockedDifficulties={{ easy: true, normal: true, hard: false }}
      />,
    );

    expect(screen.getByTestId('ending-screen')).toHaveAttribute('data-next-difficulty', 'normal');
    expect(screen.getByText('NORMAL 난이도 해금')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NORMAL 선택하러 가기' })).toBeInTheDocument();
  });

  it('does not offer a fourth difficulty after hard', () => {
    render(
      <EndingScreen
        difficulty="hard"
        onReturnToTower={vi.fn()}
        player={player}
        playerAssets={playerAssets}
        unlockedDifficulties={{ easy: true, normal: true, hard: true }}
      />,
    );

    expect(screen.getByTestId('ending-screen')).toHaveAttribute('data-next-difficulty', 'none');
    expect(screen.queryByText(/선택하러 가기/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '타워로 돌아가기' })).toBeInTheDocument();
  });

  it('uses the selected player full art, identity, and win portrait', () => {
    render(
      <EndingScreen
        difficulty="easy"
        onReturnToTower={vi.fn()}
        player={player}
        playerAssets={playerAssets}
        unlockedDifficulties={{ easy: true, normal: true, hard: false }}
      />,
    );

    const selectedPlayer = screen.getByRole('group', { name: '세라 ending identity' });
    expect(selectedPlayer).toHaveAttribute('data-character-id', 'star-alchemist');
    expect(selectedPlayer).toHaveTextContent('빛의 추적자');
    expect(screen.getByAltText('세라 ending full illustration')).toHaveAttribute(
      'src',
      '/star-alchemist-full.webp',
    );
    expect(screen.getByAltText('세라 win portrait')).toHaveAttribute(
      'src',
      '/star-alchemist-win.webp',
    );
  });
});
