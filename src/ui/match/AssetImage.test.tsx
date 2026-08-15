// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

async function assetImageRuntime() {
  return import('./AssetImage');
}

describe('AssetImage', () => {
  it('uses an accessible fallback without ever rendering an empty image URL', async () => {
    const { AssetImage } = await assetImageRuntime();

    render(<AssetImage alt="PLAYER idle portrait" url={undefined} />);

    expect(screen.getByRole('img', { name: 'PLAYER idle portrait' })).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });

  it('retries a different URL after an image failure but keeps the failed URL on fallback', async () => {
    const { AssetImage } = await assetImageRuntime();
    const result = render(<AssetImage alt="RIVAL attack portrait" url="a.webp" />);

    const first = screen.getByRole('img', { name: 'RIVAL attack portrait' });
    expect(first).toHaveAttribute('src', 'a.webp');
    fireEvent.error(first);
    expect(document.querySelector('img')).toBeNull();

    result.rerender(<AssetImage alt="RIVAL attack portrait" url="a.webp" />);
    expect(document.querySelector('img')).toBeNull();

    result.rerender(<AssetImage alt="RIVAL attack portrait" url="b.webp" />);
    const retry = screen.getByRole('img', { name: 'RIVAL attack portrait' });
    expect(retry).toHaveAttribute('src', 'b.webp');
  });
});
