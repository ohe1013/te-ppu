// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('lets a focused Back button consume Enter while arrows still change selection', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onComplete = vi.fn();
    render(<CharacterSelectScreen onBack={onBack} onComplete={onComplete} />);
    const backButton = screen.getByRole('button', { name: 'BACK' });

    backButton.focus();
    await user.keyboard('{ArrowRight}{Enter}');

    expect(backButton).toHaveFocus();
    expect(screen.getByTestId('character-select-screen')).toHaveAttribute(
      'data-selected-character-id',
      'cloud-courier',
    );
    expect(onBack).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
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

  it('scrolls each changed selection into view without scrolling on mount or moving focus', async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(<CharacterSelectScreen onBack={vi.fn()} onComplete={vi.fn()} />);
      const screenElement = screen.getByTestId('character-select-screen');
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.keyDown(screenElement, { key: 'ArrowRight' });
      const lumiCard = screen.getByRole('button', { name: /루미/ });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.instances[0]).toBe(lumiCard);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'center' });

      const rightButton = screen.getByRole('button', { name: '오른쪽' });
      rightButton.focus();
      fireEvent.click(rightButton);
      const seraCard = screen.getByRole('button', { name: /세라/ });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView.mock.instances[1]).toBe(seraCard);
      expect(rightButton).toHaveFocus();
    } finally {
      if (originalScrollIntoView === undefined) {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      } else {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      }
    }
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

  it('locks every selection input while profile persistence owns the screen', () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    render(
      <CharacterSelectScreen
        initialCharacterId="hero-engineer"
        interactionLocked
        onBack={onBack}
        onComplete={onComplete}
      />,
    );
    const selectionScreen = screen.getByTestId('character-select-screen');
    const backgroundButtons = within(selectionScreen).getAllByRole('button');

    expect(backgroundButtons).toHaveLength(9);
    expect(selectionScreen).toHaveAttribute('inert');
    for (const button of backgroundButtons) expect(button).toBeDisabled();

    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', 'Backspace']) {
      fireEvent.keyDown(selectionScreen, { key });
    }
    for (const button of backgroundButtons) fireEvent.click(button);

    expect(selectionScreen).toHaveAttribute(
      'data-selected-character-id',
      'hero-engineer',
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
