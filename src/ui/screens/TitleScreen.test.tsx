// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cloneProgressState, DEFAULT_PROGRESS } from '../../progression';
import { TitleScreen } from './TitleScreen';

describe('TitleScreen', () => {
  it('shows brand, owl, player summary, and exactly three primary actions', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(DEFAULT_PROGRESS);
    progress.profile = { initials: 'RVT', characterId: 'hero-engineer' };
    progress.localBestScores.easy = {
      schemaVersion: 1,
      initials: 'RVT',
      characterId: 'hero-engineer',
      difficulty: 'easy',
      score: 12_340,
      durationTicks: 3_000,
      reachedFloor: 3,
      encountersWon: 7,
      owlDefeated: false,
      achievedAt: '2026-08-10T00:00:00.000Z',
    };
    const onStartRun = vi.fn();
    const onOpenRanking = vi.fn();
    const onChangePlayer = vi.fn();

    render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={onChangePlayer}
        onOpenRanking={onOpenRanking}
        onStartRun={onStartRun}
        progress={progress}
      />,
    );

    expect(screen.getByTestId('title-screen')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gearlight Tower logo' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Starlight owl guide' })).toBeInTheDocument();
    expect(screen.getByText('RVT')).toBeInTheDocument();
    expect(screen.getByText('EASY')).toBeInTheDocument();
    expect(screen.getByText('12,340')).toBeInTheDocument();

    const actions = screen.getByRole('navigation', { name: 'Primary actions' });
    expect(within(actions).getAllByRole('button')).toHaveLength(3);
    await user.click(within(actions).getByRole('button', { name: 'START RUN' }));
    await user.click(within(actions).getByRole('button', { name: 'RANKING' }));
    await user.click(within(actions).getByRole('button', { name: 'PLAYER CHANGE' }));
    expect(onStartRun).toHaveBeenCalledOnce();
    expect(onOpenRanking).toHaveBeenCalledOnce();
    expect(onChangePlayer).toHaveBeenCalledOnce();
  });

  it('presents a first player without inventing a profile or score', () => {
    render(
      <TitleScreen
        commonAssets={null}
        notice="Offline progress loaded."
        onChangePlayer={() => undefined}
        onOpenRanking={() => undefined}
        onStartRun={() => undefined}
        progress={DEFAULT_PROGRESS}
      />,
    );

    expect(screen.getByText('NEW PLAYER')).toBeInTheDocument();
    expect(screen.getByText('NO LOCAL SCORE')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Offline progress loaded.');
  });
});
