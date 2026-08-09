import {
  FLOORS,
  getDifficultyProgress,
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
  readonly onSelectFloor: (floor: Floor) => void;
  readonly commonAssets?: CommonAssets | null;
}

export function TowerScreen({ commonAssets, notice, onSelectFloor, progress }: TowerScreenProps) {
  const activeProgress = getDifficultyProgress(progress, progress.selectedDifficulty);
  return (
    <section className="screen-shell tower-screen" data-testid="tower-screen">
      <ScreenBackdrop image={commonAssets?.towerBackdrop} />
      <ScreenBackdrop
        className="screen-backdrop--demon"
        image={commonAssets?.rivals['demon-king']?.fullArt}
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
        <p className="tower-screen__subtitle">태엽 부엉이와 함께 별빛 동력핵을 되찾으세요.</p>
      </div>
      {notice !== null && <p className="notice" role="status">{notice}</p>}
      <div aria-label="타워 층 선택" className="floor-list tower-route">
        <span aria-hidden="true" className="tower-route__rope" />
        {FLOORS.map((floor, index) => {
          const unlocked = floor <= activeProgress.highestUnlockedFloor;
          const cleared = activeProgress.clearedFloors[floor];
          const status = cleared ? '클리어 완료 · 재도전 가능' : unlocked ? '도전 가능' : '잠김';
          const statusId = `floor-${floor}-status`;
          return (
            <div
              className={`tower-node tower-node--${index % 2 === 0 ? 'left' : 'right'} ${
                cleared ? 'tower-node--cleared' : unlocked ? 'tower-node--open' : 'tower-node--locked'
              }`}
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
