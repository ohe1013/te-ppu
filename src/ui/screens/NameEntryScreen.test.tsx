// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
