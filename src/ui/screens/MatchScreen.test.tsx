// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../../core/index';
import type { MatchLoopView } from '../../app/use-match-loop';
import { MatchScreen } from './MatchScreen';

const useMatchLoopMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/use-match-loop', () => ({
  useMatchLoop: useMatchLoopMock,
}));

vi.mock('../../render/BattleCanvas', () => ({
  BattleCanvas: ({ selectedRow }: { readonly selectedRow: number | null }) => (
    <div
      data-selected-row={selectedRow === null ? 'none' : selectedRow}
      data-testid="battle-canvas-proxy"
    />
  ),
}));

beforeEach(() => {
  const loop: MatchLoopView = {
    dispatch: vi.fn(),
    events: [],
    setPaused: vi.fn(),
    stop: vi.fn(),
    view: createPublicMatchView(createMatch({ matchSeed: 17 })),
  };
  useMatchLoopMock.mockReturnValue(loop);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MatchScreen', () => {
  it('composes two symmetric public HUDs around the single battle canvas', () => {
    render(<MatchScreen floor={2} seed={17} onFinished={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'PLAYER battle status' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'RIVAL battle status' }))
      .toBeInTheDocument();
    expect(screen.getAllByTestId('battle-canvas-proxy')).toHaveLength(1);
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-selected-row',
      'none',
    );
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });
});
