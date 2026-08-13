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
        continuation={null}
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
        continuation={null}
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
        continuation={null}
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
        continuation={null}
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
    expect([...route.querySelectorAll<HTMLElement>('.tower-node__marker')].map((node) => node.textContent))
      .toEqual(['01층', '02층', '03층', '04층', '05층']);
  });

  it('shows locked difficulty choices and selects an unlocked difficulty', () => {
    const onSelectDifficulty = vi.fn();
    render(
      <TowerScreen
        commonAssets={commonAssets}
        continuation={null}
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
    expect(screen.getByRole('button', { name: '쉬움' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '보통' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '어려움' })).toBeDisabled();

    const unlockedNormal = cloneProgressState(progress);
    unlockedNormal.unlockedDifficulties.normal = true;
    cleanup();
    render(
      <TowerScreen
        commonAssets={commonAssets}
        continuation={null}
        notice={null}
        onSelectDifficulty={onSelectDifficulty}
        onSelectFloor={() => undefined}
        progress={unlockedNormal}
        requiredFloor={1}
        runActive={false}
        runScore={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '보통' }));
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
        continuation={null}
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
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('disables difficulty controls and exposes a notice after run progress exists', () => {
    const unlockedNormal = cloneProgressState(progress);
    unlockedNormal.unlockedDifficulties.normal = true;

    render(
      <TowerScreen
        commonAssets={commonAssets}
        continuation={null}
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

    expect(screen.getByRole('button', { name: '쉬움' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '보통' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('도전 중에는 난이도를 바꿀 수 없습니다.');
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );
    expect(screen.getByText('기어라이트 타워')).toBeInTheDocument();
    expect(screen.getByText('잠김')).toBeInTheDocument();
  });

  it('highlights and labels the exact suspended opponent', () => {
    const floorTwoProgress = cloneProgressState(progress);
    floorTwoProgress.difficultyProgress.easy.highestUnlockedFloor = 2;

    render(
      <TowerScreen
        commonAssets={commonAssets}
        continuation={{ kind: 'floor', floor: 2, encounterIndex: 1 }}
        notice={null}
        onSelectFloor={() => undefined}
        progress={floorTwoProgress}
        requiredFloor={2}
        runActive
        runScore={6_250}
      />,
    );

    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 2층 2번째 상대 · 점수 006250',
    );
    expect(screen.getByRole('button', { name: '2층 2번째 상대부터 계속' })).toBeEnabled();
    const floorTwo = screen.getByTestId('tower-route').querySelector('[data-floor="2"]');
    expect(floorTwo?.querySelector('[data-encounter-index="1"]'))
      .toHaveAttribute('data-encounter-state', 'active');
  });
});
