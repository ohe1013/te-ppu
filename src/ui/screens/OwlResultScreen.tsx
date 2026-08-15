import type {
  CommonAssets,
  FloorAssetBundle,
  HeroPortraitState,
  PlayerCharacterAssets,
} from '../../assets';
import type { MatchResult } from '../../app/app-route';
import type { PlayerCharacterDefinition } from '../../player';
import { SelectedPlayerIdentity } from '../characters/SelectedPlayerIdentity';
import { AssetImage } from '../match/AssetImage';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface OwlResultScreenProps {
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
  readonly onContinue: () => void;
  readonly onRetrySave: () => void;
  readonly player: PlayerCharacterDefinition;
  readonly playerAssets?: PlayerCharacterAssets;
  readonly result: MatchResult;
  readonly saveFailed: boolean;
  readonly savePending: boolean;
  readonly saveRetrying: boolean;
  readonly score: number;
}

export function OwlResultScreen({
  commonAssets,
  floorAssets,
  onContinue,
  onRetrySave,
  player,
  playerAssets,
  result,
  saveFailed,
  savePending,
  saveRetrying,
  score,
}: OwlResultScreenProps) {
  const won = result === 'win';
  const playerPortraitState: HeroPortraitState = result === 'win'
    ? 'win'
    : result === 'loss' ? 'loss' : 'idle';
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
        <SelectedPlayerIdentity
          assets={playerAssets}
          context="owl result"
          player={player}
          portraitState={playerPortraitState}
        />
        <p className="owl-result-screen__score" data-testid="owl-result-score">
          RUN SCORE {String(score).padStart(6, '0')}
        </p>
      </div>
      {savePending && <p className="notice" role="status">최종 점수 저장 중</p>}
      {saveFailed && (
        <div className="notice" role="alert">
          <p>최종 점수를 저장하지 못했습니다.</p>
          <button disabled={saveRetrying} type="button" onClick={onRetrySave}>
            {saveRetrying ? '저장 중' : '저장 다시 시도'}
          </button>
        </div>
      )}
      <div className="screen-actions">
        <button
          disabled={savePending || saveFailed || saveRetrying}
          type="button"
          onClick={onContinue}
        >
          {won ? '엔딩 보기' : '도전 종료'}
        </button>
      </div>
    </section>
  );
}
