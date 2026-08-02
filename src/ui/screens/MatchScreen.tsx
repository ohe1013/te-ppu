import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AI_FLOOR_PROFILES,
  createAiController,
} from '../../ai/index';
import type { Floor, MatchResult } from '../../app/app-route';
import {
  useMatchLoop,
  type MatchLoopView,
  type UseMatchLoopOptions,
} from '../../app/use-match-loop';
import type { GameCommand, GameEvent, MatchStatus } from '../../core/index';
import { createAppLifecycleCoordinator } from '../../platform/app-lifecycle';
import type { AudioPort, SoundCue } from '../../platform/audio-port';
import type { HapticType, PlatformPort } from '../../platform/platform-port';
import { createWebAudioPort } from '../../platform/web-audio-port';
import type { ProgressState } from '../../progression/index';
import { BattleCanvas } from '../../render/BattleCanvas';
import { BattleHud } from '../match/BattleHud';
import { ExitConfirmation } from '../match/ExitConfirmation';
import { InputResetBus } from '../match/input-reset-bus';
import { ItemControls } from '../match/ItemControls';
import { Joystick } from '../match/Joystick';
import { ResumeCountdown } from '../match/ResumeCountdown';
import { RotateButton } from '../match/RotateButton';
import { RowSelector } from '../match/RowSelector';
import { SettingsPanel } from '../match/SettingsPanel';
import '../match/match-layout.css';

export interface MatchScreenProps {
  readonly audioPort?: AudioPort;
  readonly floor: Floor;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => void | Promise<void>;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
  readonly useMatchLoopImpl?: MatchLoopHook;
}

export type MatchLoopHook = (options: UseMatchLoopOptions) => MatchLoopView;

function cueForEvent(event: GameEvent, status: MatchStatus): SoundCue | null {
  if (event.type === 'piece-locked' || event.type === 'garbage-landed') return 'land';
  if (event.type === 'lines-cleared') return 'clear';
  if (event.type === 'attack-sent') return 'attack';
  if (
    event.type === 'item-acquired'
    || event.type === 'item-used'
    || event.type === 'freeze-applied'
  ) return 'item';
  if (event.type === 'match-ended') return status === 'player-won' ? 'win' : 'loss';
  if (event.type === 'top-out') return 'loss';
  return null;
}

function hapticForEvent(event: GameEvent, status: MatchStatus): HapticType | null {
  if (event.type === 'piece-locked' && event.side === 'player') return 'tickWeak';
  if (event.type === 'lines-cleared' && event.side === 'player') return 'tap';
  if (event.type === 'attack-sent') return event.side === 'player' ? 'success' : 'error';
  if (event.type === 'item-acquired' || event.type === 'item-used') {
    return event.side === 'player' ? 'tap' : null;
  }
  if (event.type === 'freeze-applied') return event.side === 'player' ? 'error' : 'success';
  if (event.type === 'top-out' && event.side === 'player') return 'error';
  if (event.type === 'match-ended') return status === 'player-won' ? 'success' : 'error';
  return null;
}

function ignoreEffect(operation: () => Promise<void>): void {
  try {
    void operation().catch(() => undefined);
  } catch {
    // Platform feedback is optional and must not interrupt the match.
  }
}

