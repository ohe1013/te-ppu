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
import type { Floor, MatchResult } from '../../app/app-route';
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
  PortraitState,
} from '../../assets/index';
import type {
  GameCommand,
  GameEvent,
  MatchStatus,
  PublicMatchView,
} from '../../core/index';
import { createAppLifecycleCoordinator } from '../../platform/app-lifecycle';
import type { AudioPort, SoundCue } from '../../platform/audio-port';
import type { HapticType, PlatformPort } from '../../platform/platform-port';
import type { ProgressState } from '../../progression/index';
import { getFloorEncounter, type EncounterIndex, type FloorEncounter } from '../../progression/index';
import { BattleCanvas } from '../../render/BattleCanvas';
import { BattleHud } from '../match/BattleHud';
import { AssetIcon } from '../match/AssetIcon';
import {
  createPortraitMemory,
  createPortraitPresentation,
  reducePortraitBatches,
  resolvePortraitState,
  type PortraitMemory,
  type PortraitPresentation,
  type PortraitRole,
} from '../match/portrait-state';
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
  readonly audioPort: Pick<AudioPort, 'play'>;
  readonly floor: Floor;
  readonly encounterIndex?: EncounterIndex;
  readonly wins?: 0 | 1 | 2;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => void | Promise<void>;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
  readonly portraitSources?: {
    readonly player?: Partial<Record<PortraitState, string>>;
    readonly opponent?: Partial<Record<PortraitState, string>>;
  };
  /** Resolved by AppRoot; this screen never starts asset work. */
  readonly commonAssets?: CommonAssets | null;
  readonly floorAssets?: FloorAssetBundle | null;
  readonly useMatchLoopImpl?: MatchLoopHook;
}

export type MatchLoopHook = (options: UseMatchLoopOptions) => MatchLoopView;

function portraitUrls(records: object | undefined): Partial<Record<PortraitState, string>> {
  if (records === undefined) return {};
  return Object.fromEntries(
    Object.entries(records as Record<string, LoadedImageRef | undefined>)
      .flatMap(([state, image]) => image === undefined ? [] : [[state, image.url]]),
  ) as Partial<Record<PortraitState, string>>;
}

function cueForEvent(event: GameEvent, status: MatchStatus): SoundCue | null {
  if (event.type === 'piece-locked' || event.type === 'garbage-landed') return 'land';
  if (event.type === 'lines-cleared') return 'clear';
  if (event.type === 'attack-sent') return 'attack';
  if (
    event.type === 'item-acquired'
    || event.type === 'item-used'
    || event.type === 'freeze-applied'
  ) return 'item';
  if (event.type === 'match-ended') {
    if (status === 'player-won') return 'win';
    if (status === 'opponent-won') return 'loss';
  }
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
  return characterId === 'demon-king' ? 'demon-king' : 'lieutenant';
}

function presentationFor(
  memory: PortraitMemory,
  {
    floor,
    role,
    side,
    sources,
    view,
  }: {
    readonly floor: Floor;
    readonly role: PortraitRole;
    readonly side: 'player' | 'opponent';
    readonly sources: MatchScreenProps['portraitSources'];
    readonly view: PublicMatchView;
  },
): PortraitPresentation {
  const state = resolvePortraitState({
    ...memory,
    dangerState: role === 'demon-king' ? 'rage' : 'panic',
    tick: view.tick,
  });
  return createPortraitPresentation(
    state,
    sources?.[side],
    side === 'player' ? 'PLAYER' : 'RIVAL',
  );
}

