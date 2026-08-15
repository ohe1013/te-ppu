import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createAiController,
  getAiFloorProfile,
} from '../../ai/index';
import type { Floor, MatchOutcome } from '../../app/app-route';
import {
  useMatchLoop,
  type MatchLoopView,
  type UseMatchLoopOptions,
} from '../../app/use-match-loop';
import type {
  CharacterId,
  CommonAssets,
  FloorAssetBundle,
  LoadedImageRef,
  PlayerCharacterAssets,
  PortraitState,
} from '../../assets/index';
import type {
  GameCommand,
  GameEvent,
  MatchStatus,
  PublicMatchView,
} from '../../core/index';
import { createAppLifecycleCoordinator } from '../../platform/app-lifecycle';
import type { AudioPort } from '../../platform/audio-port';
import { usePlatformBack } from '../../platform/back-request';
import type { HapticType, PlatformPort } from '../../platform/platform-port';
import type { PlayerCharacterDefinition } from '../../player';
import type { ProgressState } from '../../progression/index';
import {
  getFloorEncounter,
  type Difficulty,
  type EncounterIndex,
  type FloorEncounter,
  type OwlEncounter,
} from '../../progression/index';
import { BattleCanvas } from '../../render/BattleCanvas';
import { BattleHud } from '../match/BattleHud';
import type {
  AttackFeedbackCue,
  AttackFeedbackPresentation,
} from '../match/attack-feedback';
import { AssetIcon } from '../match/AssetIcon';
import {
  createPortraitMemory,
  createPortraitPresentation,
  mapOwlPortraitUrls,
  portraitStateWithAttackFeedback,
  reducePortraitBatches,
  resolvePortraitState,
  type PortraitMemory,
  type PortraitPresentation,
  type PortraitRole,
} from '../match/portrait-state';
import { BattleAbandonConfirmation } from '../match/BattleAbandonConfirmation';
import { InputResetBus } from '../match/input-reset-bus';
import { ItemControls } from '../match/ItemControls';
import { Joystick } from '../match/Joystick';
import { ResumeCountdown } from '../match/ResumeCountdown';
import { RotateButton } from '../match/RotateButton';
import { RowSelector } from '../match/RowSelector';
import { SettingsPanel } from '../match/SettingsPanel';
import {
  attackSoundFeedback,
  soundFeedbackForEvents,
} from '../match/sound-feedback';
import {
  useAttackFeedback,
  type UseAttackFeedbackOptions,
} from '../match/use-attack-feedback';
import { useReducedMotion } from '../match/use-reduced-motion';
import '../match/match-layout.css';

const MATCH_STATUS_LABELS: Readonly<Record<MatchStatus, string>> = {
  countdown: '대전 준비',
  playing: '대전 진행 중',
  'player-won': '플레이어 승리',
  'opponent-won': '상대 승리',
  draw: '무승부',
};

export interface MatchScreenProps {
  readonly audioPort: Pick<AudioPort, 'play' | 'setVolumes'>;
  readonly floor: Floor;
  readonly encounterIndex?: EncounterIndex;
  readonly wins?: 0 | 1 | 2;
  readonly difficulty?: Difficulty;
  readonly specialEncounter?: OwlEncounter;
  readonly seed: number;
  readonly onAbandon: () => void;
  readonly onFinished: (outcome: MatchOutcome) => void | Promise<void>;
  readonly onScoreEvents?: (events: readonly GameEvent[]) => void;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly player: PlayerCharacterDefinition;
  readonly playerAssets?: PlayerCharacterAssets;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
  readonly portraitSources?: {
    readonly player?: Partial<Record<PortraitState, string>>;
    readonly opponent?: Partial<Record<PortraitState, string>>;
  };
  /** Resolved by AppRoot; this screen never starts asset work. */
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
  readonly runScore?: number;
  readonly useAttackFeedbackImpl?: AttackFeedbackHook;
  readonly useMatchLoopImpl?: MatchLoopHook;
}

export type AttackFeedbackHook = (
  options: UseAttackFeedbackOptions,
) => AttackFeedbackPresentation | null;
export type MatchLoopHook = (options: UseMatchLoopOptions) => MatchLoopView;

function portraitUrls(records: object | undefined): Partial<Record<PortraitState, string>> {
  if (records === undefined) return {};
  return Object.fromEntries(
    Object.entries(records as Record<string, LoadedImageRef | undefined>)
      .flatMap(([state, image]) => image === undefined ? [] : [[state, image.url]]),
  ) as Partial<Record<PortraitState, string>>;
}

