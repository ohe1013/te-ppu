import {
  FLOORS,
  type Floor,
  type ProgressState,
} from '../../progression/index';
import type { CommonAssets } from '../../assets';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface TowerScreenProps {
  readonly progress: ProgressState;
  readonly notice: string | null;
  readonly onSelectFloor: (floor: Floor) => void;
  readonly commonAssets?: CommonAssets | null;
}

export function TowerScreen({ commonAssets, notice, onSelectFloor, progress }: TowerScreenProps) {
  return (
    <section className="screen-shell" data-testid="tower-screen">
      <ScreenBackdrop image={commonAssets?.towerBackdrop} />
      <p className="eyebrow">PvE 타워</p>
      <h1>도전할 층을 선택하세요</h1>
      {notice !== null && <p className="notice" role="status">{notice}</p>}
      <div className="floor-list">
        {FLOORS.map((floor) => {
          const unlocked = floor <= progress.highestUnlockedFloor;
          const cleared = progress.clearedFloors[floor];
          const status = cleared ? '클리어 완료 · 재도전 가능' : unlocked ? '도전 가능' : '잠김';
          const statusId = `floor-${floor}-status`;
          return (
            <button
              aria-describedby={statusId}
              aria-label={`${floor}층 선택`}
              className="floor-card"
              disabled={!unlocked}
              key={floor}
              onClick={() => onSelectFloor(floor)}
              type="button"
            >
              <span>{floor}층 선택</span>
              <small id={statusId}>{status}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
