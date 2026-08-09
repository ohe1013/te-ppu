// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
      />,
    );

    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();
    expect(screen.getAllByRole('list', { name: '층별 라이벌 순서' })).toHaveLength(5);
  });
});
