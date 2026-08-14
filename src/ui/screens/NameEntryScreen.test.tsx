// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NameEntryScreen } from './NameEntryScreen';

afterEach(cleanup);

describe('NameEntryScreen', () => {
  it('requires exactly three letters before END can complete', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={onComplete} />);

    expect(screen.getByRole('button', { name: 'END' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'END' }));

    expect(onComplete).toHaveBeenCalledWith('ABC');
  });

  it('uses arrow keys, Enter, Backspace, and the visible direction pad for the same draft controls', async () => {
    const user = userEvent.setup();
    render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={vi.fn()} />);
    const screenElement = screen.getByTestId('name-entry-screen');

    fireEvent.keyDown(screenElement, { key: 'Enter' });
    fireEvent.keyDown(screenElement, { key: 'ArrowRight' });
    fireEvent.keyDown(screenElement, { key: 'Enter' });
    fireEvent.keyDown(screenElement, { key: 'Backspace' });
    await user.click(screen.getByRole('button', { name: '오른쪽' }));
    fireEvent.keyDown(screenElement, { key: 'Enter' });

    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('AC');
  });

  it('keeps direct taps and adds direction-pad selection for the highlighted key', async () => {
    const user = userEvent.setup();
    render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '오른쪽' }));
    await user.click(screen.getByRole('button', { name: '선택' }));
    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('B__');

    await user.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('BA_');
  });

  it('puts END below selection and lets selection activate the focused DEL key', async () => {
    const user = userEvent.setup();
    render(<NameEntryScreen initialValue="ABC" onBack={vi.fn()} onComplete={vi.fn()} />);

    const keyboard = screen.getByRole('group', { name: '이니셜 키보드' });
    const actions = screen.getByRole('group', { name: '이니셜 동작' });
    expect(within(keyboard).queryByRole('button', { name: 'END' })).not.toBeInTheDocument();
    expect(within(actions).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['선택', 'END']);

    await user.click(screen.getByRole('button', { name: 'DEL' }));
    await user.click(screen.getByRole('button', { name: '선택' }));
    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('A__');
  });

  it('places Back in the dedicated upper-left control', () => {
    render(<NameEntryScreen initialValue="" onBack={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'BACK' }))
      .toHaveClass('name-entry-screen__back');
  });

  it('lets a focused Back button consume Enter while arrows still move the arcade key', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<NameEntryScreen initialValue="" onBack={onBack} onComplete={vi.fn()} />);
    const backButton = screen.getByRole('button', { name: 'BACK' });

    backButton.focus();
    await user.keyboard('{ArrowRight}{Enter}');

    expect(backButton).toHaveFocus();
    expect(screen.getByTestId('name-entry-screen')).toHaveAttribute('data-focused-key', 'B');
    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('___');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps the draft capped at three uppercase letters and exposes Back explicitly', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<NameEntryScreen initialValue="ab" onBack={onBack} onComplete={vi.fn()} />);

    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('AB');
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'D' }));
    await user.click(screen.getByRole('button', { name: 'BACK' }));

    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('ABC');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('discards non-letters while normalizing the initial value', () => {
    render(<NameEntryScreen initialValue="a-1bcd" onBack={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByRole('status', { name: '입력한 이니셜' })).toHaveTextContent('ABC');
    expect(screen.getByRole('button', { name: 'END' })).toBeEnabled();
  });
});
