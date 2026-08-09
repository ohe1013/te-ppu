import type { CommonAssets, FloorAssetBundle } from '../../assets';
import { AssetImage } from '../match/AssetImage';
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
      <ScreenBackdrop className="screen-backdrop--demon" image={commonAssets?.rivals['demon-king']?.fullArt} />
      <ScreenBackdrop className="screen-backdrop--hero" image={commonAssets?.hero.fullArt} />
      <ScreenBackdrop className="screen-backdrop--owl" image={commonAssets?.owl.fullArt} />
      <div className="ending-screen__panel">
        <div className="ending-screen__mascot">
          <AssetImage
            alt="태엽 부엉이 환호"
            className="ending-screen__mascot-image"
            url={commonAssets?.owl.fullArt?.url}
          />
        </div>
        <p className="eyebrow">타워 정복</p>
        <h1>모든 층을 클리어했습니다</h1>
        <p>태엽 부엉이와 함께 별빛 동력핵을 되찾았습니다.</p>
      </div>
      <button type="button" onClick={onReturnToTower}>타워로 돌아가기</button>
    </section>
  );
}
