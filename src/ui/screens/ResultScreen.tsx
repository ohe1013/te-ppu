import type { Floor, MatchResult } from '../../app/app-route';
import type { LoadedImageRef, PortraitState, RivalCharacterAssets } from '../../assets';
import type { FloorEncounter, FloorSeriesState, ProgressState } from '../../progression/index';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { ScreenBackdrop } from './ScreenBackdrop';

const RESULT_LABELS: Record<MatchResult, string> = {
  win: '승리',
  loss: '패배',
  draw: '무승부',
};

export interface ResultScreenProps {
  readonly floor: Floor;
  readonly encounter: FloorEncounter;
  readonly series: FloorSeriesState;
  readonly seriesComplete: boolean;
  readonly rival?: RivalCharacterAssets;
  readonly background?: LoadedImageRef;
  readonly progress: ProgressState;
  readonly result: MatchResult;
  readonly saveFailed: boolean;
  readonly savePending: boolean;
  readonly saveRetrying: boolean;
  readonly onContinue: () => void;
  readonly onRetry: () => void;
  readonly onRetrySave: () => void;
}

export function ResultScreen({
  background,
  encounter,
  floor,
  onContinue,
  onRetry,
  onRetrySave,
  progress,
  result,
  saveFailed,
  savePending,
  saveRetrying,
  series,
  seriesComplete,
  rival,
}: ResultScreenProps) {
  const completedWins = result === 'win' ? series.wins + 1 : series.wins;
  const portraitState: PortraitState = result === 'win'
    ? 'defeat'
    : result === 'loss' ? 'smug' : 'idle';
  const continueLabel = result !== 'win'
    ? '계속'
    : seriesComplete ? (floor === 5 ? '탑으로' : '다음 층') : '다음 상대';

  return (
    <section
      className={`screen-shell result-screen result-screen--${result}`}
      data-series-complete={seriesComplete ? 'true' : 'false'}
      data-testid="result-screen"
    >
      <ScreenBackdrop image={background} />
      <div className="result-screen__panel">
        <div className="result-screen__rival">
          <CharacterPortrait
            alt={`${encounter.displayName} ${portraitState} 초상`}
            image={rival?.portraits[portraitState]}
            state={portraitState}
          />
          <div>
            <p className="eyebrow">{floor}층 · 상대 {encounter.index + 1}/3</p>
            <h1>{RESULT_LABELS[result]}</h1>
            <p className="result-screen__rival-name">{encounter.displayName}</p>
          </div>
        </div>
        <p className="result-screen__line">
          {result === 'win' ? encounter.winLine : encounter.lossLine}
        </p>
        <p className="result-screen__progress">
          층 승리 {completedWins}/3 · 최고 해금 {progress.highestUnlockedFloor}층
        </p>
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
        <button disabled={savePending} type="button" onClick={onContinue}>{continueLabel}</button>
      </div>
    </section>
  );
}
