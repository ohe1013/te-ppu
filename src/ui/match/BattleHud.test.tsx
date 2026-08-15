// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicSideView } from '../../core/index';
import type { AttackFeedbackPresentation } from './attack-feedback';
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

const launchFeedback: AttackFeedbackPresentation = {
  amount: 2,
  combo: 2,
  comboLabel: '2 COMBO',
  displacementPx: 4,
  id: 'attack:12:0',
  intensity: 'medium',
  phase: 'launch',
  phaseProgress: 0.5,
  reducedMotion: false,
  source: 'player',
  target: 'opponent',
};

const character = {
  id: 'hero-engineer',
  name: '견습 마도공학자',
  title: '별빛 다루기',
} as const;

describe('BattleHud', () => {
  it('marks source launch feedback and shows a transient combo label', () => {
    render(
      <BattleHud
        character={character}
        feedback={launchFeedback}
        model={model}
        side="player"
      />,
    );
    const hud = screen.getByRole('region', { name: `${character.name} 대전 상태` });

    expect(hud).toHaveAttribute('data-attack-role', 'source');
    expect(hud).toHaveAttribute('data-attack-phase', 'launch');
    expect(hud).toHaveAttribute('data-impact-intensity', 'medium');
    expect(hud).toHaveAttribute('data-reduced-motion', 'false');
    expect(within(hud).getByText('2 COMBO!')).toBeVisible();
  });

  it('marks target impact without borrowing the source combo label', () => {
    render(
      <BattleHud
        character={character}
        feedback={{ ...launchFeedback, phase: 'impact' }}
        model={model}
        side="opponent"
      />,
    );
    const hud = screen.getByRole('region', { name: `${character.name} 대전 상태` });

    expect(hud).toHaveAttribute('data-attack-role', 'target');
    expect(hud).toHaveAttribute('data-attack-phase', 'impact');
    expect(hud).toHaveAttribute('data-impact-intensity', 'medium');
    expect(within(hud).queryByText('2 COMBO!')).not.toBeInTheDocument();
  });

  it('exposes reduced-motion attack feedback without hiding non-motion feedback', () => {
    render(
      <BattleHud
        character={character}
        feedback={{ ...launchFeedback, displacementPx: 0, reducedMotion: true }}
        model={model}
        side="player"
      />,
    );
    const hud = screen.getByRole('region', { name: `${character.name} 대전 상태` });

    expect(hud).toHaveAttribute('data-reduced-motion', 'true');
    expect(within(hud).getByText('2 COMBO!')).toBeVisible();
  });

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

  it('uses the authored square portrait without publishing a runtime crop offset', () => {
    render(
      <BattleHud
        character={{ id: 'cloud-courier', name: '루미', title: '바람길의 전령' }}
        model={model}
        portrait={{
          alt: 'PLAYER focus portrait',
          state: 'focus',
          url: '/assets/characters/cloud-courier/portrait-focus.webp',
        }}
        side="player"
      />,
    );

    const hud = screen.getByRole('region', { name: '루미 대전 상태' });
    const plate = hud.querySelector<HTMLElement>('.battle-hud__portrait--plate');
    expect(hud).toHaveAttribute('data-character-id', 'cloud-courier');
    expect(plate).not.toHaveAttribute('style');
    expect(plate?.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/characters/cloud-courier/portrait-focus.webp',
    );
    expect(within(hud).getByAltText('루미 기본 표정')).toHaveClass('asset-image');
  });

  it('centers authored square portraits in battle and shared character plates', () => {
    const matchCss = readFileSync(resolve('src/ui/match/match-layout.css'), 'utf8');
    const screensCss = readFileSync(resolve('src/ui/screens/screens.css'), 'utf8');

    expect(matchCss).toMatch(
      /\.battle-hud__portrait \.asset-image\s*\{[^}]*object-position:\s*center;/s,
    );
    expect(screensCss).toMatch(
      /\.character-portrait__image\s*\{[^}]*object-position:\s*center;/s,
    );
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
