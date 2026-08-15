// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcadeDirectionPad } from './ArcadeDirectionPad';

afterEach(cleanup);

describe('ArcadeDirectionPad', () => {
  it('exposes all four directions as accessible buttons', async () => {
    const user = userEvent.setup();
    const onDirection = vi.fn();
    render(<ArcadeDirectionPad onDirection={onDirection} />);

    await user.click(screen.getByRole('button', { name: '위' }));
    await user.click(screen.getByRole('button', { name: '오른쪽' }));
    await user.click(screen.getByRole('button', { name: '아래' }));
    await user.click(screen.getByRole('button', { name: '왼쪽' }));

    expect(onDirection).toHaveBeenNthCalledWith(1, 'up');
    expect(onDirection).toHaveBeenNthCalledWith(2, 'right');
    expect(onDirection).toHaveBeenNthCalledWith(3, 'down');
    expect(onDirection).toHaveBeenNthCalledWith(4, 'left');
  });
});
