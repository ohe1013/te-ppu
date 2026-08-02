import type { AudioPort, SoundCue } from './audio-port';

export interface WebAudioParamPort {
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
  createGain(): WebAudioGainPort;
  close(): Promise<void>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
}

export interface CreateWebAudioPortOptions {
  readonly createContext?: () => WebAudioContextPort;
  readonly enabled?: boolean;
}

type CueShape = {
  readonly duration: number;
  readonly frequency: number;
  readonly gain: number;
  readonly type: OscillatorType;
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

function defaultCreateContext(): WebAudioContextPort {
  const scope = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (Context === undefined) throw new Error('Web Audio is unavailable.');
  return new Context();
}

async function settle(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Unsupported or interrupted audio is a silent, non-fatal fallback.
  }
}

export function createWebAudioPort({
  createContext = defaultCreateContext,
  enabled: initiallyEnabled = true,
}: CreateWebAudioPortOptions = {}): AudioPort {
  let context: WebAudioContextPort | null = null;
  let enabled = initiallyEnabled;
  let destroyed = false;

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
      if (context.state !== 'running') await settle(() => context!.resume());
    },

    play(cue: SoundCue): void {
      if (destroyed || !enabled || context === null || context.state !== 'running') return;
      try {
        const shape = CUES[cue];
        const start = context.currentTime;
        const end = start + shape.duration;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = shape.type;
        oscillator.frequency.setValueAtTime(shape.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(shape.gain, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(end);
      } catch {
        // A cue failure must not interrupt gameplay.
      }
    },

    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
    },

    async suspend(): Promise<void> {
      if (destroyed || context === null || context.state === 'suspended') return;
      await settle(() => context!.suspend());
    },

    async resume(): Promise<void> {
      if (destroyed || !enabled || context === null || context.state === 'running') return;
      await settle(() => context!.resume());
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      if (context !== null && context.state !== 'closed') {
        await settle(() => context!.close());
      }
      context = null;
    },
  };
}