export function MatchScreen({
  audioPort,
  floor,
  onFinished,
  onRetrySettingsSave,
  onSettingsChange,
  platform,
  seed,
  settings,
  settingsSaveFailed,
  useMatchLoopImpl = useMatchLoop,
}: MatchScreenProps) {
  const ai = useMemo(
    () => createAiController(AI_FLOOR_PROFILES[floor - 1]!, seed),
    [floor, seed],
  );
  const match = useMatchLoopImpl({
    ai,
    config: { matchSeed: seed },
    onFinished,
  });
  const resetBus = useMemo(() => new InputResetBus(), []);
  const audio = useMemo(
    () => audioPort ?? createWebAudioPort({ enabled: settings.soundEnabled }),
    [audioPort],
  );
  const [rowSelectionActive, setRowSelectionActive] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const processedEventBatchRef = useRef<readonly GameEvent[] | null>(null);

  const handleRowSelectionChange = useCallback((active: boolean) => {
    setRowSelectionActive(active);
    if (!active) setSelectedRow(null);
  }, []);

  const resetEveryInput = useCallback(() => {
    resetBus.resetAll();
    handleRowSelectionChange(false);
  }, [handleRowSelectionChange, resetBus]);

  useEffect(() => {
    audio.setEnabled(settings.soundEnabled);
  }, [audio, settings.soundEnabled]);

  useEffect(() => {
    const lifecycle = createAppLifecycleCoordinator({
      audio,
      onCountdownChange: setResumeCountdown,
      resetAll: resetEveryInput,
      setPaused: match.setPaused,
    });
    return () => lifecycle.destroy();
  }, [audio, match.setPaused, resetEveryInput]);

  useEffect(() => () => {
    void audio.destroy();
  }, [audio]);

  useEffect(() => {
    if (processedEventBatchRef.current === match.events) return;
    processedEventBatchRef.current = match.events;
    const playedCues = new Set<SoundCue>();
    const sentHaptics = new Set<HapticType>();
    for (const event of match.events) {
      if (settings.soundEnabled) {
        const cue = cueForEvent(event, match.view.status);
        if (cue !== null && !playedCues.has(cue)) {
          playedCues.add(cue);
          try {
            audio.play(cue);
          } catch {
            // Audio ports are optional and isolated from gameplay.
          }
        }
      }
      if (settings.hapticsEnabled) {
        const haptic = hapticForEvent(event, match.view.status);
        if (haptic !== null && !sentHaptics.has(haptic)) {
          sentHaptics.add(haptic);
          ignoreEffect(() => platform.haptic(haptic));
        }
      }
    }
  }, [audio, match.events, match.view.status, platform, settings]);

  const dispatch = useCallback((command: GameCommand) => {
    match.dispatch(command);
    if (!settings.soundEnabled) return;
    const cue = command.type === 'move'
      ? 'move'
      : command.type === 'rotate-clockwise' ? 'rotate' : null;
    if (cue !== null) {
      try {
        audio.play(cue);
      } catch {
        // A control sound never owns command delivery.
      }
    }
  }, [audio, match.dispatch, settings.soundEnabled]);

  const player = match.view.sides.player;
  const controlsActive = match.view.status === 'playing'
    && player.phase === 'active'
    && player.freezeTicks === 0
    && !player.topOut
    && !exitOpen
    && resumeCountdown === null;

  useEffect(() => {
    if (controlsActive) return;
    resetEveryInput();
  }, [controlsActive, resetEveryInput]);

  function openExitConfirmation(): void {
    resetEveryInput();
    match.setPaused('exit-confirmation', true);
    setExitOpen(true);
  }

  function cancelExitConfirmation(): void {
    setExitOpen(false);
    match.setPaused('exit-confirmation', false);
  }

  function updateSoundEnabled(enabled: boolean): void {
    audio.setEnabled(enabled);
    if (enabled) ignoreEffect(() => audio.unlock());
  }

  function unlockAudio(): void {
    ignoreEffect(() => audio.unlock());
  }

  return (
    <section
      className="screen-shell match-screen"
      data-floor={floor}
      data-testid="match-screen"
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') unlockAudio();
      }}
      onPointerDownCapture={unlockAudio}
    >
      <header className="match-header">
        <div>
          <p className="eyebrow">{floor}층 대전</p>
          <h1>대전 진행 중</h1>
        </div>
        <div className="match-header__actions">
          <div className="match-meta">
            <span aria-live="polite" data-testid="match-status">
              {match.view.status}
            </span>
            <span data-testid="match-tick">{match.view.tick}</span>
          </div>
          <SettingsPanel
            onRetrySave={onRetrySettingsSave}
            onSettingsChange={onSettingsChange}
            onSoundEnabled={updateSoundEnabled}
            saveFailed={settingsSaveFailed}
            settings={settings}
          />
          <button
            className="match-header__button"
            onClick={openExitConfirmation}
            type="button"
          >
            게임 나가기
          </button>
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
              dispatch={dispatch}
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
          dispatch={dispatch}
          onRowSelectionChange={handleRowSelectionChange}
          player={player}
          rowSelectionActive={rowSelectionActive}
        />
        <div className="match-controls__movement">
          <Joystick onCommand={dispatch} resetBus={resetBus} />
          <RotateButton onCommand={dispatch} />
        </div>
      </fieldset>
      <ResumeCountdown count={resumeCountdown} />
      <ExitConfirmation
        onCancel={cancelExitConfirmation}
        onConfirm={() => platform.close()}
        open={exitOpen}
      />
    </section>
  );
}
