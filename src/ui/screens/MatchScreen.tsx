import { useMemo } from 'react';
import {
  AI_FLOOR_PROFILES,
  createAiController,
} from '../../ai/index';
import type { Floor, MatchResult } from '../../app/app-route';
import { useMatchLoop } from '../../app/use-match-loop';
import { BattleCanvas } from '../../render/BattleCanvas';
import { BattleHud } from '../match/BattleHud';
import '../match/match-layout.css';

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
      className="screen-shell match-screen"
      data-floor={floor}
      data-testid="match-screen"
    >
      <header className="match-header">
        <div>
          <p className="eyebrow">{floor}층 대전</p>
          <h1>대전 진행 중</h1>
        </div>
        <div className="match-meta">
          <span aria-live="polite" data-testid="match-status">
            {match.view.status}
          </span>
          <span data-testid="match-tick">{match.view.tick}</span>
        </div>
      </header>

      <div className="battle-hud-pair">
        <BattleHud
          label="PLAYER"
          model={match.view.sides.player}
          side="player"
        />
        <BattleHud
          label="RIVAL"
          model={match.view.sides.opponent}
          side="opponent"
        />
      </div>

      <div className="battle-stage">
        <BattleCanvas
          events={match.events}
          selectedRow={null}
          view={match.view}
        />
      </div>
    </section>
  );
}
