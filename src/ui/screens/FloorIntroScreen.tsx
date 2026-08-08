import { getAiFloorProfile } from '../../ai/index';
import type { Floor } from '../../app/app-route';
import type { FloorAssetBundle } from '../../assets';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface FloorIntroScreenProps {
  readonly floor: Floor;
  readonly onBack: () => void;
  readonly onStart: () => void;
  readonly floorAssets?: FloorAssetBundle | null;
}

export function FloorIntroScreen({ floor, floorAssets, onBack, onStart }: FloorIntroScreenProps) {
  const profile = getAiFloorProfile(floor);
  const reactionMs = Math.round(profile.reactionTicks * (1000 / 60));

  return (
    <section className="screen-shell floor-intro-screen" data-testid="floor-intro-screen">
      <ScreenBackdrop image={floorAssets?.background} />
      <ScreenBackdrop className="screen-backdrop--art" image={floorAssets?.fullArt} />
      <div className="character-intro-panel">
        <p className="eyebrow">{floor}층 라이벌</p>
        <h1>{floor}층 대전 준비</h1>
        <p className="character-intro-panel__speech">"이번엔 내 블록이 먼저야!"</p>
        <p className="character-intro-panel__telemetry">AI 반응 간격: {reactionMs}ms</p>
      </div>
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onBack}>타워로</button>
        <button type="button" onClick={onStart}>대전 시작</button>
      </div>
    </section>
  );
}
