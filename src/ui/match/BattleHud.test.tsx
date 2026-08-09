// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicSideView } from '../../core/index';
import { BattleHud } from './BattleHud';
import { PIECE_PREVIEW_CELLS } from './piece-preview';

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
    const hud = screen.getByRole('region', { name: '견습 마도공학자 battle status' });

    expect(within(hud).getByTestId('player-next')).toHaveTextContent('T');
    expect(within(hud).getByTestId('player-next')).toHaveTextContent('I');
    const previews = within(hud).getByTestId('player-next').querySelectorAll(
      '[data-piece-preview]',
    );
    expect(previews).toHaveLength(2);
    expect(previews[0]?.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
    expect(previews[1]?.querySelectorAll('[data-piece-cell]')).toHaveLength(4);
    expect(within(hud).getByText('견습 마도공학자')).toBeInTheDocument();
    expect(within(hud).getByText('별빛 수리공')).toBeInTheDocument();
    expect(within(hud).getByTestId('player-combo')).toHaveTextContent('3');
    expect(within(hud).getByTestId('player-incoming')).toHaveTextContent('4');
    expect(within(hud).getByTestId('player-row-clear')).toHaveTextContent('2');
    expect(within(hud).getByTestId('player-freeze')).toHaveTextContent('1');
    expect(within(hud).getByTestId('player-queue-swap')).toHaveTextContent('5');
    expect(within(hud).getByTestId('player-freeze-ticks')).toHaveTextContent('90');
    expect(within(hud).getByTestId('player-phase')).toHaveTextContent('active');
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('DANGER');
  });

  it('announces a top-out state on the same symmetric HUD component', () => {
    render(
      <BattleHud
        character={{ id: 'glass-oracle', name: '유리 예언자 프리즘', title: '거울 회랑의 관리자' }}
        model={{ ...model, topOut: true }}
        side="opponent"
      />,
    );

    expect(screen.getByTestId('opponent-top-out')).toHaveTextContent('DANGER');
  });

  it.each(['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const)(
    'defines four visible cells for the %s preview shape',
    (kind) => {
      expect(PIECE_PREVIEW_CELLS[kind]).toHaveLength(4);
    },
  );

  it('keeps labels available without portrait sources and exposes deterministic portrait state', () => {
    const result = render(
      <BattleHud
        character={{ id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' }}
        model={model}
        side="player"
      />,
    );
    const hud = screen.getByRole('region', { name: '견습 마도공학자 battle status' });

    expect(hud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      'idle',
    );
    expect(hud.querySelector('img')).toBeNull();
    expect(within(hud).getByRole('heading', { name: '견습 마도공학자' })).toBeVisible();
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('DANGER');

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
});
