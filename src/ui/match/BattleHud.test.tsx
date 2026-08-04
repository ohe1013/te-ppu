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
    render(<BattleHud label="PLAYER" model={model} side="player" />);
    const hud = screen.getByRole('region', { name: 'PLAYER battle status' });

    expect(within(hud).getByTestId('player-next')).toHaveTextContent('T');
    expect(within(hud).getByTestId('player-next')).toHaveTextContent('I');
    expect(within(hud).getByTestId('player-combo')).toHaveTextContent('3');
    expect(within(hud).getByTestId('player-incoming')).toHaveTextContent('4');
    expect(within(hud).getByTestId('player-row-clear')).toHaveTextContent('2');
    expect(within(hud).getByTestId('player-freeze')).toHaveTextContent('1');
    expect(within(hud).getByTestId('player-queue-swap')).toHaveTextContent('5');
    expect(within(hud).getByTestId('player-freeze-ticks')).toHaveTextContent('90');
    expect(within(hud).getByTestId('player-phase')).toHaveTextContent('active');
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('READY');
  });

  it('announces a top-out state on the same symmetric HUD component', () => {
    render(
      <BattleHud
        label="RIVAL"
        model={{ ...model, topOut: true }}
        side="opponent"
      />,
    );

    expect(screen.getByTestId('opponent-top-out')).toHaveTextContent('TOP OUT');
  });

  it('keeps labels available without portrait sources and exposes deterministic portrait state', () => {
    const result = render(<BattleHud label="PLAYER" model={model} side="player" />);
    const hud = screen.getByRole('region', { name: 'PLAYER battle status' });

    expect(hud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      'idle',
    );
    expect(hud.querySelector('img')).toBeNull();
    expect(within(hud).getByRole('heading', { name: 'PLAYER' })).toBeVisible();
    expect(within(hud).getByTestId('player-top-out')).toHaveTextContent('READY');

    result.rerender(
      <BattleHud
        label="PLAYER"
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
