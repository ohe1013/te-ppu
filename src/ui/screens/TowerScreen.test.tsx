// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommonAssets, LoadedImageRef } from '../../assets';
import { cloneProgressState, DEFAULT_PROGRESS } from '../../progression';
import { TowerScreen } from './TowerScreen';

afterEach(cleanup);

const image = (url: string) => ({ url, generation: 1 } as LoadedImageRef);

const commonAssets = {
  owl: { fullArt: image('/owl.webp'), portraits: {} },
  rivals: {
    quartermaster: { portraits: { idle: image('/quartermaster.webp') } },
    alchemist: { portraits: { idle: image('/alchemist.webp') } },
    'guard-captain': { portraits: { idle: image('/guard-captain.webp') } },
    'dark-engineer': { portraits: { idle: image('/dark-engineer.webp') } },
    'clock-moth': { portraits: { idle: image('/clock-moth.webp') } },
    'glass-oracle': { portraits: { idle: image('/glass-oracle.webp') } },
    'moss-golem': { portraits: { idle: image('/moss-golem.webp') } },
    'demon-king': { fullArt: image('/demon-king.webp'), portraits: {} },
  },
} as unknown as CommonAssets;

const progress = cloneProgressState(DEFAULT_PROGRESS);

describe('TowerScreen', () => {
  it('makes the mascot, demon silhouette, and all three floor-one rivals visible', () => {
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectFloor={() => undefined}
        progress={progress}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );

    expect(screen.getByRole('img', { name: '태엽 부엉이 안내자' })).toHaveAttribute(
      'src',
      '/owl.webp',
    );
    expect(screen.getAllByRole('img', { name: '이끼 골렘 모스 대기 중 초상' }).length)
      .toBeGreaterThan(0);
    expect(screen.getByText('탑의 마왕 녹스')).toBeInTheDocument();
    expect(screen.getByTestId('tower-screen').querySelector('.screen-backdrop--demon'))
      .toHaveAttribute('src', '/demon-king.webp');
  });

  it('keeps locked floors disabled while preserving the authored route', () => {
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectFloor={() => undefined}
        progress={progress}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );

    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();
    expect(screen.getAllByRole('list', { name: '층별 라이벌 순서' })).toHaveLength(5);
  });

  it('returns to title from the compact tower header control', () => {
    const onBack = vi.fn();
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onBack={onBack}
        onSelectFloor={() => undefined}
        progress={progress}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps floors in logical order while rendering an upward tower route', () => {
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectDifficulty={() => undefined}
        onSelectFloor={() => undefined}
        progress={progress}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );

    const route = screen.getByTestId('tower-route');
    expect(route).toHaveClass('tower-route--ascending');
    expect(route.querySelector('.tower-route__shaft')).toBeInTheDocument();
    expect([...route.querySelectorAll<HTMLElement>('[data-floor]')].map((node) => node.dataset.floor))
      .toEqual(['1', '2', '3', '4', '5']);
  });

  it('shows locked difficulty choices and selects an unlocked difficulty', () => {
    const onSelectDifficulty = vi.fn();
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectDifficulty={onSelectDifficulty}
        onSelectFloor={() => undefined}
        progress={progress}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );

    expect(screen.getByRole('group', { name: '난이도 선택' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EASY' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'NORMAL' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'HARD' })).toBeDisabled();

    const unlockedNormal = cloneProgressState(progress);
    unlockedNormal.unlockedDifficulties.normal = true;
    cleanup();
    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectDifficulty={onSelectDifficulty}
        onSelectFloor={() => undefined}
        progress={unlockedNormal}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'NORMAL' }));
    expect(onSelectDifficulty).toHaveBeenCalledWith('normal');
  });

  it('allows only the required floor during an active run despite historical unlocks', () => {
    const historicallyUnlocked = cloneProgressState(progress);
    historicallyUnlocked.difficultyProgress.easy.highestUnlockedFloor = 5;
    historicallyUnlocked.difficultyProgress.easy.clearedFloors = {
      1: true,
      2: true,
      3: true,
      4: true,
      5: false,
    };

    render(
      <TowerScreen
        commonAssets={commonAssets}
        notice={null}
        onSelectFloor={() => undefined}
        progress={historicallyUnlocked}
        requiredFloor={1}
        runActive
        runScore={0}
      />,
    );

    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      'RUN ACTIVE · NEXT 1F · SCORE 000000',
    );
  });

  it('disables difficulty controls and exposes a notice after run progress exists', () => {
    const unlockedNormal = cloneProgressState(progress);
    unlockedNormal.unlockedDifficulties.normal = true;

    render(
      <TowerScreen
        commonAssets={commonAssets}
        difficultySelectionLocked
        notice={null}
        onSelectDifficulty={vi.fn()}
        onSelectFloor={() => undefined}
        progress={unlockedNormal}
        requiredFloor={2}
        runActive
        runScore={5_000}
      />,
    );

    expect(screen.getByRole('button', { name: 'EASY' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'NORMAL' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('RUN DIFFICULTY LOCKED');
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      'RUN ACTIVE · NEXT 2F · SCORE 005000',
    );
  });
});
