// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneProgressState, DEFAULT_PROGRESS } from '../../progression';
import { TitleScreen } from './TitleScreen';

afterEach(cleanup);

describe('TitleScreen', () => {
  it('shows brand, owl, player summary, and exactly four primary actions', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(DEFAULT_PROGRESS);
    progress.profile = { initials: 'RVT', characterId: 'hero-engineer' };
    progress.localBestScores.easy = {
      schemaVersion: 1,
      initials: 'RVT',
      characterId: 'hero-engineer',
      difficulty: 'easy',
      score: 12_340,
      durationTicks: 3_000,
      reachedFloor: 3,
      encountersWon: 7,
      owlDefeated: false,
      achievedAt: '2026-08-10T00:00:00.000Z',
    };
    const onStartRun = vi.fn();
    const onOpenRanking = vi.fn();
    const onChangePlayer = vi.fn();
    const onExit = vi.fn(async () => undefined);

    render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={onChangePlayer}
        onExit={onExit}
        onOpenRanking={onOpenRanking}
        onStartRun={onStartRun}
        progress={progress}
      />,
    );

    expect(screen.getByTestId('title-screen')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '기어라이트 타워 로고' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '별빛 부엉이 안내자' })).toBeInTheDocument();
    expect(screen.getByText('별빛 오락실')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '기어라이트 타워' })).toBeInTheDocument();
    expect(screen.getByText('탑을 오르고 모든 라이벌을 이겨 보세요.')).toBeInTheDocument();
    expect(screen.getByText('다음 타워 도전이 준비됐어요.')).toBeInTheDocument();
    expect(screen.getByText('RVT')).toBeInTheDocument();
    expect(screen.getByText('쉬움')).toBeInTheDocument();
    expect(screen.getByText('12,340')).toBeInTheDocument();
    expect(screen.getByText('플레이어')).toBeInTheDocument();
    expect(screen.getByText('난이도')).toBeInTheDocument();
    expect(screen.getByText('내 최고 기록')).toBeInTheDocument();

    const actions = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(actions).getAllByRole('button')).toHaveLength(4);
    await user.click(within(actions).getByRole('button', { name: '도전 시작' }));
    await user.click(within(actions).getByRole('button', { name: '랭킹' }));
    await user.click(within(actions).getByRole('button', { name: '플레이어 변경' }));
    expect(onStartRun).toHaveBeenCalledOnce();
    expect(onOpenRanking).toHaveBeenCalledOnce();
    expect(onChangePlayer).toHaveBeenCalledOnce();
  });

  it('confirms app shutdown only from the title and warns about an active run', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn(async () => undefined);

    render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={vi.fn()}
        onExit={onExit}
        onOpenRanking={vi.fn()}
        onStartRun={vi.fn()}
        progress={DEFAULT_PROGRESS}
        runActive
      />,
    );

    await user.click(screen.getByRole('button', { name: '게임 종료' }));
    expect(screen.getByText('앱을 다시 열면 현재 도전은 이어지지 않습니다.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '계속하기' }));
    expect(onExit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '게임 종료' }));
    await user.click(screen.getByRole('button', { name: '게임 종료 확인' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('presents a first player without inventing a profile or score', () => {
    render(
      <TitleScreen
        commonAssets={null}
        notice="Offline progress loaded."
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={() => undefined}
        progress={DEFAULT_PROGRESS}
      />,
    );

    expect(screen.getByRole('region', { name: '플레이어 정보' })).toBeInTheDocument();
    expect(screen.getByText('세 글자 이름을 등록하고 도전을 시작하세요.')).toBeInTheDocument();
    expect(screen.getByText('신규 플레이어')).toBeInTheDocument();
    expect(screen.getByText('캐릭터 미선택')).toBeInTheDocument();
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Offline progress loaded.');
  });

  it.each([
    ['easy', '쉬움'],
    ['normal', '보통'],
    ['hard', '어려움'],
  ] as const)('renders the %s difficulty label in Korean', (difficulty, label) => {
    const progress = cloneProgressState(DEFAULT_PROGRESS);
    progress.selectedDifficulty = difficulty;

    render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={() => undefined}
        progress={progress}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('uses the active-run label while keeping the primary action callback', async () => {
    const user = userEvent.setup();
    const onStartRun = vi.fn();
    const progress = cloneProgressState(DEFAULT_PROGRESS);
    progress.profile = { initials: 'RVT', characterId: 'hero-engineer' };
    const view = render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={onStartRun}
        progress={progress}
        runActive={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(onStartRun).toHaveBeenCalledOnce();

    view.rerender(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={onStartRun}
        progress={progress}
        runActive
      />,
    );
    await user.click(screen.getByRole('button', { name: '도전 계속' }));
    expect(onStartRun).toHaveBeenCalledTimes(2);
  });

  it('announces the exact online sync warning only when remote work is pending', () => {
    const view = render(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={() => undefined}
        progress={DEFAULT_PROGRESS}
        syncPending
      />,
    );

    expect(within(view.container).getByRole('status')).toHaveTextContent(
      '온라인 랭킹 동기화 대기 중',
    );

    view.rerender(
      <TitleScreen
        commonAssets={null}
        notice={null}
        onChangePlayer={() => undefined}
        onExit={async () => undefined}
        onOpenRanking={() => undefined}
        onStartRun={() => undefined}
        progress={DEFAULT_PROGRESS}
        syncPending={false}
      />,
    );
    expect(screen.queryByText('온라인 랭킹 동기화 대기 중')).not.toBeInTheDocument();
  });
});
