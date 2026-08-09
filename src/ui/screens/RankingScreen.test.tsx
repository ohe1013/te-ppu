// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RankingScreen, type RankingEntry } from './RankingScreen';

const entries: readonly RankingEntry[] = [
  {
    initials: 'RVT',
    characterId: 'hero-engineer',
    score: 98_765,
    reachedFloor: 5,
    encountersWon: 15,
    owlDefeated: true,
  },
  {
    initials: 'LUM',
    characterId: 'cloud-courier',
    score: 54_321,
    reachedFloor: 4,
    encountersWon: 10,
    owlDefeated: false,
  },
];

const unlockedDifficulties = { easy: true, normal: true, hard: false } as const;

describe('RankingScreen', () => {
  it('shows difficulty tabs and TOP 20 rank, player, character, score, and reached fields', async () => {
    const user = userEvent.setup();
    const onSelectDifficulty = vi.fn();
    const onBack = vi.fn();
    render(
      <RankingScreen
        difficulty="easy"
        entries={entries}
        onBack={onBack}
        onSelectDifficulty={onSelectDifficulty}
        status="ready"
        syncPending={false}
        unlockedDifficulties={unlockedDifficulties}
      />,
    );

    expect(screen.getByTestId('ranking-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TOP 20' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Ranking difficulty' });
    expect(within(tabs).getAllByRole('tab')).toHaveLength(3);
    expect(within(tabs).getByRole('tab', { name: 'EASY' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'NORMAL' })).toBeEnabled();
    expect(within(tabs).getByRole('tab', { name: /HARD/ })).toBeDisabled();

    const table = screen.getByRole('table', { name: 'TOP 20 ranking' });
    for (const heading of ['RANK', 'INITIALS', 'CHARACTER', 'SCORE', 'REACHED']) {
      expect(within(table).getByRole('columnheader', { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText('98,765')).toBeInTheDocument();
    expect(within(table).getByText('OWL DEFEATED')).toBeInTheDocument();
    expect(within(table).getByText('FLOOR 4')).toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: 'NORMAL' }));
    await user.click(screen.getByRole('button', { name: 'BACK' }));
    expect(onSelectDifficulty).toHaveBeenCalledWith('normal');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('distinguishes local fallback, loading, unavailable, empty, and sync-pending states', () => {
    const view = render(
      <RankingScreen
        difficulty="easy"
        entries={entries.slice(0, 1)}
        onBack={() => undefined}
        onSelectDifficulty={() => undefined}
        status="local"
        syncPending
        unlockedDifficulties={unlockedDifficulties}
      />,
    );

    expect(screen.getByText('LOCAL RESULTS')).toBeInTheDocument();
    expect(screen.getByText('SCORE SYNC PENDING')).toBeInTheDocument();

    view.rerender(
      <RankingScreen
        difficulty="easy"
        entries={[]}
        onBack={() => undefined}
        onSelectDifficulty={() => undefined}
        status="loading"
        syncPending={false}
        unlockedDifficulties={unlockedDifficulties}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('LOADING RANKING');

    view.rerender(
      <RankingScreen
        difficulty="easy"
        entries={[]}
        onBack={() => undefined}
        onSelectDifficulty={() => undefined}
        status="unavailable"
        syncPending={false}
        unlockedDifficulties={unlockedDifficulties}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('RANKING UNAVAILABLE');

    view.rerender(
      <RankingScreen
        difficulty="easy"
        entries={[]}
        onBack={() => undefined}
        onSelectDifficulty={() => undefined}
        status="ready"
        syncPending={false}
        unlockedDifficulties={unlockedDifficulties}
      />,
    );
    expect(screen.getByText('NO SCORES YET')).toBeInTheDocument();
  });
});
