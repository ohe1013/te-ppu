import type { CommonAssets, FloorAssetBundle } from '../../assets';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface EndingScreenProps {
  readonly onReturnToTower: () => void;
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
}

export function EndingScreen({ commonAssets, floorAssets, onReturnToTower }: EndingScreenProps) {
  return (
    <section className="screen-shell ending-screen" data-testid="ending-screen">
      <ScreenBackdrop image={floorAssets?.background} />
      <ScreenBackdrop className="screen-backdrop--art" image={floorAssets?.fullArt} />
      <ScreenBackdrop className="screen-backdrop--hero" image={commonAssets?.hero.fullArt} />
      <ScreenBackdrop className="screen-backdrop--owl" image={commonAssets?.owl.fullArt} />
      <div className="ending-screen__panel">
        <p className="eyebrow">타워 정복</p>
        <h1>모든 층을 클리어했습니다</h1>
        <p>세 번의 대전을 완주했습니다. 언제든 다시 도전할 수 있습니다.</p>
      </div>
      <button type="button" onClick={onReturnToTower}>타워로 돌아가기</button>
    </section>
  );
}
