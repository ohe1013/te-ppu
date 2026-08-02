// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameCommand } from '../../core/index';
import { RotateButton } from './RotateButton';

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('RotateButton', () => {
  it('sends one clockwise rotation on pointerdown without click or hold repeats', () => {
    vi.useFakeTimers();
    const commands: GameCommand[] = [];
    render(<RotateButton onCommand={(command) => commands.push(command)} />);
    const button = screen.getByRole('button', { name: '시계 방향 회전' });

    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
    vi.advanceTimersByTime(1_000);
    fireEvent.pointerUp(button, { button: 0, pointerId: 1 });
    fireEvent.click(button, { detail: 1 });

    expect(commands).toEqual([{ type: 'rotate-clockwise' }]);
  });

  it('uses a standalone detail-zero click for keyboard and assistive activation', () => {
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<RotateButton onCommand={onCommand} />);
    const button = screen.getByRole('button', { name: '시계 방향 회전' });

    fireEvent.click(button, { detail: 1 });
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent.click(button, { detail: 0 });
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ type: 'rotate-clockwise' });
  });

  it('sends one rotation for a held Enter key and allows later activations', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<RotateButton onCommand={onCommand} />);
    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{Enter>5/}');
    expect(onCommand).toHaveBeenCalledTimes(1);

    await user.keyboard('{Enter}');
    expect(onCommand).toHaveBeenCalledTimes(2);

    fireEvent.click(button, { detail: 0 });
    expect(onCommand).toHaveBeenCalledTimes(3);
  });

  it('sends one rotation for a held Space key', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<RotateButton onCommand={onCommand} />);
    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('[Space>5/]');

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ type: 'rotate-clockwise' });
  });

  it('releases a held keyboard activation when focus leaves the button', async () => {
    const firstUser = userEvent.setup();
    const secondUser = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<RotateButton onCommand={onCommand} />);
    const button = screen.getByRole('button');
    button.focus();

    await firstUser.keyboard('{Enter>}');
    button.blur();
    button.focus();
    await secondUser.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it('ignores non-primary pointers and mouse buttons but allows a new primary press', () => {
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<RotateButton onCommand={onCommand} />);
    const button = screen.getByRole('button', { name: '시계 방향 회전' });

    fireEvent.pointerDown(button, { button: 0, isPrimary: false, pointerId: 1 });
    fireEvent.pointerDown(button, { button: 2, isPrimary: true, pointerId: 2 });
    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 3 });
    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 4 });

    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand).toHaveBeenNthCalledWith(1, { type: 'rotate-clockwise' });
    expect(onCommand).toHaveBeenNthCalledWith(2, { type: 'rotate-clockwise' });
  });
});
