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
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
};

const SCORE_FORMATTER = new Intl.NumberFormat('en-US');

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
          alt="Gearlight Tower logo"
          className="title-screen__logo"
          url={commonAssets?.logo?.url}
        />
        <div className="title-screen__wordmark">
          <p className="eyebrow">STARLIGHT ARCADE</p>
          <h1>GEARLIGHT TOWER</h1>
          <p>Climb the tower. Outplay every rival.</p>
        </div>
      </header>

      <div className="title-screen__guide">
        <AssetImage
          alt="Starlight owl guide"
          className="title-screen__owl"
          url={commonAssets?.owl.fullArt?.url}
        />
        <p>{profile === null ? 'Register your three-letter arcade name to begin.' : 'Your next tower run is ready.'}</p>
      </div>

      {notice !== null && <p className="notice" role="status">{notice}</p>}
      {syncPending && (
        <p className="notice" role="status">ONLINE RANKING SYNC PENDING</p>
      )}

      <section aria-label="Player summary" className="title-screen__summary">
        <div className="title-screen__player">
          <span>PLAYER</span>
          <strong>{profile?.initials ?? 'NEW PLAYER'}</strong>
          <small>{character?.name ?? 'NO HERO SELECTED'}</small>
        </div>
        <dl className="title-screen__stats">
          <div>
            <dt>DIFFICULTY</dt>
            <dd>{DIFFICULTY_LABELS[progress.selectedDifficulty]}</dd>
          </div>
          <div>
            <dt>LOCAL BEST</dt>
            <dd>{localBest === null ? 'NO LOCAL SCORE' : SCORE_FORMATTER.format(localBest.score)}</dd>
          </div>
        </dl>
      </section>

      <nav aria-label="Primary actions" className="title-screen__actions">
        <button className="title-screen__action title-screen__action--start" onClick={onStartRun} type="button">
          {runActive ? '도전 계속' : 'START RUN'}
        </button>
        <button className="title-screen__action" onClick={onOpenRanking} type="button">
          RANKING
        </button>
        <button className="secondary-button title-screen__action" onClick={onChangePlayer} type="button">
          PLAYER CHANGE
        </button>
      </nav>
    </section>
  );
}
