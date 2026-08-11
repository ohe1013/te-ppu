// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicSideView } from '../../core/index';
import { BattleHud } from './BattleHud';

afterEach(cleanup);

const model: PublicSideView = {
  active: null,
  board: Array.from({ length: 200 }, () => null),
  combo: 3,
  freezeTicks: 90,
  ghostY: null,
  incoming: 4,
  inventory: { freeze: 1, queueSwap: 5, rowClear: 2 },
  next: [
    { kind: 'T', marker: null },
    { kind: 'I', marker: { item: 'freeze', minoIndex: 2 } },
  ],
  phase: 'active',
  topOut: false,
};

describe('BattleHud', () => {
  it('shows every public side field without private match data', () => {
    render(
      <BattleHud
        character={{ id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' }}
        model={model}
        side="player"
      />,
    );
    const hud = screen.getByRole('region', { name: '견습 마도공학자 대전 상태' });

    expect(within(hud).getByTestId('player-next')).toHaveTextContent('');
    expect(within(hud).getByText('다음 블록')).toBeInTheDocument();
    const queue = within(hud).getByRole('list', { name: '견습 마도공학자 다음 블록' });
    const previews = queue.querySelectorAll('[data-piece-preview]');
    expect(previews).toHaveLength(2);
    expect(previews[0]?.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
    expect(previews[1]?.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
    expect(within(queue).getAllByRole('img', { name: '블록 모양' })).toHaveLength(2);
    expect(within(queue).queryByRole('img', { name: /^[IJLOSTZ](?:\s|$)/ })).not.toBeInTheDocument();
    for (const item of within(queue).getAllByRole('listitem')) {
      expect(item).not.toHaveAttribute('aria-label');
      expect(item).not.toHaveAccessibleName();
    }
    expect(within(hud).getByText('견습 마도공학자')).toBeInTheDocument();
    expect(within(hud).getByText('별빛 수리공')).toBeInTheDocument();
    expect(within(hud).getByTestId('player-combo')).toHaveTextContent('3');
    expect(within(hud).getByTestId('player-incoming')).toHaveTextContent('4');
    expect(within(hud).getByTestId('player-row-clear')).toHaveTextContent('2');
    expect(within(hud).getByTestId('player-freeze')).toHaveTextContent('1');
    expect(within(hud).getByTestId('player-queue-swap')).toHaveTextContent('5');
    expect(within(hud).getByTestId('player-freeze-ticks')).toHaveTextContent('90');
    expect(within(hud).getByTestId('player-phase')).toHaveTextContent('active');
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('위험');
    expect(within(hud).getByText('행 제거')).toBeInTheDocument();
    expect(within(hud).getByText('빙결')).toBeInTheDocument();
    expect(within(hud).getByText('교체')).toBeInTheDocument();
    expect(within(hud).getByLabelText('견습 마도공학자 아이템')).toBeInTheDocument();
    expect(within(hud).getByRole('img', { name: '행 제거 아이템' })).toBeInTheDocument();
    expect(within(hud).getByRole('img', { name: '빙결 아이템' })).toBeInTheDocument();
    expect(within(hud).getByRole('img', { name: '교체 아이템' })).toBeInTheDocument();
  });

  it('announces a top-out state on the same symmetric HUD component', () => {
    render(
      <BattleHud
        character={{ id: 'glass-oracle', name: '유리 예언자 프리즘', title: '거울 회랑의 관리자' }}
        model={{ ...model, topOut: true }}
        side="opponent"
      />,
    );

    expect(screen.getByTestId('opponent-top-out')).toHaveTextContent('위험');
  });

  it('keeps labels available without portrait sources and exposes deterministic portrait state', () => {
    const result = render(
      <BattleHud
        character={{ id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' }}
        model={model}
        side="player"
      />,
    );
    const hud = screen.getByRole('region', { name: '견습 마도공학자 대전 상태' });

    expect(hud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      'idle',
    );
    expect(hud.querySelector('img')).toBeNull();
    expect(within(hud).getByRole('heading', { name: '견습 마도공학자' })).toBeVisible();
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('위험');

    result.rerender(
      <BattleHud
        character={{ id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' }}
        model={model}
        portrait={{
          alt: 'PLAYER attack portrait',
          state: 'attack',
          url: '/assets/hero-attack.webp',
        }}
        side="player"
      />,
    );

    expect(hud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      'attack',
    );
    expect(hud.querySelector('img')).toHaveAttribute('src', '/assets/hero-attack.webp');
  });

  it('uses a configurable top-biased portrait crop without changing identity hooks', () => {
    render(
      <BattleHud
        character={{ id: 'cloud-courier', name: '루미', title: '바람길의 전령' }}
        model={model}
        portrait={{
          alt: 'PLAYER focus portrait',
          state: 'focus',
          url: '/assets/characters/cloud-courier/portrait-focus.webp',
        }}
        portraitPosition="48% 18%"
        side="player"
      />,
    );

    const hud = screen.getByRole('region', { name: '루미 대전 상태' });
    const plate = hud.querySelector<HTMLElement>('.battle-hud__portrait--plate');
    expect(hud).toHaveAttribute('data-character-id', 'cloud-courier');
    expect(plate).toHaveStyle({ '--portrait-position': '48% 18%' });
    expect(within(hud).getByAltText('루미 기본 표정')).toHaveClass('asset-image');
  });

  it('shows the ready label without incoming danger or a top-out', () => {
    render(
      <BattleHud
        character={{ id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' }}
        model={{ ...model, incoming: 0 }}
        side="player"
      />,
    );

    expect(screen.getByTestId('player-top-out')).toHaveTextContent('준비');
  });
});
