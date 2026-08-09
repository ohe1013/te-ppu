// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_CHARACTERS } from '../../player';
import { CharacterSelectScreen } from './CharacterSelectScreen';

afterEach(cleanup);

describe('CharacterSelectScreen', () => {
  it('selects one of three equal-strength characters with left and right input', () => {
    const onComplete = vi.fn();
    render(
      <CharacterSelectScreen
        assets={{}}
        initialCharacterId="hero-engineer"
        onBack={vi.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('character-select-screen'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByTestId('character-select-screen'), { key: 'Enter' });

    expect(onComplete).toHaveBeenCalledWith('cloud-courier');
  });

  it('mirrors left and right selection on the visible direction pad', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <CharacterSelectScreen
        initialCharacterId="cloud-courier"
        onBack={vi.fn()}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: '오른쪽' }));
    await user.click(screen.getByRole('button', { name: 'SELECT' }));

    expect(onComplete).toHaveBeenCalledWith('star-alchemist');
  });

  it('selects a character by touch without showing stats, abilities, or performance differences', async () => {
    const user = userEvent.setup();
    render(
      <CharacterSelectScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        players={PLAYER_CHARACTERS}
      />,
    );

    await user.click(screen.getByRole('button', { name: /세라/ }));

    expect(screen.getByRole('button', { name: /세라/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/stats|ability|attack power|performance/i)).not.toBeInTheDocument();
  });

  it('shows every catalog character story and fallback art when assets are absent', () => {
    render(<CharacterSelectScreen onBack={vi.fn()} onComplete={vi.fn()} />);

    for (const player of Object.values(PLAYER_CHARACTERS)) {
      const card = screen.getByRole('button', { name: new RegExp(player.name) });
      expect(card).toHaveAttribute('data-character-id', player.id);
      expect(card).toHaveTextContent(player.role);
      expect(card).toHaveTextContent(player.title);
      expect(card).toHaveTextContent(player.story);
      expect(within(card).getByRole('img', { name: `${player.name} 전신 일러스트` }))
        .toBeInTheDocument();
    }
  });

  it('keeps Back explicit and exposes only the three catalog character ids', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<CharacterSelectScreen onBack={onBack} onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'BACK' }));

    expect(screen.getByTestId('character-select-screen')).toHaveAttribute(
      'data-selected-character-id',
      'hero-engineer',
    );
    expect(screen.getAllByRole('button', { name: /리벳|루미|세라/ })).toHaveLength(3);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('maps Backspace to the visible Back action', () => {
    const onBack = vi.fn();
    render(<CharacterSelectScreen onBack={onBack} onComplete={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId('character-select-screen'), { key: 'Backspace' });

    expect(onBack).toHaveBeenCalledOnce();
  });
});
