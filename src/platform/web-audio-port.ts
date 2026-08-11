import type {
  AudioPort,
  AudioSourceCatalog,
  AudioSourceRef,
  CueIntensity,
  MusicTrack,
  SoundCue,
  SoundPlaybackOptions,
} from './audio-port';

export interface WebAudioParamPort {
  cancelScheduledValues(cancelTime: number): void;
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

export interface WebAudioOscillatorPort {
  frequency: WebAudioParamPort;
  type: OscillatorType;
  onended: ((event: Event) => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface WebAudioBufferPort {
  readonly duration: number;
}

export interface WebAudioBufferSourcePort {
  buffer: WebAudioBufferPort | null;
  loop: boolean;
  onended: ((event: Event) => void) | null;
  playbackRate: WebAudioParamPort;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface WebAudioGainPort {
  gain: WebAudioParamPort;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface WebAudioContextPort {
  currentTime: number;
  destination: unknown;
  state: AudioContextState;
  createOscillator(): WebAudioOscillatorPort;
  createBufferSource(): WebAudioBufferSourcePort;
  createGain(): WebAudioGainPort;
  decodeAudioData(data: ArrayBuffer): Promise<WebAudioBufferPort>;
  close(): Promise<void>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
}

export interface CreateWebAudioPortOptions {
  readonly createContext?: () => WebAudioContextPort;
  readonly enabled?: boolean;
  readonly fetchAudio?: (url: string) => Promise<ArrayBuffer>;
  readonly resolveSources?: () => AudioSourceCatalog | null;
}

type CueShape = {
  readonly duration: number;
  readonly frequency: number;
  readonly gain: number;
  readonly type: OscillatorType;
};

type ActiveCueSource = {
  readonly disconnect: () => void;
  readonly stop: (when?: number) => void;
};

type CuePlaybackProfile = {
  readonly duckMusic: boolean;
  readonly gain: number;
  readonly rate: number;
};

const CUES: Readonly<Record<SoundCue, CueShape>> = {
  move: { duration: 0.045, frequency: 220, gain: 0.045, type: 'square' },
  rotate: { duration: 0.07, frequency: 360, gain: 0.065, type: 'triangle' },
  land: { duration: 0.08, frequency: 145, gain: 0.085, type: 'square' },
  clear: { duration: 0.14, frequency: 660, gain: 0.12, type: 'triangle' },
  attack: { duration: 0.16, frequency: 520, gain: 0.13, type: 'sawtooth' },
  item: { duration: 0.13, frequency: 880, gain: 0.1, type: 'sine' },
  win: { duration: 0.24, frequency: 784, gain: 0.14, type: 'triangle' },
  loss: { duration: 0.24, frequency: 110, gain: 0.13, type: 'sawtooth' },
};

const MUSIC_FADE_SECONDS = 0.15;
const MIN_GAIN = 0.0001;
const MUSIC_FADE_IN_SECONDS = 0.012;
const INTENSITY_RATES = [1, 1.04, 1.09, 1.15] as const;
const SAMPLE_GAINS = [0.14, 0.16, 0.18, 0.20] as const;
const ROTATE_RATES = [1, 2 ** (2 / 12), 2 ** (4 / 12)] as const;
const DUCK_GAIN = 0.65;
const DUCK_ATTACK_SECONDS = 0.02;
const DUCK_HOLD_SECONDS = 0.09;
const DUCK_RELEASE_SECONDS = 0.18;

function defaultCreateContext(): WebAudioContextPort {
  const scope = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (Context === undefined) throw new Error('Web Audio is unavailable.');
  return new Context();
}

async function defaultFetchAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio request failed with status ${response.status}`);
  return response.arrayBuffer();
}

async function settle(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Unsupported or interrupted audio is a silent, non-fatal fallback.
  }
}

function modulo(value: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const remainder = value % duration;
  return remainder < 0 ? remainder + duration : remainder;
}

export function createWebAudioPort({
  createContext = defaultCreateContext,
  enabled: initiallyEnabled = true,
  fetchAudio = defaultFetchAudio,
  resolveSources,
}: CreateWebAudioPortOptions = {}): AudioPort {
  let context: WebAudioContextPort | null = null;
  let contextResume: Promise<boolean> | null = null;
  let musicGain: WebAudioGainPort | null = null;
  let desiredTrack: MusicTrack | null = null;
  let activeTrack: MusicTrack | null = null;
  let activeSource: WebAudioBufferSourcePort | null = null;
  let activeBuffer: WebAudioBufferPort | null = null;
  let pausedOffset = 0;
  let startedAt = 0;
  let earliestMusicStart = 0;
  let requestGeneration = 0;
  let cueEpoch = 0;
  let unlocked = false;
  let enabled = initiallyEnabled;
  let backgrounded = false;
  let destroyed = false;
  const decodedBuffers = new Map<string, Promise<WebAudioBufferPort>>();
  const fadingMusicSources = new Set<WebAudioBufferSourcePort>();
  const activeCueSources = new Set<ActiveCueSource>();
  let rotateVariant = 0;

  function catalog(): AudioSourceCatalog | null {
    try {
      return resolveSources?.() ?? null;
    } catch {
      return null;
    }
  }

  function isCuePlayable(expectedContext: WebAudioContextPort | null = context): boolean {
    return !destroyed
      && enabled
      && unlocked
      && !backgrounded
      && context !== null
      && context === expectedContext
      && context.state === 'running';
  }

  function isCurrentMusicRequest(
    track: MusicTrack,
    generation: number,
    expectedContext: WebAudioContextPort | null = context,
  ): boolean {
    return isCuePlayable(expectedContext)
      && requestGeneration === generation
      && desiredTrack === track;
  }

  async function ensureContextRunning(expectedContext: WebAudioContextPort): Promise<boolean> {
    if (destroyed || context !== expectedContext || expectedContext.state === 'closed') {
      return false;
    }
    if (expectedContext.state === 'running') return true;
    if (contextResume !== null) return contextResume;
    const resume = (async () => {
      await settle(() => expectedContext.resume());
      return !destroyed
        && context === expectedContext
        && expectedContext.state === 'running';
    })();
    contextResume = resume;
    void resume.then(() => {
      if (contextResume === resume) contextResume = null;
    });
    return resume;
  }

  function readOffset(): number {
    if (context === null || activeBuffer === null || activeSource === null) {
      return pausedOffset;
    }
    return modulo(
      pausedOffset + Math.max(0, context.currentTime - startedAt),
      activeBuffer.duration,
    );
  }

  function isActiveMusicAudible(): boolean {
    return activeSource !== null
      && context !== null
      && context.currentTime >= startedAt;
  }

  function profileFor(
    cue: SoundCue,
    options: SoundPlaybackOptions | undefined,
  ): CuePlaybackProfile {
    const intensity = Math.max(0, Math.min(3, options?.intensity ?? 0)) as CueIntensity;
    const rotateRate = cue === 'rotate'
      ? ROTATE_RATES[rotateVariant++ % ROTATE_RATES.length]!
      : 1;
    return {
      duckMusic: options?.duckMusic === true,
      gain: SAMPLE_GAINS[intensity],
      rate: INTENSITY_RATES[intensity] * rotateRate,
    };
  }

  function cancelMusicGainAutomation(now: number): void {
    if (musicGain === null) return;
    try {
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(1, now);
    } catch {
      // Music cleanup remains non-fatal if automation is unavailable.
    }
  }

  function duckActiveMusic(start: number): void {
    if (
      musicGain === null
      || activeSource === null
      || activeTrack === null
      || desiredTrack !== activeTrack
      || !isActiveMusicAudible()
    ) return;
    try {
      musicGain.gain.cancelScheduledValues(start);
      musicGain.gain.setValueAtTime(1, start);
      musicGain.gain.exponentialRampToValueAtTime(DUCK_GAIN, start + DUCK_ATTACK_SECONDS);
      musicGain.gain.setValueAtTime(DUCK_GAIN, start + DUCK_HOLD_SECONDS);
      musicGain.gain.exponentialRampToValueAtTime(
        1,
        start + DUCK_HOLD_SECONDS + DUCK_RELEASE_SECONDS,
      );
    } catch {
      // Ducking is optional and must not interrupt a cue.
    }
  }

  function disconnectMusicSource(source: WebAudioBufferSourcePort): void {
    try {
      source.disconnect();
    } catch {
      // A source can already be disconnected by the browser.
    }
  }

  function clearActiveMusic(
    preserveOffset: boolean,
    stopAt: number,
    disconnectImmediately: boolean,
  ): void {
    const source = activeSource;
    if (source === null) return;
    if (preserveOffset) pausedOffset = readOffset();
    activeSource = null;
    activeTrack = null;
    activeBuffer = null;
    source.onended = () => disconnectMusicSource(source);
    try {
      source.stop(stopAt);
    } catch {
      // Stopping an already-ended source is harmless.
    }
    if (disconnectImmediately) disconnectMusicSource(source);
  }

  function fadeOutMusicForReplacement(): void {
    const source = activeSource;
    if (context === null || source === null) return;
    const start = context.currentTime;
    cancelMusicGainAutomation(start);
    const end = start + MUSIC_FADE_SECONDS;
    const gain = musicGain;
    if (gain !== null) {
      try {
        gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
      } catch {
        // Keep the replacement non-fatal if an audio implementation rejects ramps.
      }
    }
    earliestMusicStart = Math.max(earliestMusicStart, end);
    clearActiveMusic(false, end, false);
    fadingMusicSources.add(source);
    source.onended = () => {
      fadingMusicSources.delete(source);
      disconnectMusicSource(source);
    };
  }

  function stopFadingMusic(stopAt: number, disconnectImmediately: boolean): void {
    for (const source of fadingMusicSources) {
      fadingMusicSources.delete(source);
      source.onended = () => disconnectMusicSource(source);
      try {
        source.stop(stopAt);
      } catch {
        // A source that has just finished cannot be stopped again.
      }
      if (disconnectImmediately) disconnectMusicSource(source);
    }
  }

  function stopCueSources(): void {
    const now = context?.currentTime ?? 0;
    for (const source of activeCueSources) {
      try {
        source.stop(now);
      } catch {
        // A finished cue is already silent.
      }
      source.disconnect();
    }
    activeCueSources.clear();
  }

  function getMusicGain(expectedContext: WebAudioContextPort): WebAudioGainPort | null {
    if (musicGain !== null) return musicGain;
    try {
      const gain = expectedContext.createGain();
      gain.connect(expectedContext.destination);
      musicGain = gain;
      return gain;
    } catch {
      return null;
    }
  }

  function loadBuffer(
    ref: AudioSourceRef,
    decodeContext: WebAudioContextPort,
  ): Promise<WebAudioBufferPort> {
    const key = `${ref.generation}\u0000${ref.url}`;
    const existing = decodedBuffers.get(key);
    if (existing !== undefined) return existing;
    const loading = (async () => {
      const payload = await fetchAudio(ref.url);
      return decodeContext.decodeAudioData(payload);
    })();
    decodedBuffers.set(key, loading);
    return loading;
  }

  function createOscillatorCue(cue: SoundCue, profile: CuePlaybackProfile): void {
    if (!isCuePlayable()) return;
    const expectedContext = context!;
    try {
      const shape = CUES[cue];
      const start = expectedContext.currentTime;
      const end = start + shape.duration;
      const oscillator = expectedContext.createOscillator();
      const gain = expectedContext.createGain();
      const active: ActiveCueSource = {
        disconnect: () => {
          try {
            oscillator.disconnect();
            gain.disconnect();
          } catch {
            // A completed cue may already be detached.
          }
        },
        stop: (when) => oscillator.stop(when),
      };
      oscillator.type = shape.type;
      oscillator.frequency.setValueAtTime(shape.frequency * profile.rate, start);
      gain.gain.setValueAtTime(MIN_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(
        shape.gain * (profile.gain / SAMPLE_GAINS[0]),
        start + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
      oscillator.connect(gain);
      gain.connect(expectedContext.destination);
      oscillator.onended = () => {
        activeCueSources.delete(active);
        active.disconnect();
      };
      activeCueSources.add(active);
      if (profile.duckMusic) duckActiveMusic(start);
      oscillator.start(start);
      oscillator.stop(end);
    } catch {
      // A cue failure must not interrupt gameplay.
    }
  }

  function createSampleCue(buffer: WebAudioBufferPort, profile: CuePlaybackProfile): void {
    if (!isCuePlayable()) return;
    const expectedContext = context!;
    try {
      const source = expectedContext.createBufferSource();
      const gain = expectedContext.createGain();
      const start = expectedContext.currentTime;
      const active: ActiveCueSource = {
        disconnect: () => {
          try {
            source.disconnect();
            gain.disconnect();
          } catch {
            // A completed cue may already be detached.
          }
        },
        stop: (when) => source.stop(when),
      };
      source.buffer = buffer;
      source.loop = false;
      source.playbackRate.setValueAtTime(profile.rate, start);
      gain.gain.setValueAtTime(profile.gain, start);
      source.connect(gain);
      gain.connect(expectedContext.destination);
      source.onended = () => {
        activeCueSources.delete(active);
        active.disconnect();
      };
      activeCueSources.add(active);
      if (profile.duckMusic) duckActiveMusic(start);
      source.start(start);
      if (buffer.duration > 0) source.stop(start + buffer.duration);
    } catch {
      // Decoded SFX have the same non-fatal boundary as the oscillator fallback.
    }
  }

  async function startMusicForCurrentRequest(generation: number): Promise<void> {
    const track = desiredTrack;
    const expectedContext = context;
    if (track === null || expectedContext === null || !isCurrentMusicRequest(track, generation, expectedContext)) {
      return;
    }
    const ref = catalog()?.bgm[track];
    if (ref === undefined) return;

    let buffer: WebAudioBufferPort;
    try {
      buffer = await loadBuffer(ref, expectedContext);
    } catch {
      // Music decode failure is silence, not a synthesized fallback.
      return;
    }
    if (!isCurrentMusicRequest(track, generation, expectedContext)) return;
    if (activeSource !== null && activeTrack === track) return;

    const gain = getMusicGain(expectedContext);
    if (gain === null) return;
    const offset = modulo(pausedOffset, buffer.duration);
    const start = Math.max(expectedContext.currentTime, earliestMusicStart);
    try {
      const source = expectedContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.onended = () => disconnectMusicSource(source);
      gain.gain.setValueAtTime(MIN_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(1, start + MUSIC_FADE_IN_SECONDS);
      source.start(start, offset);
      activeSource = source;
      activeTrack = track;
      activeBuffer = buffer;
      pausedOffset = offset;
      startedAt = start;
    } catch {
      // Music remains optional if a browser refuses a source operation.
    }
  }

  async function resumeMusicIfPossible(): Promise<void> {
    const expectedContext = context;
    if (
      destroyed
      || backgrounded
      || !enabled
      || !unlocked
      || expectedContext === null
    ) return;
    if (!await ensureContextRunning(expectedContext)) return;
    await startMusicForCurrentRequest(requestGeneration);
  }

  return {
    async unlock(): Promise<void> {
      if (destroyed) return;
      if (context === null) {
        try {
          context = createContext();
        } catch {
          return;
        }
      }
      const expectedContext = context;
      if (!await ensureContextRunning(expectedContext)) return;
      unlocked = true;
      await resumeMusicIfPossible();
    },

    play(cue: SoundCue, options?: SoundPlaybackOptions): void {
      if (!isCuePlayable()) return;
      const expectedCueEpoch = cueEpoch;
      const profile = profileFor(cue, options);
      const source = catalog()?.sfx[cue];
      if (source === undefined) {
        createOscillatorCue(cue, profile);
        return;
      }
      const expectedContext = context!;
      void loadBuffer(source, expectedContext)
        .then((buffer) => {
          if (cueEpoch === expectedCueEpoch && isCuePlayable(expectedContext)) {
            createSampleCue(buffer, profile);
          }
        })
        .catch(() => {
          if (cueEpoch === expectedCueEpoch && isCuePlayable(expectedContext)) {
            createOscillatorCue(cue, profile);
          }
        });
    },

    async setMusic(track: MusicTrack | null): Promise<void> {
      if (destroyed) return;
      if (track !== null && track === desiredTrack) return;

      requestGeneration += 1;
      const generation = requestGeneration;
      const changedToTrack = track !== null && track !== desiredTrack;
      desiredTrack = track;
      if (track === null) {
        cancelMusicGainAutomation(context?.currentTime ?? 0);
        stopFadingMusic(context?.currentTime ?? 0, true);
        clearActiveMusic(false, context?.currentTime ?? 0, true);
        return;
      }
      if (changedToTrack) {
        pausedOffset = 0;
        if (activeSource !== null && !isActiveMusicAudible()) {
          clearActiveMusic(false, context?.currentTime ?? 0, true);
        } else {
          fadeOutMusicForReplacement();
        }
      }
      await resumeMusicIfPossible();
      // A synchronous resume can start a newer request. Keeping this check here
      // makes the monotonic request generation explicit at the public boundary.
      if (generation !== requestGeneration) return;
    },

    setEnabled(nextEnabled: boolean): void {
      if (destroyed || enabled === nextEnabled) return;
      enabled = nextEnabled;
      if (!enabled) {
        cueEpoch += 1;
        cancelMusicGainAutomation(context?.currentTime ?? 0);
        stopFadingMusic(context?.currentTime ?? 0, true);
        clearActiveMusic(true, context?.currentTime ?? 0, true);
        stopCueSources();
        return;
      }
      void resumeMusicIfPossible();
    },

    async suspend(): Promise<void> {
      if (destroyed) return;
      cueEpoch += 1;
      backgrounded = true;
      cancelMusicGainAutomation(context?.currentTime ?? 0);
      stopFadingMusic(context?.currentTime ?? 0, true);
      clearActiveMusic(true, context?.currentTime ?? 0, true);
      stopCueSources();
      if (context !== null && context.state !== 'suspended' && context.state !== 'closed') {
        await settle(() => context!.suspend());
      }
    },

    async resume(): Promise<void> {
      if (destroyed) return;
      backgrounded = false;
      await resumeMusicIfPossible();
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      requestGeneration += 1;
      cueEpoch += 1;
      cancelMusicGainAutomation(context?.currentTime ?? 0);
      stopFadingMusic(context?.currentTime ?? 0, true);
      clearActiveMusic(false, context?.currentTime ?? 0, true);
      stopCueSources();
      const closingContext = context;
      context = null;
      unlocked = false;
      desiredTrack = null;
      activeTrack = null;
      activeBuffer = null;
      if (musicGain !== null) {
        try {
          musicGain.disconnect();
        } catch {
          // Gain cleanup must not prevent context cleanup.
        }
      }
      musicGain = null;
      if (closingContext !== null && closingContext.state !== 'closed') {
        await settle(() => closingContext.close());
      }
    },
  };
}
