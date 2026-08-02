import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AI_FLOOR_PROFILES,
  createAiController,
} from '../../ai/index';
import type { Floor, MatchResult } from '../../app/app-route';
import { useMatchLoop } from '../../app/use-match-loop';
import { BattleCanvas } from '../../render/BattleCanvas';
import { BattleHud } from '../match/BattleHud';
import { InputResetBus } from '../match/input-reset-bus';
import { ItemControls } from '../match/ItemControls';
import { Joystick } from '../match/Joystick';
import { RotateButton } from '../match/RotateButton';
import { RowSelector } from '../match/RowSelector';
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
  const resetBus = useMemo(() => new InputResetBus(), []);
  const [rowSelectionActive, setRowSelectionActive] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const player = match.view.sides.player;
  const controlsActive = match.view.status === 'playing'
    && player.phase === 'active'
    && player.freezeTicks === 0
    && !player.topOut;

  const handleRowSelectionChange = useCallback((active: boolean) => {
    setRowSelectionActive(active);
    if (!active) setSelectedRow(null);
  }, []);

  useEffect(() => {
    if (controlsActive) return;
    resetBus.resetAll();
    handleRowSelectionChange(false);
  }, [controlsActive, handleRowSelectionChange, resetBus]);

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
          playerBoardOverlay={rowSelectionActive ? (
            <RowSelector
              board={player.board}
              dispatch={match.dispatch}
              onClose={() => handleRowSelectionChange(false)}
              onSelectedRowChange={setSelectedRow}
            />
          ) : undefined}
          selectedRow={selectedRow}
          view={match.view}
        />
      </div>

      <fieldset
        aria-label="게임 조작"
        className="match-controls"
        disabled={!controlsActive}
      >
        <ItemControls
          dispatch={match.dispatch}
          onRowSelectionChange={handleRowSelectionChange}
          player={player}
          rowSelectionActive={rowSelectionActive}
        />
        <div className="match-controls__movement">
          <Joystick onCommand={match.dispatch} resetBus={resetBus} />
          <RotateButton onCommand={match.dispatch} />
        </div>
      </fieldset>
    </section>
  );
}
