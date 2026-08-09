import type { CommonAssets, FloorAssetBundle } from '../../assets';
import { nextDifficulty, type Difficulty, type ProgressState } from '../../progression';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface EndingScreenProps {
  readonly onReturnToTower: () => void;
  readonly difficulty?: Difficulty;
  readonly unlockedDifficulties: ProgressState['unlockedDifficulties'];
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
}

export function EndingScreen({
  commonAssets,
  difficulty = 'easy',
  floorAssets,
  onReturnToTower,
  unlockedDifficulties,
}: EndingScreenProps) {
  const next = nextDifficulty(difficulty);
  const unlockedNext = next !== null && unlockedDifficulties[next] ? next : null;
  return (
    <section
      className="screen-shell ending-screen"
      data-next-difficulty={unlockedNext ?? 'none'}
      data-testid="ending-screen"
    >
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
        <p data-testid="ending-unlock">
          {unlockedNext === null
            ? 'HARD 최종 난이도 정복 완료'
            : `${unlockedNext.toUpperCase()} 난이도 해금`}
        </p>
      </div>
      <button type="button" onClick={onReturnToTower}>
        {unlockedNext === null ? '타워로 돌아가기' : `${unlockedNext.toUpperCase()} 선택하러 가기`}
      </button>
    </section>
  );
}
