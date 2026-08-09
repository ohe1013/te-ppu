import { describe, expect, it, vi } from 'vitest';
import type { ResolvedAudioRef } from '../assets';
import type { AudioSourceCatalog, SoundCue } from './audio-port';
import {
  createWebAudioPort,
  type WebAudioBufferPort,
  type WebAudioContextPort,
  type WebAudioParamPort,
} from './web-audio-port';

class TestParam implements WebAudioParamPort {
  readonly calls: Array<readonly [string, number, number]> = [];

  exponentialRampToValueAtTime(value: number, endTime: number): void {
    this.calls.push(['exponential', value, endTime]);
  }

  setValueAtTime(value: number, startTime: number): void {
    this.calls.push(['set', value, startTime]);
  }
}

function deferred<T>() {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createCatalog(): AudioSourceCatalog {
  const ref = (name: string, generation = 1) => ({
    generation,
    url: `https://cdn.example.test/runtime/${name}.mp3`,
  });
  return {
    sfx: {
      move: ref('sfx/move'),
      rotate: ref('sfx/rotate'),
      land: ref('sfx/land'),
      clear: ref('sfx/clear'),
      attack: ref('sfx/attack'),
      item: ref('sfx/item'),
      win: ref('sfx/win'),
      loss: ref('sfx/loss'),
    },
    bgm: {
      tower: ref('bgm/tower'),
      'early-floors': ref('bgm/early-floors'),
      'late-floors': ref('bgm/late-floors'),
      'demon-king': ref('bgm/demon-king'),
      ending: ref('bgm/ending'),
    },
  };
}

function createContext(
  decodeAudioData: (data: ArrayBuffer) => Promise<WebAudioBufferPort> = async () => ({
    duration: 5,
  }),
) {
  const oscillators: Array<{
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    readonly frequency: TestParam;
    onended: ((event: Event) => void) | null;
    readonly start: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
    type: OscillatorType;
  }> = [];
  const bufferSources: Array<{
    buffer: WebAudioBufferPort | null;
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    loop: boolean;
    onended: ((event: Event) => void) | null;
    readonly start: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
  }> = [];
  const gainNodes: Array<{
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    readonly gain: TestParam;
  }> = [];
  const context: WebAudioContextPort = {
    close: vi.fn(async () => undefined),
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        loop: false,
        onended: null as ((event: Event) => void) | null,
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: new TestParam() };
      gainNodes.push(gainNode);
      return gainNode;
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: new TestParam(),
        onended: null as ((event: Event) => void) | null,
        start: vi.fn(),
        stop: vi.fn(),
        type: 'sine' as OscillatorType,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    currentTime: 4,
    decodeAudioData: vi.fn(decodeAudioData),
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    state: 'suspended',
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
  };
  return { bufferSources, context, gainNodes, oscillators };
}

