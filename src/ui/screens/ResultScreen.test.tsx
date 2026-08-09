// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RivalCharacterAssets } from '../../assets';
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

function renderResult(floor: 1 | 5, seriesComplete: boolean) {
  return render(
    <ResultScreen
      encounter={getFloorEncounter(floor, 2)}
      floor={floor}
      onContinue={vi.fn()}
      onRetry={vi.fn()}
      onRetrySave={vi.fn()}
      progress={progress}
      result="win"
      rival={rival}
      saveFailed={false}
      savePending={false}
      saveRetrying={false}
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
});
