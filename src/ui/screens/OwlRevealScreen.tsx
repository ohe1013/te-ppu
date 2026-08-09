import type { CommonAssets, FloorAssetBundle } from '../../assets';
import type { Difficulty } from '../../progression';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface OwlRevealScreenProps {
  readonly commonAssets?: CommonAssets | null;
  readonly difficulty: Difficulty;
  readonly floorAssets?: FloorAssetBundle | null;
  readonly onBack: () => void;
  readonly onStart: () => void;
}

export function OwlRevealScreen({
  commonAssets,
  difficulty,
  floorAssets,
  onBack,
  onStart,
}: OwlRevealScreenProps) {
  return (
    <section className="screen-shell owl-reveal-screen" data-testid="owl-reveal-screen">
      <ScreenBackdrop image={floorAssets?.background} />
      <ScreenBackdrop
        className="screen-backdrop--demon"
        image={commonAssets?.rivals?.['demon-king']?.fullArt}
      />
      <div className="owl-reveal-screen__panel">
        <div className="owl-reveal-screen__art">
          <AssetImage
            alt="탑의 설계자"
            url={commonAssets?.owl?.fullArt?.url}
          />
        </div>
        <p className="eyebrow">HIDDEN BOSS · {difficulty.toUpperCase()}</p>
        <h1>부엉이의 진짜 얼굴</h1>
        <p className="owl-reveal-screen__title">탑의 설계자</p>
        <p className="owl-reveal-screen__speech">
          악마왕은 미끼였을 뿐이야. 내가 모든 층의 태엽을 감고 있었지.
        </p>
        <p className="owl-reveal-screen__hint">
          꼭대기의 마지막 문을 열려면, 진짜 주인을 쓰러뜨려야 한다.
        </p>
      </div>
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onBack}>탑으로</button>
        <button type="button" onClick={onStart}>부엉이와 대결</button>
      </div>
    </section>
  );
}