function hapticForEvent(event: GameEvent, status: MatchStatus): HapticType | null {
  if (event.type === 'piece-locked' && event.side === 'player') return 'tickWeak';
  if (event.type === 'lines-cleared' && event.side === 'player') return 'tap';
  if (event.type === 'item-acquired' || event.type === 'item-used') {
    return event.side === 'player' ? 'tap' : null;
  }
  if (event.type === 'freeze-applied') return event.side === 'player' ? 'error' : 'success';
  if (event.type === 'match-ended') {
    if (status === 'player-won') return 'success';
    if (status === 'opponent-won') return 'error';
  }
  return null;
}

function ignoreEffect(operation: () => Promise<void>): void {
  try {
    void operation().catch(() => undefined);
  } catch {
    // Platform feedback is optional and must not interrupt the match.
  }
}

function portraitRoleFor(side: 'player' | 'opponent', characterId: CharacterId): PortraitRole {
  if (side === 'player') return 'hero';
  if (characterId === 'owl-companion') return 'owl';
  return characterId === 'demon-king' ? 'demon-king' : 'lieutenant';
}

function presentationFor(
  memory: PortraitMemory,
  {
    feedback,
    floor,
    role,
    side,
    sources,
    view,
  }: {
    readonly feedback: AttackFeedbackPresentation | null;
    readonly floor: Floor;
    readonly role: PortraitRole;
    readonly side: 'player' | 'opponent';
    readonly sources: MatchScreenProps['portraitSources'];
    readonly view: PublicMatchView;
  },
): PortraitPresentation {
  const baseState = resolvePortraitState({
    ...memory,
    dangerState: role === 'demon-king' || role === 'owl' ? 'rage' : 'panic',
    tick: view.tick,
  });
  const state = portraitStateWithAttackFeedback(
    baseState,
    side,
    memory.terminal !== null,
    feedback,
  );
  return createPortraitPresentation(
    state,
    sources?.[side],
    side === 'player' ? 'PLAYER' : 'RIVAL',
  );
}

function usePortraitPresentations(
  floor: Floor,
  opponentCharacterId: CharacterId,
  playerCharacterId: CharacterId,
  match: Pick<MatchLoopView, 'eventBatches' | 'view'>,
  sources: MatchScreenProps['portraitSources'],
  feedback: AttackFeedbackPresentation | null,
): { readonly player: PortraitPresentation; readonly opponent: PortraitPresentation } {
  const memoriesRef = useRef<{
    readonly floor: Floor;
    readonly opponentCharacterId: CharacterId;
    readonly playerCharacterId: CharacterId;
    readonly player: PortraitMemory;
    readonly opponent: PortraitMemory;
  } | null>(null);
  const previous = memoriesRef.current?.floor === floor
    && memoriesRef.current.opponentCharacterId === opponentCharacterId
    && memoriesRef.current.playerCharacterId === playerCharacterId
    ? memoriesRef.current
    : {
      floor,
      opponent: createPortraitMemory(),
      opponentCharacterId,
      player: createPortraitMemory(),
      playerCharacterId,
    };
  const playerRole = portraitRoleFor('player', playerCharacterId);
  const opponentRole = portraitRoleFor('opponent', opponentCharacterId);
  const player = reducePortraitBatches(previous.player, {
    batches: match.eventBatches,
    floor,
    latestView: match.view,
    role: playerRole,
    side: 'player',
  });
  const opponent = reducePortraitBatches(previous.opponent, {
    batches: match.eventBatches,
    floor,
    latestView: match.view,
    role: opponentRole,
    side: 'opponent',
  });
  memoriesRef.current = {
    floor,
    opponent,
    opponentCharacterId,
    player,
    playerCharacterId,
  };
  return {
    player: presentationFor(player, {
      feedback,
      floor,
      role: playerRole,
      side: 'player',
      sources,
      view: match.view,
    }),
    opponent: presentationFor(opponent, {
      feedback,
      floor,
      role: opponentRole,
      side: 'opponent',
      sources,
      view: match.view,
    }),
  };
}

