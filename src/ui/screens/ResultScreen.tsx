import type { Floor, MatchResult } from '../../app/app-route';
import type { ProgressState } from '../../progression/index';

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
  readonly saveRetrying: boolean;
  readonly onContinue: () => void;
  readonly onRetry: () => void;
  readonly onRetrySave: () => void;
}

export function ResultScreen({
  floor,
  onContinue,
  onRetry,
  onRetrySave,
  progress,
  result,
  saveFailed,
  saveRetrying,
}: ResultScreenProps) {
  return (
    <section className="screen-shell" data-testid="result-screen">
      <p className="eyebrow">{floor}층 결과</p>
      <h1>{RESULT_LABELS[result]}</h1>
      <p>최고 해금 층: {progress.highestUnlockedFloor}</p>
      {saveFailed && (
        <div className="notice" role="alert">
          <p>진행 상황을 저장하지 못했습니다.</p>
          <button disabled={saveRetrying} type="button" onClick={onRetrySave}>
            {saveRetrying ? '저장 중…' : '저장 다시 시도'}
          </button>
        </div>
      )}
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onRetry}>다시 대전</button>
        <button type="button" onClick={onContinue}>계속</button>
      </div>
    </section>
  );
}
