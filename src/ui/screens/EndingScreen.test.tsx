// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EndingScreen } from './EndingScreen';

afterEach(cleanup);

describe('EndingScreen', () => {
  it('points to the next unlocked difficulty after an owl victory', () => {
    render(
      <EndingScreen
        difficulty="easy"
        onReturnToTower={vi.fn()}
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
        unlockedDifficulties={{ easy: true, normal: true, hard: true }}
      />,
    );

    expect(screen.getByTestId('ending-screen')).toHaveAttribute('data-next-difficulty', 'none');
    expect(screen.queryByText(/선택하러 가기/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '타워로 돌아가기' })).toBeInTheDocument();
  });
});
