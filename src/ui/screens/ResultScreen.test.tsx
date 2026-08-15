// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerCharacterAssets, RivalCharacterAssets } from '../../assets';
import type { PlayerCharacterDefinition } from '../../player';
import { cloneProgressState, DEFAULT_PROGRESS, getFloorEncounter } from '../../progression';
import { ResultScreen } from './ResultScreen';

afterEach(cleanup);

const progress = cloneProgressState(DEFAULT_PROGRESS);
progress.difficultyProgress.easy = {
  highestUnlockedFloor: 5,
  clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
  owlDefeated: false,
};

const rival = {
  portraits: {
    idle: { url: '/idle.webp' },
    defeat: { url: '/defeat.webp' },
    smug: { url: '/smug.webp' },
  },
} as RivalCharacterAssets;

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
  portraits: {
    idle: { url: '/star-alchemist-idle.webp' },
    win: { url: '/star-alchemist-win.webp' },
    loss: { url: '/star-alchemist-loss.webp' },
  },
} as PlayerCharacterAssets;

function renderResult(floor: 1 | 5, seriesComplete: boolean) {
  return render(
    <ResultScreen
      encounter={getFloorEncounter(floor, 2)}
      floor={floor}
      onContinue={vi.fn()}
      onRetrySave={vi.fn()}
      player={player}
      playerAssets={playerAssets}
      progress={progress}
      result="win"
      rival={rival}
      saveFailed={false}
      savePending={false}
      saveRetrying={false}
      score={5_000}
      series={{ floor, encounterIndex: 2, wins: 2 }}
      seriesComplete={seriesComplete}
    />,
  );
}

describe('ResultScreen', () => {
  it('names the next rival for an intermediate win', () => {
    renderResult(1, false);

    expect(screen.getByText('다음 상대')).toBeInTheDocument();
    expect(screen.getByText('층 승리 3/3 · 최고 해금 5층')).toBeInTheDocument();
    expect(screen.getByText('돌 틈 사이로 별빛이 새어 나온다.')).toBeInTheDocument();
  });

  it('uses the tower action after the final floor series', () => {
    renderResult(5, true);

    expect(screen.getByRole('button', { name: '탑으로' })).toBeInTheDocument();
    expect(screen.getByTestId('result-screen')).toHaveAttribute('data-series-complete', 'true');
  });

  it.each([
    ['win', 'win', '/star-alchemist-win.webp'],
    ['loss', 'loss', '/star-alchemist-loss.webp'],
    ['draw', 'idle', '/star-alchemist-idle.webp'],
  ] as const)('shows the selected player %s result portrait and full art', (
    result,
    portraitState,
    portraitUrl,
  ) => {
    render(
      <ResultScreen
        encounter={getFloorEncounter(1, 0)}
        floor={1}
        onContinue={vi.fn()}
        onRetrySave={vi.fn()}
        player={player}
        playerAssets={playerAssets}
        progress={progress}
        result={result}
        rival={rival}
        saveFailed={false}
        savePending={false}
        saveRetrying={false}
        score={1_250}
        series={{ floor: 1, encounterIndex: 0, wins: 0 }}
        seriesComplete={false}
      />,
    );

    const selectedPlayer = screen.getByRole('group', { name: '세라 result identity' });
    expect(selectedPlayer).toHaveAttribute('data-character-id', 'star-alchemist');
    expect(selectedPlayer).toHaveTextContent('빛의 추적자');
    expect(screen.getByAltText('세라 result full illustration')).toHaveAttribute(
      'src',
      '/star-alchemist-full.webp',
    );
    expect(screen.getByAltText(`세라 ${portraitState} portrait`)).toHaveAttribute(
      'src',
      portraitUrl,
    );
  });

  it.each(['loss', 'draw'] as const)(
    'ends a ranked run after a %s, shows its score, and removes same-run retry',
    (result) => {
      render(
        <ResultScreen
          encounter={getFloorEncounter(1, 0)}
          floor={1}
          onContinue={vi.fn()}
          onRetrySave={vi.fn()}
          player={player}
          playerAssets={playerAssets}
          progress={progress}
          result={result}
          rival={rival}
          saveFailed={false}
          savePending={false}
          saveRetrying={false}
          score={1_250}
          series={{ floor: 1, encounterIndex: 0, wins: 0 }}
          seriesComplete={false}
        />,
      );

      expect(screen.getByTestId('result-score')).toHaveTextContent('RUN SCORE 001250');
      expect(screen.getByRole('button', { name: '도전 종료' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: '다시 대전' })).not.toBeInTheDocument();
    },
  );

  it('blocks result navigation while the final score still needs a successful save', () => {
    render(
      <ResultScreen
        encounter={getFloorEncounter(1, 0)}
        floor={1}
        onContinue={vi.fn()}
        onRetrySave={vi.fn()}
        player={player}
        progress={progress}
        result="loss"
        rival={rival}
        saveFailed
        savePending={false}
        saveRetrying={false}
        score={0}
        series={{ floor: 1, encounterIndex: 0, wins: 0 }}
        seriesComplete={false}
      />,
    );

    expect(screen.getByRole('button', { name: '도전 종료' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '저장 다시 시도' })).toBeEnabled();
  });
});
