import type { Floor, MatchResult } from '../../app/app-route';
import type { ProgressState } from '../../progression/index';
import type { FloorAssetBundle } from '../../assets';
import { ScreenBackdrop } from './ScreenBackdrop';

const RESULT_LABELS: Record<MatchResult, string> = {
  win: '승리',
  loss: '패배',
  draw: '무승부',
};

export interface ResultScreenProps {
  readonly floor: Floor;
  readonly progress: ProgressState;
  readonly result: MatchResult;
  readonly saveFailed: boolean;
  readonly savePending: boolean;
  readonly saveRetrying: boolean;
  readonly onContinue: () => void;
  readonly onRetry: () => void;
  readonly onRetrySave: () => void;
  readonly floorAssets?: FloorAssetBundle | null;
}

export function ResultScreen({
  floor,
  floorAssets,
  onContinue,
  onRetry,
  onRetrySave,
  progress,
  result,
  saveFailed,
  savePending,
  saveRetrying,
}: ResultScreenProps) {
  return (
    <section className={`screen-shell result-screen result-screen--${result}`} data-testid="result-screen">
      <ScreenBackdrop image={floorAssets?.background} />
      <ScreenBackdrop className="screen-backdrop--art" image={floorAssets?.fullArt} />
      <div className="result-screen__panel">
        <p className="eyebrow">{floor}층 결과</p>
        <h1>{RESULT_LABELS[result]}</h1>
        <p className="result-screen__progress">최고 해금 층: {progress.highestUnlockedFloor}</p>
      </div>
      {savePending && <p className="notice" role="status">진행 상황 저장 중…</p>}
      {saveFailed && (
        <div className="notice" role="alert">
          <p>진행 상황을 저장하지 못했습니다.</p>
          <button disabled={saveRetrying} type="button" onClick={onRetrySave}>
            {saveRetrying ? '저장 중…' : '저장 다시 시도'}
          </button>
        </div>
      )}
      <div className="screen-actions">
        <button
          className="secondary-button"
          disabled={savePending}
          type="button"
          onClick={onRetry}
        >
          다시 대전
        </button>
        <button disabled={savePending} type="button" onClick={onContinue}>계속</button>
      </div>
    </section>
  );
}