describe('createWebAudioPort', () => {
  it('creates and resumes its context only after unlock, then synthesizes a short cue', async () => {
    const fixture = createContext();
    const createContextSpy = vi.fn(() => fixture.context);
    const audio = createWebAudioPort({ createContext: createContextSpy });

    audio.play('clear');
    expect(createContextSpy).not.toHaveBeenCalled();

    await audio.unlock();
    expect(createContextSpy).toHaveBeenCalledTimes(1);
    expect(fixture.context.resume).toHaveBeenCalledTimes(1);

    audio.play('clear');
    const oscillator = fixture.oscillators[0]!;
    const gain = fixture.gainNodes[0]!.gain;
    expect(fixture.context.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillator.start).toHaveBeenCalledWith(4);
    expect(oscillator.stop).toHaveBeenCalledWith(4.14);
    expect(oscillator.frequency.calls[0]).toEqual(['set', 660, 4]);
    expect(gain.calls).toEqual([
      ['set', 0.0001, 4],
      ['exponential', 0.12, 4.012],
      ['exponential', 0.0001, 4.14],
    ]);
  });

  it('remembers desired music before unlock and fetches only the supplied resolved URL', async () => {
    const fixture = createContext();
    const baseCatalog = createCatalog();
    const suppliedUrl = 'https://signed.example.test/asset?audio=tower&generation=7';
    const towerSource: ResolvedAudioRef = {
      generation: 7,
      ref: { path: 'wrong/path/that-must-not-be-rebuilt.mp3' },
      url: suppliedUrl,
    };
    const catalog: AudioSourceCatalog = {
      ...baseCatalog,
      bgm: {
        ...baseCatalog.bgm,
        // The adapter receives this manager-resolved value structurally, but
        // it must only consume `url` and never inspect `ref.path`.
        tower: towerSource,
      },
    };
    const fetchAudio = vi.fn(async () => new ArrayBuffer(8));
    const createContextSpy = vi.fn(() => fixture.context);
    const audio = createWebAudioPort({
      createContext: createContextSpy,
      fetchAudio,
      resolveSources: () => catalog,
    });

    await audio.setMusic('tower');
    expect(createContextSpy).not.toHaveBeenCalled();
    expect(fetchAudio).not.toHaveBeenCalled();

    await audio.unlock();

    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(fetchAudio).toHaveBeenCalledWith(suppliedUrl);
    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.start).toHaveBeenCalledWith(4, 0);
  });

  it('does not restart a music track that is already active', async () => {
    const fixture = createContext();
    const fetchAudio = vi.fn(async () => new ArrayBuffer(8));
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio,
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    await audio.setMusic('tower');

    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.start).toHaveBeenCalledTimes(1);
  });

  it('ramps a changed track down for exactly 150ms before replacement', async () => {
    const fixture = createContext();
    fixture.context.currentTime = 10;
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    await audio.setMusic('early-floors');

    const oldSource = fixture.bufferSources[0]!;
    const replacement = fixture.bufferSources[1]!;
    const musicGain = fixture.gainNodes[0]!.gain;
    expect(fixture.gainNodes).toHaveLength(1);
    expect(musicGain.calls).toContainEqual(['set', 1, 10]);
    expect(musicGain.calls).toContainEqual(['exponential', 0.0001, 10.15]);
    expect(oldSource.stop).toHaveBeenCalledWith(10.15);
    expect(replacement.start).toHaveBeenCalledWith(10.15, 0);
  });

  it('keeps the original fade when a scheduled replacement is superseded before it starts', async () => {
    const catalog = createCatalog();
    const towerPayload = new ArrayBuffer(8);
    const earlyPayload = new ArrayBuffer(8);
    const latePayload = new ArrayBuffer(8);
    const towerBuffer: WebAudioBufferPort = { duration: 5 };
    const earlyBuffer: WebAudioBufferPort = { duration: 7 };
    const lateBuffer: WebAudioBufferPort = { duration: 11 };
    const fixture = createContext(async (payload) => {
      if (payload === towerPayload) return towerBuffer;
      if (payload === earlyPayload) return earlyBuffer;
      return lateBuffer;
    });
    fixture.context.currentTime = 10;
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async (url) => {
        if (url === catalog.bgm.tower.url) return towerPayload;
        if (url === catalog.bgm['early-floors'].url) return earlyPayload;
        return latePayload;
      },
      resolveSources: () => catalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    await audio.setMusic('early-floors');
    const towerSource = fixture.bufferSources[0]!;
    const earlySource = fixture.bufferSources[1]!;
    const musicGain = fixture.gainNodes[0]!.gain;

    fixture.context.currentTime = 10.05;
    await audio.setMusic('late-floors');

    const lateSource = fixture.bufferSources[2]!;
    expect(towerSource.stop).toHaveBeenCalledWith(10.15);
    expect(earlySource.start).toHaveBeenCalledWith(10.15, 0);
    expect(earlySource.stop).toHaveBeenCalledWith(10.05);
    expect(earlySource.disconnect).toHaveBeenCalledTimes(1);
    expect(lateSource.buffer).toBe(lateBuffer);
    expect(lateSource.start).toHaveBeenCalledWith(10.15, 0);
    expect(musicGain.calls.filter(([operation, value]) => (
      operation === 'set' && value === 1
    ))).toEqual([['set', 1, 10]]);
    expect(musicGain.calls.filter(([operation, value]) => (
      operation === 'exponential' && value === 0.0001
    ))).toEqual([['exponential', 0.0001, 10.15]]);
  });

  it('stops an already-fading source immediately when audio is disabled', async () => {
    const fixture = createContext();
    fixture.context.currentTime = 10;
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    await audio.setMusic('early-floors');
    audio.setEnabled(false);

    expect(fixture.bufferSources[0]!.stop).toHaveBeenLastCalledWith(10);
    expect(fixture.bufferSources[1]!.stop).toHaveBeenLastCalledWith(10);
  });

  it('preserves modulo-buffer music offsets across mute and background suspension', async () => {
    const fixture = createContext(async () => ({ duration: 5 }));
    fixture.context.currentTime = 10;
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    fixture.context.currentTime = 17.25;
    audio.setEnabled(false);
    expect(fixture.bufferSources[0]!.stop).toHaveBeenCalledWith(17.25);

    audio.setEnabled(true);
    await flushMicrotasks();
    expect(fixture.bufferSources[1]!.start).toHaveBeenCalledWith(17.25, 2.25);

    fixture.context.currentTime = 29.75;
    await audio.suspend();
    expect(fixture.bufferSources[1]!.stop).toHaveBeenCalledWith(29.75);
    await audio.resume();
    expect(fixture.bufferSources[2]!.start).toHaveBeenCalledWith(29.75, 4.75);
  });

  it('requires enabled and unlocked foreground state before resuming music', async () => {
    const fixture = createContext();
    const createContextSpy = vi.fn(() => fixture.context);
    const audio = createWebAudioPort({
      createContext: createContextSpy,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.setMusic('tower');
    await audio.suspend();
    await audio.resume();
    expect(createContextSpy).not.toHaveBeenCalled();

    await audio.unlock();
    expect(fixture.bufferSources).toHaveLength(1);
    audio.setEnabled(false);
    await audio.suspend();
    await audio.resume();
    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.context.resume).toHaveBeenCalledTimes(1);
  });

  it('falls back to the oscillator when a decoded SFX buffer fails', async () => {
    const fixture = createContext(async () => {
      throw new Error('decode failed');
    });
    const catalog = createCatalog();
    const fetchAudio = vi.fn(async () => new ArrayBuffer(8));
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio,
      resolveSources: () => catalog,
    });

    await audio.unlock();
    audio.play('clear');
    await flushMicrotasks();

    expect(fetchAudio).toHaveBeenCalledWith(catalog.sfx.clear.url);
    expect(fixture.bufferSources).toHaveLength(0);
    await vi.waitFor(() => expect(fixture.oscillators).toHaveLength(1));
  });

  it('keeps BGM silent when its decoded buffer fails', async () => {
    const fixture = createContext(async () => {
      throw new Error('decode failed');
    });
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');

    expect(fixture.bufferSources).toHaveLength(0);
    expect(fixture.oscillators).toHaveLength(0);
  });

  it('uses oscillator/silent fallbacks without fetching when no source catalog is available', async () => {
    const fixture = createContext();
    const fetchAudio = vi.fn(async () => new ArrayBuffer(8));
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio,
      resolveSources: () => null,
    });

    await audio.unlock();
    audio.play('clear');
    await audio.setMusic('tower');

    expect(fetchAudio).not.toHaveBeenCalled();
    expect(fixture.oscillators).toHaveLength(1);
    expect(fixture.bufferSources).toHaveLength(0);
  });

  it('ignores stale music decodes so an older track cannot replace the active newer source', async () => {
    const towerPayload = new ArrayBuffer(8);
    const earlyPayload = new ArrayBuffer(8);
    const towerBuffer: WebAudioBufferPort = { duration: 7 };
    const earlyBuffer: WebAudioBufferPort = { duration: 11 };
    const towerDecode = deferred<WebAudioBufferPort>();
    const fixture = createContext(async (payload) => (
      payload === towerPayload ? towerDecode.promise : earlyBuffer
    ));
    const catalog = createCatalog();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async (url) => url === catalog.bgm.tower.url
        ? towerPayload
        : earlyPayload,
      resolveSources: () => catalog,
    });

    await audio.unlock();
    const staleTowerRequest = audio.setMusic('tower');
    await flushMicrotasks();
    await audio.setMusic('early-floors');

    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.buffer).toBe(earlyBuffer);
    const earlyGainCalls = fixture.gainNodes[0]!.gain.calls.length;

    towerDecode.resolve(towerBuffer);
    await staleTowerRequest;
    await flushMicrotasks();

    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.buffer).toBe(earlyBuffer);
    expect(fixture.bufferSources[0]!.connect).toHaveBeenCalledTimes(1);
    expect(fixture.gainNodes[0]!.gain.calls).toHaveLength(earlyGainCalls);
    await audio.setMusic('early-floors');
    expect(fixture.bufferSources).toHaveLength(1);
  });

  it('does not start a resolved decode after music is cleared or the port is destroyed', async () => {
    const nullDecode = deferred<WebAudioBufferPort>();
    const nullFixture = createContext(async () => nullDecode.promise);
    const nullAudio = createWebAudioPort({
      createContext: () => nullFixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });
    await nullAudio.unlock();
    const clearedRequest = nullAudio.setMusic('tower');
    await flushMicrotasks();
    await nullAudio.setMusic(null);
    nullDecode.resolve({ duration: 5 });
    await clearedRequest;
    expect(nullFixture.bufferSources).toHaveLength(0);

    const destroyDecode = deferred<WebAudioBufferPort>();
    const destroyFixture = createContext(async () => destroyDecode.promise);
    const destroyAudio = createWebAudioPort({
      createContext: () => destroyFixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });
    await destroyAudio.unlock();
    const destroyedRequest = destroyAudio.setMusic('tower');
    await flushMicrotasks();
    await destroyAudio.destroy();
    destroyDecode.resolve({ duration: 5 });
    await destroyedRequest;
    expect(destroyFixture.bufferSources).toHaveLength(0);
  });

  it('emits no cue while disabled or suspended and resumes only when enabled', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });
    await audio.unlock();

    audio.setEnabled(false);
    audio.play('move');
    await audio.suspend();
    await audio.resume();
    expect(fixture.oscillators).toHaveLength(0);
    expect(fixture.context.suspend).toHaveBeenCalledTimes(1);
    expect(fixture.context.resume).toHaveBeenCalledTimes(1);

    audio.setEnabled(true);
    await audio.resume();
    audio.play('move');
    expect(fixture.context.resume).toHaveBeenCalledTimes(2);
    expect(fixture.oscillators).toHaveLength(1);
  });

  it('swallows unsupported-context and context-operation failures and destroys once', async () => {
    const unavailable = createWebAudioPort({
      createContext: () => {
        throw new Error('unsupported');
      },
    });
    await expect(unavailable.unlock()).resolves.toBeUndefined();
    expect(() => unavailable.play('loss')).not.toThrow();

    const fixture = createContext();
    vi.mocked(fixture.context.close).mockRejectedValue(new Error('close failed'));
    const audio = createWebAudioPort({ createContext: () => fixture.context });
    await audio.unlock();
    await expect(audio.destroy()).resolves.toBeUndefined();
    await expect(audio.destroy()).resolves.toBeUndefined();
    expect(fixture.context.close).toHaveBeenCalledTimes(1);
  });
});
