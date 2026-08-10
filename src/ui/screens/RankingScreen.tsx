import { PLAYER_CHARACTERS, type PlayerCharacterId } from '../../player';
import { DIFFICULTIES, type Difficulty, type Floor } from '../../progression';

export interface RankingEntry {
  readonly rank: number | '?';
  readonly badge?: 'LOCAL';
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly score: number;
  readonly reachedFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
}

export type RankingStatus = 'ready' | 'local' | 'loading' | 'unavailable';

export interface RankingScreenProps {
  readonly difficulty: Difficulty;
  readonly entries: readonly RankingEntry[];
  readonly onBack: () => void;
  readonly onSelectDifficulty: (difficulty: Difficulty) => void;
  readonly status: RankingStatus;
  readonly syncPending: boolean;
  readonly unlockedDifficulties: Readonly<Record<Difficulty, boolean>>;
}

const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
};

const SCORE_FORMATTER = new Intl.NumberFormat('en-US');

function reachedLabel(entry: RankingEntry): string {
  return entry.owlDefeated ? 'OWL DEFEATED' : `FLOOR ${entry.reachedFloor}`;
}

export function RankingScreen({
  difficulty,
  entries,
  onBack,
  onSelectDifficulty,
  status,
  syncPending,
  unlockedDifficulties,
}: RankingScreenProps) {
  const showTable = status === 'ready'
    || status === 'local'
    || (status === 'unavailable' && entries.length > 0);

  return (
    <section
      className="screen-shell ranking-screen"
      data-difficulty={difficulty}
      data-testid="ranking-screen"
    >
      <header className="ranking-screen__header">
        <p className="eyebrow">ARCADE RECORDS</p>
        <h1>TOP 20</h1>
        <p>Best tower runs by difficulty.</p>
      </header>

      <div aria-label="Ranking difficulty" className="ranking-tabs" role="tablist">
        {DIFFICULTIES.map((tabDifficulty) => {
          const unlocked = unlockedDifficulties[tabDifficulty];
          const label = DIFFICULTY_LABELS[tabDifficulty];
          return (
            <button
              aria-label={unlocked ? label : `${label} LOCKED`}
              aria-selected={difficulty === tabDifficulty}
              className={`ranking-tabs__tab ranking-tabs__tab--${tabDifficulty}`}
              disabled={!unlocked}
              key={tabDifficulty}
              onClick={() => onSelectDifficulty(tabDifficulty)}
              role="tab"
              type="button"
            >
              {label}
              {!unlocked && <small>LOCKED</small>}
            </button>
          );
        })}
      </div>

      {status === 'local' && (
        <p className="ranking-screen__state ranking-screen__state--local">LOCAL RECORDS</p>
      )}
      {syncPending && (
        <p className="ranking-screen__sync" role="status">ONLINE RANKING SYNC PENDING</p>
      )}
      {status === 'loading' && (
        <p className="ranking-screen__state" role="status">LOADING RANKING</p>
      )}
      {status === 'unavailable' && (
        <p className="ranking-screen__state ranking-screen__state--error" role="alert">
          ONLINE RANKING UNAVAILABLE
        </p>
      )}

      {showTable && (
        <div className="ranking-table-wrap">
          <table aria-label="TOP 20 ranking" className="ranking-table">
            <thead>
              <tr>
                <th scope="col">RANK</th>
                <th scope="col">INITIALS</th>
                <th scope="col">CHARACTER</th>
                <th scope="col">SCORE</th>
                <th scope="col">REACHED</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td className="ranking-table__empty" colSpan={5}>NO SCORES YET</td>
                </tr>
              ) : entries.map((entry, index) => (
                <tr data-character-id={entry.characterId} key={`${entry.rank}-${entry.initials}-${entry.score}-${index}`}>
                  <td>{entry.rank}</td>
                  <td>
                    <strong>{entry.initials}</strong>
                    {entry.badge !== undefined && <small>{entry.badge}</small>}
                  </td>
                  <td>{PLAYER_CHARACTERS[entry.characterId].name}</td>
                  <td>{SCORE_FORMATTER.format(entry.score)}</td>
                  <td>
                    <span>{reachedLabel(entry)}</span>
                    <small>{entry.encountersWon} WINS</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="secondary-button ranking-screen__back" onClick={onBack} type="button">
        BACK
      </button>
    </section>
  );
}
