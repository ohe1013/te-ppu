import type { CommonAssets, FloorAssetBundle } from '../../assets';
import type { MatchResult } from '../../app/app-route';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface OwlResultScreenProps {
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
  readonly onContinue: () => void;
  readonly result: MatchResult;
}

export function OwlResultScreen({
  commonAssets,
  floorAssets,
  onContinue,
  result,
}: OwlResultScreenProps) {
  const won = result === 'win';
  return (
    <section
      className={`screen-shell owl-result-screen owl-result-screen--${result}`}
      data-testid="owl-result-screen"
    >
      <ScreenBackdrop image={floorAssets?.background} />
      <div className="owl-result-screen__panel">
        <div className="owl-result-screen__portrait">
          <AssetImage alt="탑의 설계자" url={commonAssets?.owl?.fullArt?.url} />
        </div>
        <p className="eyebrow">HIDDEN BOSS</p>
        <h1>{won ? '설계자 격파' : '부엉이의 역습'}</h1>
        <p>
          {won
            ? '부엉이의 태엽이 멎고, 잠겨 있던 다음 난이도의 문이 열린다.'
            : '부엉이가 다시 탑의 태엽을 감았다. 설계자의 방으로 돌아가자.'}
        </p>
      </div>
      <div className="screen-actions">
        <button type="button" onClick={onContinue}>
          {won ? '엔딩 보기' : '부엉이와 다시 대결'}
        </button>
      </div>
    </section>
  );
}
