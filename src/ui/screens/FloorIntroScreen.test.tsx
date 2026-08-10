// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFloorEncounter } from '../../progression';
import type { PlayerCharacterAssets, RivalCharacterAssets } from '../../assets';
import type { PlayerCharacterDefinition } from '../../player';
import { FloorIntroScreen } from './FloorIntroScreen';

afterEach(cleanup);

const rival = {
  fullArt: { url: '/clock-moth-full.webp' },
  portraits: { idle: { url: '/clock-moth-idle.webp' } },
} as RivalCharacterAssets;

const player = {
  id: 'cloud-courier',
  name: '루미',
  role: '구름 우편기사',
  title: '바람길의 전령',
  story: '멈춘 바람길을 되찾는다.',
  palette: ['#4d8fff', '#ffd84d', '#f8fbff'],
} satisfies PlayerCharacterDefinition;

const playerAssets = {
  fullArt: { url: '/cloud-courier-full.webp' },
  portraits: { idle: { url: '/cloud-courier-idle.webp' } },
} as PlayerCharacterAssets;

describe('FloorIntroScreen', () => {
  it('shows the selected rival story and compact three-win progress', () => {
    const encounter = getFloorEncounter(1, 1);
    render(
      <FloorIntroScreen
        encounter={encounter}
        floor={1}
        onStart={() => undefined}
        player={player}
        playerAssets={playerAssets}
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
    const selectedPlayer = screen.getByRole('group', { name: '루미 player identity' });
    expect(selectedPlayer).toHaveAttribute('data-character-id', 'cloud-courier');
    expect(selectedPlayer).toHaveTextContent('바람길의 전령');
    expect(screen.getByAltText('루미 full illustration')).toHaveAttribute(
      'src',
      '/cloud-courier-full.webp',
    );
    expect(screen.getByAltText('루미 idle portrait')).toHaveAttribute(
      'src',
      '/cloud-courier-idle.webp',
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows a working tower-back control for only the first encounter', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const encounter = getFloorEncounter(1, 0);
    render(
      <FloorIntroScreen
        encounter={encounter}
        floor={1}
        onBack={onBack}
        onStart={() => undefined}
        player={player}
        playerAssets={playerAssets}
        rival={rival}
        series={{ floor: 1, encounterIndex: 0, wins: 0 }}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]!);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
