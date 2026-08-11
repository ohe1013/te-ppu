import type { CommonAssets } from '../../assets';
import { PLAYER_CHARACTERS } from '../../player';
import type { Difficulty, ProgressState } from '../../progression';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface TitleScreenProps {
  readonly commonAssets?: CommonAssets | null;
  readonly notice: string | null;
  readonly onStartRun: () => void;
  readonly onOpenRanking: () => void;
  readonly onChangePlayer: () => void;
  readonly progress: ProgressState;
  readonly runActive?: boolean;
  readonly syncPending?: boolean;
}

const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

const SCORE_FORMATTER = new Intl.NumberFormat('ko-KR');

export function TitleScreen({
  commonAssets,
  notice,
  onChangePlayer,
  onOpenRanking,
  onStartRun,
  progress,
  runActive = false,
  syncPending = false,
}: TitleScreenProps) {
  const profile = progress.profile;
  const localBest = progress.localBestScores[progress.selectedDifficulty];
  const character = profile === null ? null : PLAYER_CHARACTERS[profile.characterId];

  return (
    <section className="screen-shell title-screen" data-testid="title-screen">
      <ScreenBackdrop
        className="screen-backdrop--tower-route"
        image={commonAssets?.towerBackdrop}
      />
      <header className="title-screen__brand">
        <AssetImage
          alt="기어라이트 타워 로고"
          className="title-screen__logo"
          url={commonAssets?.logo?.url}
        />
        <div className="title-screen__wordmark">
          <p className="eyebrow">별빛 오락실</p>
          <h1>기어라이트 타워</h1>
          <p>탑을 오르고 모든 라이벌을 이겨 보세요.</p>
        </div>
      </header>

      <div className="title-screen__guide">
        <AssetImage
          alt="별빛 부엉이 안내자"
          className="title-screen__owl"
          url={commonAssets?.owl.fullArt?.url}
        />
        <p>{profile === null ? '세 글자 이름을 등록하고 도전을 시작하세요.' : '다음 타워 도전이 준비됐어요.'}</p>
      </div>

      {notice !== null && <p className="notice" role="status">{notice}</p>}
      {syncPending && (
        <p className="notice" role="status">온라인 랭킹 동기화 대기 중</p>
      )}

      <section aria-label="플레이어 정보" className="title-screen__summary">
        <div className="title-screen__player">
          <span>플레이어</span>
          <strong>{profile?.initials ?? '신규 플레이어'}</strong>
          <small>{character?.name ?? '캐릭터 미선택'}</small>
        </div>
        <dl className="title-screen__stats">
          <div>
            <dt>난이도</dt>
            <dd>{DIFFICULTY_LABELS[progress.selectedDifficulty]}</dd>
          </div>
          <div>
            <dt>내 최고 기록</dt>
            <dd>{localBest === null ? '기록 없음' : SCORE_FORMATTER.format(localBest.score)}</dd>
          </div>
        </dl>
      </section>

      <nav aria-label="주요 메뉴" className="title-screen__actions">
        <button className="title-screen__action title-screen__action--start" onClick={onStartRun} type="button">
          {runActive ? '도전 계속' : '도전 시작'}
        </button>
        <button className="title-screen__action" onClick={onOpenRanking} type="button">
          랭킹
        </button>
        <button className="secondary-button title-screen__action" onClick={onChangePlayer} type="button">
          플레이어 변경
        </button>
      </nav>
    </section>
  );
}
