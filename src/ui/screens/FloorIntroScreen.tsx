import { getAiFloorProfile } from '../../ai/index';
import type { Floor } from '../../app/app-route';

export interface FloorIntroScreenProps {
  readonly floor: Floor;
  readonly onBack: () => void;
  readonly onStart: () => void;
}

export function FloorIntroScreen({ floor, onBack, onStart }: FloorIntroScreenProps) {
  const profile = getAiFloorProfile(floor);
  const reactionMs = Math.round(profile.reactionTicks * (1000 / 60));

  return (
    <section className="screen-shell" data-testid="floor-intro-screen">
      <p className="eyebrow">{floor}층 상대</p>
      <h1>{floor}층 대전 준비</h1>
      <p>AI 반응 간격: {reactionMs}ms</p>
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onBack}>타워로</button>
        <button type="button" onClick={onStart}>대전 시작</button>
      </div>
    </section>
  );
}
