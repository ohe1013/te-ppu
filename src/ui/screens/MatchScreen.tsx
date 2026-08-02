import { useMemo } from 'react';
import {
  AI_FLOOR_PROFILES,
  createAiController,
} from '../../ai/index';
import type { Floor, MatchResult } from '../../app/app-route';
import { useMatchLoop } from '../../app/use-match-loop';

export interface MatchScreenProps {
  readonly floor: Floor;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => void | Promise<void>;
}

export function MatchScreen({ floor, seed, onFinished }: MatchScreenProps) {
  const ai = useMemo(
    () => createAiController(AI_FLOOR_PROFILES[floor - 1]!, seed),
    [floor, seed],
  );
  const match = useMatchLoop({
    ai,
    config: { matchSeed: seed },
    onFinished,
  });

  return (
    <section
      className="screen-shell"
      data-floor={floor}
      data-testid="match-screen"
    >
      <p className="eyebrow">{floor}층 대전</p>
      <h1>대전 진행 중</h1>
      <p aria-live="polite" data-testid="match-status">{match.view.status}</p>
      <p data-testid="match-tick">{match.view.tick}</p>
    </section>
  );
}