function usePortraitPresentations(
  floor: Floor,
  characterId: CharacterId,
  match: Pick<MatchLoopView, 'eventBatches' | 'view'>,
  sources: MatchScreenProps['portraitSources'],
): { readonly player: PortraitPresentation; readonly opponent: PortraitPresentation } {
  const memoriesRef = useRef<{
    readonly floor: Floor;
    readonly characterId: CharacterId;
    readonly player: PortraitMemory;
    readonly opponent: PortraitMemory;
  } | null>(null);
  const previous = memoriesRef.current?.floor === floor
    && memoriesRef.current.characterId === characterId
    ? memoriesRef.current
    : {
      characterId,
      floor,
      opponent: createPortraitMemory(),
      player: createPortraitMemory(),
    };
  const playerRole = portraitRoleFor('player', 'hero-engineer');
  const opponentRole = portraitRoleFor('opponent', characterId);
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
  memoriesRef.current = { characterId, floor, opponent, player };
  return {
    player: presentationFor(player, {
      floor,
      role: playerRole,
      side: 'player',
      sources,
      view: match.view,
    }),
    opponent: presentationFor(opponent, {
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
  encounterIndex = 0,
  floor,
  wins = 0,
  onFinished,
  onRetrySettingsSave,
  onSettingsChange,
  platform,
  portraitSources,
  seed,
  settings,
  settingsSaveFailed,
  useMatchLoopImpl = useMatchLoop,
}: MatchScreenProps) {
  const encounter: FloorEncounter = getFloorEncounter(floor, encounterIndex);
  const heroCharacter = {
    id: 'hero-engineer' as const,
    name: '견습 마도공학자',
    title: '별빛 수리공',
  };
  const rivalCharacter = {
    id: encounter.characterId,
    name: encounter.displayName,
    title: encounter.title,
  };
  const resetBus = useMemo(() => new InputResetBus(), []);
  const audio = audioPort;
  const feedbackRef = useRef({ audio, platform, settings });
  feedbackRef.current = { audio, platform, settings };
  const handleMatchEvents = useCallback((
    events: readonly GameEvent[],
    view: PublicMatchView,
  ) => {
    const feedback = feedbackRef.current;
    const playedCues = new Set<SoundCue>();
    const sentHaptics = new Set<HapticType>();
    for (const event of events) {
      if (feedback.settings.soundEnabled) {
        const cue = cueForEvent(event, view.status);
        if (cue !== null && !playedCues.has(cue)) {
          playedCues.add(cue);
          try {
            feedback.audio.play(cue);
          } catch {
            // Audio ports are optional and isolated from gameplay.
          }
        }
      }
      if (feedback.settings.hapticsEnabled) {
        const haptic = hapticForEvent(event, view.status);
        if (haptic !== null && !sentHaptics.has(haptic)) {
          sentHaptics.add(haptic);
          ignoreEffect(() => feedback.platform.haptic(haptic));
        }
      }
    }
  }, []);
  const ai = useMemo(
    () => createAiController(getAiFloorProfile(floor), seed),
    [floor, seed],
  );
  const match = useMatchLoopImpl({
    ai,
    config: { matchSeed: seed },
    onEvents: handleMatchEvents,
    onFinished,
  });
  const resolvedPortraitSources = useMemo(() => ({
    player: { ...portraitUrls(commonAssets?.hero.portraits), ...portraitSources?.player },
    opponent: {
      ...portraitUrls(commonAssets?.rivals[encounter.characterId]?.portraits),
      ...portraitSources?.opponent,
    },
  }), [commonAssets?.hero.portraits, commonAssets?.rivals, encounter.characterId, portraitSources]);
  const portraits = usePortraitPresentations(
    floor,
    encounter.characterId,
    match,
    resolvedPortraitSources,
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

  return (
    <section
      className="screen-shell match-screen"
      data-floor={floor}
      data-testid="match-screen"
    >
      <header className="match-header">
        <div className="match-header__series">
          <span className="match-header__series-badge">{floor}F · {encounterIndex + 1}/3</span>
          <span className="match-header__series-wins">승리 {wins ?? 0}/3</span>
        </div>
        <div className="match-header__actions">
          <div className="match-meta match-meta--live">
            <span aria-live="polite" data-testid="match-status">
              {match.view.status}
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
            saveFailed={settingsSaveFailed}
            settings={settings}
          />
          <button
            className="match-header__button"
            onClick={openExitConfirmation}
            type="button"
          >
            <AssetIcon className="asset-icon" fallback="↩" image={commonAssets?.icons.exit} />
            게임 나가기
          </button>
        </div>
      </header>

      <div className="battle-hud-pair">
        <BattleHud
          character={heroCharacter}
          items={commonAssets?.items}
          model={match.view.sides.player}
          portrait={portraits.player}
          side="player"
          tiles={commonAssets?.tiles}
        />
        <BattleHud
          character={rivalCharacter}
          items={commonAssets?.items}
          model={match.view.sides.opponent}
          portrait={portraits.opponent}
          side="opponent"
          tiles={commonAssets?.tiles}
        />
      </div>

      <div className="battle-stage">
        <BattleCanvas
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
      <ExitConfirmation
        icon={commonAssets?.icons.exit}
        onCancel={cancelExitConfirmation}
        onConfirm={() => platform.close()}
        open={exitOpen}
      />
    </section>
  );
}