export function MatchScreen({
  audioPort,
  commonAssets,
  difficulty = 'easy',
  encounterIndex = 0,
  floor,
  wins = 0,
  onAbandon,
  onFinished,
  onScoreEvents,
  onRetrySettingsSave,
  onSettingsChange,
  platform,
  player: playerCharacter,
  playerAssets,
  portraitSources,
  runScore = 0,
  seed,
  settings,
  settingsSaveFailed,
  specialEncounter,
  useAttackFeedbackImpl = useAttackFeedback,
  useMatchLoopImpl = useMatchLoop,
}: MatchScreenProps) {
  const encounter: FloorEncounter | OwlEncounter = specialEncounter
    ?? getFloorEncounter(floor, encounterIndex);
  const isOwlMatch = specialEncounter !== undefined;
  const rivalCharacter = {
    id: encounter.characterId,
    name: encounter.displayName,
    title: encounter.title,
  };
  const resetBus = useMemo(() => new InputResetBus(), []);
  const reducedMotion = useReducedMotion();
  const audio = audioPort;
  const feedbackRef = useRef({ audio, onScoreEvents, platform, settings });
  feedbackRef.current = { audio, onScoreEvents, platform, settings };
  const handleMatchEvents = useCallback((
    events: readonly GameEvent[],
    view: PublicMatchView,
  ) => {
    const feedback = feedbackRef.current;
    if (feedback.settings.soundEnabled) {
      for (const sound of soundFeedbackForEvents(events, view)) {
        try {
          feedback.audio.play(sound.cue, sound.options);
        } catch {
          // Audio ports are optional and isolated from gameplay.
        }
      }
    }

    const sentHaptics = new Set<HapticType>();
    for (const event of events) {
      if (feedback.settings.hapticsEnabled) {
        const haptic = hapticForEvent(event, view.status);
        if (haptic !== null && !sentHaptics.has(haptic)) {
          sentHaptics.add(haptic);
          ignoreEffect(() => feedback.platform.haptic(haptic));
        }
      }
    }
    feedback.onScoreEvents?.(events);
  }, []);
  const handleAttackImpact = useCallback((cue: AttackFeedbackCue) => {
    const feedback = feedbackRef.current;
    if (feedback.settings.soundEnabled) {
      const sound = attackSoundFeedback(cue.amount);
      try {
        feedback.audio.play(sound.cue, sound.options);
      } catch {
        // Optional audio feedback cannot own the match or presentation clock.
      }
    }
    if (feedback.settings.hapticsEnabled) {
      const haptic = cue.source === 'player' ? 'success' : 'error';
      ignoreEffect(() => feedback.platform.haptic(haptic));
    }
  }, []);
  const ai = useMemo(
    () => createAiController(getAiFloorProfile(floor, difficulty), seed),
    [difficulty, floor, seed],
  );
  const match = useMatchLoopImpl({
    ai,
    config: { matchSeed: seed },
    onEvents: handleMatchEvents,
    onFinished,
  });
  const attackFeedback = useAttackFeedbackImpl({
    eventBatches: match.eventBatches,
    onImpact: handleAttackImpact,
    reducedMotion,
  });
  const resolvedPortraitSources = useMemo(() => {
    const opponent = {
      ...portraitUrls(isOwlMatch
        ? commonAssets?.owl.portraits
        : commonAssets?.rivals[getFloorEncounter(floor, encounterIndex).characterId]?.portraits),
      ...portraitSources?.opponent,
    };
    return {
      player: {
        ...portraitUrls(playerAssets?.portraits),
        ...portraitSources?.player,
      },
      opponent: isOwlMatch ? mapOwlPortraitUrls(opponent) : opponent,
    };
  }, [
    commonAssets?.owl.portraits,
    commonAssets?.rivals,
    encounter.characterId,
    encounterIndex,
    floor,
    isOwlMatch,
    playerAssets?.portraits,
    portraitSources,
  ]);
  const portraits = usePortraitPresentations(
    floor,
    encounter.characterId,
    playerCharacter.id,
    match,
    resolvedPortraitSources,
    attackFeedback,
  );
  const skin = useMemo(() => {
    if (commonAssets === null || commonAssets === undefined) return undefined;
    const { garbage, ...blocks } = commonAssets.tiles;
    return { blocks, garbage, items: commonAssets.items };
  }, [commonAssets]);
  const [rowSelectionActive, setRowSelectionActive] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const handleRowSelectionChange = useCallback((active: boolean) => {
    setRowSelectionActive(active);
    if (!active) setSelectedRow(null);
  }, []);

  const resetEveryInput = useCallback(() => {
    resetBus.resetAll();
    handleRowSelectionChange(false);
  }, [handleRowSelectionChange, resetBus]);

  const handleBackgroundChange = useCallback((paused: boolean) => {
    setBackgroundPaused(paused);
  }, []);

  useEffect(() => {
    const lifecycle = createAppLifecycleCoordinator({
      onBackgroundChange: handleBackgroundChange,
      onCountdownChange: setResumeCountdown,
      resetAll: resetEveryInput,
      setPaused: match.setPaused,
    });
    return () => lifecycle.destroy();
  }, [audio, handleBackgroundChange, match.setPaused, resetEveryInput]);

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
    && !backgroundPaused
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

  usePlatformBack(openExitConfirmation, { enabled: !exitOpen, priority: 10 });

  return (
    <section
      className="screen-shell match-screen"
      data-encounter-kind={isOwlMatch ? 'owl' : 'floor'}
      data-floor={floor}
      data-testid="match-screen"
    >
      <header className="match-header">
        <div className="match-header__series">
          <span className="match-header__series-badge">
            {isOwlMatch ? '숨겨진 보스' : `${floor}층 · ${encounterIndex + 1}/3`}
          </span>
          <span className="match-header__series-wins">
            {isOwlMatch ? '부엉이' : `승리 ${wins ?? 0}/3`}
            <span className="match-header__run-score" data-testid="run-score">
              점수 {String(runScore).padStart(6, '0')}
            </span>
          </span>
        </div>
        <div className="match-header__actions">
          <div className="match-meta match-meta--live">
            <span aria-live="polite" data-testid="match-status">
              {MATCH_STATUS_LABELS[match.view.status]}
            </span>
            <span className="match-meta__telemetry" data-testid="match-tick">{match.view.tick}</span>
          </div>
          <SettingsPanel
            icons={{
              hapticsOff: commonAssets?.icons['haptics-off'],
              hapticsOn: commonAssets?.icons['haptics-on'],
              settings: commonAssets?.icons.settings,
              soundOff: commonAssets?.icons['sound-off'],
              soundOn: commonAssets?.icons['sound-on'],
            }}
            onRetrySave={onRetrySettingsSave}
            onSettingsChange={onSettingsChange}
            onSfxPreview={() => audio.play('rotate')}
            onVolumePreview={({ bgmVolume, sfxVolume }) => audio.setVolumes({
              bgm: bgmVolume / 100,
              sfx: sfxVolume / 100,
            })}
            saveFailed={settingsSaveFailed}
            settings={settings}
          />
          <button
            className="match-header__button"
            onClick={openExitConfirmation}
            type="button"
          >
            <AssetIcon className="asset-icon" fallback="↩" image={commonAssets?.icons.exit} />
            타워로 나가기
          </button>
        </div>
      </header>

      <div className="battle-hud-pair">
        <BattleHud
          character={playerCharacter}
          feedback={attackFeedback}
          items={commonAssets?.items}
          model={match.view.sides.player}
          portrait={portraits.player}
          side="player"
          tiles={commonAssets?.tiles}
        />
        <BattleHud
          character={rivalCharacter}
          feedback={attackFeedback}
          items={commonAssets?.items}
          model={match.view.sides.opponent}
          portrait={portraits.opponent}
          side="opponent"
          tiles={commonAssets?.tiles}
        />
      </div>

      <div className="battle-stage">
        <BattleCanvas
          attackFeedback={attackFeedback}
          atlas={commonAssets?.atlas}
          commandFeedback={match.commandFeedback}
          eventBatches={match.eventBatches}
          playerBoardOverlay={rowSelectionActive ? (
            <RowSelector
              board={player.board}
              dispatch={dispatch}
              onClose={() => handleRowSelectionChange(false)}
              onSelectedRowChange={setSelectedRow}
            />
          ) : undefined}
          reducedMotion={reducedMotion}
          selectedRow={selectedRow}
          skin={skin}
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
          items={commonAssets?.items}
          onRowSelectionChange={handleRowSelectionChange}
          player={player}
          rowSelectionActive={rowSelectionActive}
        />
        <div className="match-controls__movement">
          <Joystick onCommand={dispatch} resetBus={resetBus} />
          <RotateButton icon={commonAssets?.icons.rotate} onCommand={dispatch} />
        </div>
      </fieldset>
      <ResumeCountdown count={resumeCountdown} />
      <BattleAbandonConfirmation
        icon={commonAssets?.icons.exit}
        onCancel={cancelExitConfirmation}
        onConfirm={onAbandon}
        open={exitOpen}
      />
    </section>
  );
}
