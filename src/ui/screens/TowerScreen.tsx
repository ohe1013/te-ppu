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

const FLOOR_OPPONENTS: Readonly<Record<Floor, string>> = {
  1: '기어 창고장',
  2: '거품 연금술사',
  3: '구름 경비대장',
  4: '뒤틀린 기술자',
  5: '마왕의 왕좌',
};

export function TowerScreen({ commonAssets, notice, onSelectFloor, progress }: TowerScreenProps) {
  return (
    <section className="screen-shell tower-screen" data-testid="tower-screen">
      <ScreenBackdrop image={commonAssets?.towerBackdrop} />
      <div className="tower-screen__header">
        <p className="eyebrow">PvE TOWER RUN</p>
        <h1>꼭대기까지 올라가자!</h1>
        <p className="tower-screen__subtitle">층마다 기다리는 라이벌을 넘어 타워의 심장을 수리하세요.</p>
      </div>
      {notice !== null && <p className="notice" role="status">{notice}</p>}
      <div aria-label="타워 층 선택" className="floor-list tower-route">
        <span aria-hidden="true" className="tower-route__rope" />
        {FLOORS.map((floor, index) => {
          const unlocked = floor <= progress.highestUnlockedFloor;
          const cleared = progress.clearedFloors[floor];
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
                <span className="tower-node__opponent">{FLOOR_OPPONENTS[floor]}</span>
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
