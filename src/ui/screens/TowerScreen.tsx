import {
  DIFFICULTIES,
  FLOORS,
  getDifficultyProgress,
  type Difficulty,
  type Floor,
  type ProgressState,
  getFloorEncounters,
} from '../../progression/index';
import type { CommonAssets } from '../../assets';
import { AssetImage } from '../match/AssetImage';
import { CharacterStrip } from '../characters/CharacterStrip';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface TowerScreenProps {
  readonly progress: ProgressState;
  readonly notice: string | null;
  readonly onBack?: () => void;
  readonly onSelectFloor: (floor: Floor) => void;
  readonly onSelectDifficulty?: (difficulty: Difficulty) => void;
  readonly commonAssets?: CommonAssets | null;
  readonly difficultySelectionLocked?: boolean;
  readonly requiredFloor: Floor;
  readonly runActive: boolean;
  readonly runScore: number;
}

const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
};

export function TowerScreen({
  commonAssets,
  difficultySelectionLocked = false,
  notice,
  onBack = () => undefined,
  onSelectDifficulty = () => undefined,
  onSelectFloor,
  progress,
  requiredFloor,
  runActive,
  runScore,
}: TowerScreenProps) {
  const activeProgress = getDifficultyProgress(progress, progress.selectedDifficulty);
  return (
    <section
      className="screen-shell tower-screen"
      data-difficulty={progress.selectedDifficulty}
      data-testid="tower-screen"
    >
      <ScreenBackdrop
        className="screen-backdrop--demon"
        image={commonAssets?.rivals?.['demon-king']?.fullArt}
      />
      <div className="tower-screen__header">
        <div className="tower-screen__brand">
          <span className="tower-screen__mascot">
            <AssetImage
              alt="태엽 부엉이 안내자"
              className="tower-screen__mascot-image"
              url={commonAssets?.owl.fullArt?.url}
            />
          </span>
          <div>
            <p className="eyebrow">THE GEARLIGHT TOWER</p>
            <h1>꼭대기까지 올라가자!</h1>
          </div>
        </div>
        <button className="secondary-button tower-screen__back" onClick={onBack} type="button">
          처음으로
        </button>
        <p className="tower-screen__subtitle">태엽 부엉이와 함께 별빛 동력핵을 되찾으세요.</p>
      </div>
      {notice !== null && <p className="notice" role="status">{notice}</p>}
      {runActive && (
        <p className="tower-run-status" data-testid="tower-run-status">
          RUN ACTIVE · NEXT {requiredFloor}F · SCORE {String(runScore).padStart(6, '0')}
        </p>
      )}
      {difficultySelectionLocked && (
        <p className="tower-run-lock-notice" role="status">RUN DIFFICULTY LOCKED</p>
      )}
      <fieldset aria-label="난이도 선택" className="difficulty-selector">
        <legend>난이도</legend>
        <div className="difficulty-selector__options">
          {DIFFICULTIES.map((difficulty) => {
            const unlocked = progress.unlockedDifficulties[difficulty];
            return (
              <button
                aria-label={DIFFICULTY_LABELS[difficulty]}
                aria-pressed={progress.selectedDifficulty === difficulty}
                className={`difficulty-selector__option difficulty-selector__option--${difficulty}`}
                data-difficulty={difficulty}
                disabled={!unlocked || difficultySelectionLocked}
                key={difficulty}
                onClick={() => onSelectDifficulty(difficulty)}
                type="button"
              >
                {DIFFICULTY_LABELS[difficulty]}
                {!unlocked && <small>LOCKED</small>}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div
        aria-label="타워 층 선택"
        className="floor-list tower-route tower-route--ascending"
        data-testid="tower-route"
      >
        <ScreenBackdrop
          className="screen-backdrop--tower-route"
          image={commonAssets?.towerBackdrop}
        />
        <span aria-hidden="true" className="tower-route__shaft" />
        {FLOORS.map((floor, index) => {
          const historicallyUnlocked = floor <= activeProgress.highestUnlockedFloor;
          const unlocked = historicallyUnlocked && (!runActive || floor === requiredFloor);
          const cleared = activeProgress.clearedFloors[floor];
          const status = runActive
            ? floor === requiredFloor ? '현재 도전 층' : `진행 순서 잠김 · 다음 ${requiredFloor}층`
            : cleared ? '클리어 완료 · 재도전 가능' : unlocked ? '도전 가능' : '잠김';
          const statusId = `floor-${floor}-status`;
          return (
            <div
              className={`tower-node tower-node--${index % 2 === 0 ? 'left' : 'right'} ${
                cleared ? 'tower-node--cleared' : unlocked ? 'tower-node--open' : 'tower-node--locked'
              }`}
              data-floor={floor}
              key={floor}
            >
              <span aria-hidden="true" className="tower-node__marker">{String(floor).padStart(2, '0')}</span>
              <div className="tower-node__card">
                <div className="tower-node__title">
                  <span>{floor === 5 ? '마왕의 왕좌' : `${floor}층 관문`}</span>
                  <small>3연전</small>
                </div>
                <CharacterStrip
                  activeIndex={0}
                  encounters={getFloorEncounters(floor)}
                  rivals={commonAssets?.rivals ?? {}}
                  unlocked={unlocked}
                />
                <button
                  aria-describedby={statusId}
                  aria-label={`${floor}층 선택`}
                  className="floor-card"
                  disabled={!unlocked}
                  onClick={() => onSelectFloor(floor)}
                  type="button"
                >
                  <span>{floor}층 선택</span>
                  <small id={statusId}>{status}</small>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
