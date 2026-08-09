// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getFloorEncounter } from '../../progression';
import type { RivalCharacterAssets } from '../../assets';
import { FloorIntroScreen } from './FloorIntroScreen';

afterEach(cleanup);

const rival = {
  fullArt: { url: '/clock-moth-full.webp' },
  portraits: { idle: { url: '/clock-moth-idle.webp' } },
} as RivalCharacterAssets;

describe('FloorIntroScreen', () => {
  it('shows the selected rival story and compact three-win progress', () => {
    const encounter = getFloorEncounter(1, 1);
    render(
      <FloorIntroScreen
        encounter={encounter}
        floor={1}
        onBack={() => undefined}
        onStart={() => undefined}
        rival={rival}
        series={{ floor: 1, encounterIndex: 1, wins: 1 }}
      />,
    );

    expect(screen.getByText('시계나방 틱')).toBeInTheDocument();
    expect(screen.getByText('시간을 훔치는 감시자')).toBeInTheDocument();
    expect(screen.getByText(encounter.intro)).toBeInTheDocument();
    expect(screen.getByText('상대 2/3')).toBeInTheDocument();
    expect(screen.queryByText(/AI 반응 간격/)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '시계나방 틱 전신 일러스트' })).toHaveAttribute(
      'src',
      '/clock-moth-full.webp',
    );
  });
});
