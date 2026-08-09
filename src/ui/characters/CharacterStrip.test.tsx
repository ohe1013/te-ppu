// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommonAssets } from '../../assets';
import { getFloorEncounters } from '../../progression';
import { CharacterStrip } from './CharacterStrip';

afterEach(cleanup);

const rivals = {
  quartermaster: { portraits: { idle: { url: '/quartermaster.webp' } } },
  'clock-moth': { portraits: { idle: { url: '/clock-moth.webp' } } },
  'moss-golem': { portraits: { idle: { url: '/moss-golem.webp' } } },
} as CommonAssets['rivals'];

describe('CharacterStrip', () => {
  it('renders three ordered encounter portraits and marks only the active one', () => {
    render(
      <CharacterStrip
        activeIndex={1}
        encounters={getFloorEncounters(1)}
        rivals={rivals}
        unlocked
      />,
    );

    const strip = screen.getByRole('list', { name: '층별 라이벌 순서' });
    expect(within(strip).getAllByTestId('character-portrait')).toHaveLength(3);
    expect(within(strip).getAllByText(/기어 창고장|시계나방 틱|이끼 골렘 모스/)).toHaveLength(3);
    expect(within(strip).getByText('시계나방 틱').closest('li')).toHaveAttribute(
      'data-encounter-state',
      'active',
    );
    expect(within(strip).getByText('기어 창고장').closest('li')).toHaveAttribute(
      'data-encounter-state',
      'queued',
    );
  });

  it('keeps the rival order visible while hiding art for a locked floor', () => {
    render(
      <CharacterStrip
        activeIndex={0}
        encounters={getFloorEncounters(1)}
        rivals={rivals}
        unlocked={false}
      />,
    );

    expect(screen.getByRole('list')).toHaveAttribute('data-unlocked', 'false');
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.queryByRole('img', { name: /기어 창고장.*초상/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /기어 창고장.*초상/ })).not.toHaveAttribute(
      'src',
    );
  });
});
