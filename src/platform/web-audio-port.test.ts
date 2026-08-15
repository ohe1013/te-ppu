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

  cancelScheduledValues(cancelTime: number): void {
    this.calls.push(['cancel', 0, cancelTime]);
  }

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
  const destination = {};
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
    readonly playbackRate: TestParam;
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
        playbackRate: new TestParam(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gainNode = {
        connect: vi.fn((nextDestination: unknown) => nextDestination),
        disconnect: vi.fn(),
        gain: new TestParam(),
      };
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
    destination,
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    state: 'suspended',
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
  };
  const connects = (connect: { mock: { calls: unknown[][] } }, nextDestination: unknown) => (
    connect.mock.calls.some(([destination]) => destination === nextDestination)
  );
  const decodedCueGain = () => {
    const cueSource = bufferSources.find((source) => !source.loop);
    const gain = gainNodes.find((node) => cueSource !== undefined && connects(cueSource.connect, node));
    if (gain === undefined) throw new Error('Expected a decoded cue gain node.');
    return gain;
  };
  const oscillatorCueGain = () => {
    const oscillator = oscillators[0];
    const gain = gainNodes.find((node) => oscillator !== undefined && connects(oscillator.connect, node));
    if (gain === undefined) throw new Error('Expected an oscillator cue gain node.');
    return gain;
  };
  const musicDynamicsGain = () => {
    const musicSource = bufferSources.find((source) => source.loop);
    const gain = gainNodes.find((node) => musicSource !== undefined && connects(musicSource.connect, node));
    if (gain === undefined) throw new Error('Expected a music dynamics gain node.');
    return gain;
  };
  const musicVolumeGain = () => {
    const dynamics = musicDynamicsGain();
    const gain = gainNodes.find((node) => (
      node !== dynamics
      && connects(dynamics.connect, node)
      && connects(node.connect, destination)
    ));
    if (gain === undefined) throw new Error('Expected a music volume gain node.');
    return gain;
  };
  const sfxVolumeGain = () => {
    const cueGain = gainNodes.find((node) => (
      bufferSources.some((source) => !source.loop && connects(source.connect, node))
      || oscillators.some((source) => connects(source.connect, node))
    ));
    const gain = gainNodes.find((node) => (
      cueGain !== undefined
      && node !== cueGain
      && connects(cueGain.connect, node)
      && connects(node.connect, destination)
    ));
    if (gain === undefined) throw new Error('Expected an SFX volume gain node.');
    return gain;
  };
  return {
    bufferSources,
    context,
    decodedCueGain,
    gainNodes,
    musicDynamicsGain,
    musicVolumeGain,
    oscillatorCueGain,
    oscillators,
    sfxVolumeGain,
  };
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
    const gain = fixture.oscillatorCueGain().gain;
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

  it('rotates decoded cue sample rates in deterministic semitone variants', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    audio.play('rotate');
    audio.play('rotate');
    audio.play('rotate');
    await flushMicrotasks();

    expect(fixture.bufferSources).toHaveLength(3);
    expect(fixture.bufferSources.map((source) => source.playbackRate.calls[0]![1])).toEqual([
      1,
      expect.closeTo(1.122462, 6),
      expect.closeTo(1.259921, 6),
    ]);
  });

  it('keeps rotate profiles in play order when distinct decodes resolve out of order', async () => {
    const firstPayload = new ArrayBuffer(8);
    const secondPayload = new ArrayBuffer(8);
    const firstBuffer: WebAudioBufferPort = { duration: 5 };
    const secondBuffer: WebAudioBufferPort = { duration: 7 };
    const firstDecode = deferred<WebAudioBufferPort>();
    const secondDecode = deferred<WebAudioBufferPort>();
    const fixture = createContext(async (payload) => (
      payload === firstPayload ? firstDecode.promise : secondDecode.promise
    ));
    const catalog = createCatalog();
    const firstRotate = { generation: 2, url: 'https://cdn.example.test/rotate-first.mp3' };
    const secondRotate = { generation: 3, url: 'https://cdn.example.test/rotate-second.mp3' };
    let rotateRequest = 0;
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async (url) => url === firstRotate.url ? firstPayload : secondPayload,
      resolveSources: () => ({
        ...catalog,
        sfx: {
          ...catalog.sfx,
          rotate: rotateRequest++ === 0 ? firstRotate : secondRotate,
        },
      }),
    });

    await audio.unlock();
    audio.play('rotate');
    audio.play('rotate');
    await flushMicrotasks();

    secondDecode.resolve(secondBuffer);
    await flushMicrotasks();
    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.buffer).toBe(secondBuffer);
    expect(fixture.bufferSources[0]!.playbackRate.calls).toEqual([[
      'set',
      expect.closeTo(1.122462, 6),
      4,
    ]]);

    firstDecode.resolve(firstBuffer);
    await flushMicrotasks();
    expect(fixture.bufferSources).toHaveLength(2);
    const firstSource = fixture.bufferSources.find((source) => source.buffer === firstBuffer)!;
    expect(firstSource.playbackRate.calls).toEqual([['set', 1, 4]]);
  });

  it('applies the highest intensity sample profile to a clear cue', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    audio.play('clear', { intensity: 3 });
    await flushMicrotasks();

    expect(fixture.bufferSources[0]!.playbackRate.calls).toEqual([['set', 1.15, 4]]);
    expect(fixture.decodedCueGain().gain.calls).toEqual([['set', 1, 4]]);
  });

  it('applies the same intensity profile to fallback oscillator cues', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });

    await audio.unlock();
    audio.play('clear', { intensity: 3 });

    expect(fixture.oscillators[0]!.frequency.calls).toEqual([[
      'set',
      expect.closeTo(759, 10),
      4,
    ]]);
    expect(fixture.oscillatorCueGain().gain.calls).toEqual([
      ['set', 0.0001, 4],
      ['exponential', expect.closeTo(0.1632, 12), 4.012],
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

  it('remembers independent volumes before unlock and applies them to separate buses', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('rotate');
    await flushMicrotasks();

    expect(fixture.musicVolumeGain().gain.calls).toContainEqual(['set', 0.4, 4]);
    expect(fixture.sfxVolumeGain().gain.calls).toContainEqual(['set', 0.8, 4]);
    expect(fixture.decodedCueGain().gain.calls).toEqual([['set', 0.75, 4]]);
  });

  it('updates BGM volume without restarting the active music source', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('rotate');
    await flushMicrotasks();
    const source = fixture.bufferSources[0]!;
    const dynamics = fixture.musicDynamicsGain().gain;
    const dynamicsCalls = [...dynamics.calls];
    const sfxVolume = fixture.sfxVolumeGain().gain;
    const sfxVolumeCalls = [...sfxVolume.calls];
    const sourceCount = fixture.bufferSources.length;

    audio.setVolumes({ bgm: 0.2, sfx: 1 });

    expect(fixture.bufferSources).toHaveLength(sourceCount);
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(fixture.musicVolumeGain().gain.calls.slice(-2)).toEqual([
      ['cancel', 0, 4],
      ['set', 0.2, 4],
    ]);
    expect(dynamics.calls).toEqual(dynamicsCalls);
    expect(sfxVolume.calls).toEqual(sfxVolumeCalls);
  });

  it('updates only the SFX bus without changing music dynamics', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();
    const dynamics = fixture.musicDynamicsGain().gain;
    const dynamicsCalls = [...dynamics.calls];
    const musicVolume = fixture.musicVolumeGain().gain;
    const musicVolumeCalls = [...musicVolume.calls];

    audio.setVolumes({ bgm: 0.4, sfx: 0.2 });

    expect(fixture.sfxVolumeGain().gain.calls.slice(-2)).toEqual([
      ['cancel', 0, 4],
      ['set', 0.2, 4],
    ]);
    expect(dynamics.calls).toEqual(dynamicsCalls);
    expect(musicVolume.calls).toEqual(musicVolumeCalls);
  });

  it('allows BGM and SFX volume zero without muting a decoded cue at its local gain', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0, sfx: 0 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();

    expect(fixture.musicVolumeGain().gain.calls).toContainEqual(['set', 0, 4]);
    expect(fixture.sfxVolumeGain().gain.calls).toContainEqual(['set', 0, 4]);
    expect(fixture.decodedCueGain().gain.calls).toEqual([['set', 0.75, 4]]);
  });

  it('clamps stored user volumes to the normalized bus range', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: -1, sfx: 2 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();

    expect(fixture.musicVolumeGain().gain.calls).toContainEqual(['set', 0, 4]);
    expect(fixture.sfxVolumeGain().gain.calls).toContainEqual(['set', 1, 4]);
  });

  it('retains each bus volume for non-finite input while applying a valid sibling', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();
    const musicBus = fixture.musicVolumeGain().gain;
    const sfxBus = fixture.sfxVolumeGain().gain;

    audio.setVolumes({ bgm: Number.NaN, sfx: 0.3 });
    expect(musicBus.calls.slice(-1)).toEqual([['set', 0.4, 4]]);
    expect(sfxBus.calls.slice(-1)).toEqual([['set', 0.3, 4]]);

    audio.setVolumes({ bgm: 0.6, sfx: Infinity });
    expect(musicBus.calls.slice(-1)).toEqual([['set', 0.6, 4]]);
    expect(sfxBus.calls.slice(-1)).toEqual([['set', 0.3, 4]]);

    audio.setVolumes({ bgm: -Infinity, sfx: 0.7 });
    expect(musicBus.calls.slice(-1)).toEqual([['set', 0.6, 4]]);
    expect(sfxBus.calls.slice(-1)).toEqual([['set', 0.7, 4]]);
  });

  it('ducks and restores only music dynamics while retaining the user BGM volume', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    const volume = fixture.musicVolumeGain().gain;
    const volumeCalls = [...volume.calls];
    audio.play('clear', { duckMusic: true });
    await flushMicrotasks();

    expect(fixture.musicDynamicsGain().gain.calls.slice(-5)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
      ['exponential', 0.65, 4.02],
      ['set', 0.65, 4.09],
      ['exponential', 1, 4.27],
    ]);
    expect(volume.calls).toEqual(volumeCalls);
    expect(volume.calls).toContainEqual(['set', 0.4, 4]);
  });

  it('routes oscillator fallbacks through the shared SFX volume bus', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    audio.play('clear');

    const sfxBus = fixture.sfxVolumeGain();
    expect(fixture.oscillatorCueGain().connect).toHaveBeenCalledWith(sfxBus);
    expect(sfxBus.connect).toHaveBeenCalledWith(fixture.context.destination);
  });

  it('retains both user volumes across suspend and resume', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();
    const musicBus = fixture.musicVolumeGain();
    const sfxBus = fixture.sfxVolumeGain();

    await audio.suspend();
    const musicCallsBeforeUpdate = musicBus.gain.calls.length;
    const sfxCallsBeforeUpdate = sfxBus.gain.calls.length;
    audio.setVolumes({ bgm: 0.25, sfx: 0.65 });

    expect(musicBus.gain.calls.slice(musicCallsBeforeUpdate)).toEqual([
      ['cancel', 0, 4],
      ['set', 0.25, 4],
    ]);
    expect(sfxBus.gain.calls.slice(sfxCallsBeforeUpdate)).toEqual([
      ['cancel', 0, 4],
      ['set', 0.65, 4],
    ]);
    const musicCallsAfterUpdate = [...musicBus.gain.calls];
    const sfxCallsAfterUpdate = [...sfxBus.gain.calls];

    await audio.resume();

    expect(fixture.musicVolumeGain()).toBe(musicBus);
    expect(fixture.sfxVolumeGain()).toBe(sfxBus);
    expect(musicBus.gain.calls).toEqual(musicCallsAfterUpdate);
    expect(sfxBus.gain.calls).toEqual(sfxCallsAfterUpdate);
    expect(musicBus.gain.calls).not.toContainEqual(['set', 0.65, 4]);
    expect(sfxBus.gain.calls).not.toContainEqual(['set', 0.25, 4]);
  });

  it('finishes suspended when backgrounding follows a deferred resume', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });
    await audio.unlock();
    await audio.suspend();
    const resumed = deferred<void>();
    vi.mocked(fixture.context.resume).mockImplementationOnce(async () => {
      await resumed.promise;
      fixture.context.state = 'running';
    });

    const foregrounding = audio.resume();
    await flushMicrotasks();
    expect(fixture.context.resume).toHaveBeenCalledTimes(2);
    const backgrounding = audio.suspend();
    resumed.resolve(undefined);
    await Promise.all([foregrounding, backgrounding]);

    expect(fixture.context.state).toBe('suspended');
    expect(fixture.context.suspend).toHaveBeenCalledTimes(2);
  });

  it('finishes running when foregrounding follows a deferred suspend', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });
    await audio.unlock();
    const suspended = deferred<void>();
    vi.mocked(fixture.context.suspend).mockImplementationOnce(async () => {
      await suspended.promise;
      fixture.context.state = 'suspended';
    });

    const backgrounding = audio.suspend();
    await flushMicrotasks();
    expect(fixture.context.suspend).toHaveBeenCalledTimes(1);
    const foregrounding = audio.resume();
    suspended.resolve(undefined);
    await Promise.all([backgrounding, foregrounding]);

    expect(fixture.context.state).toBe('running');
    expect(fixture.context.resume).toHaveBeenCalledTimes(2);
  });

  it('disconnects both user-volume buses on destroy and ignores later volume changes', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear');
    await flushMicrotasks();
    const musicBus = fixture.musicVolumeGain();
    const sfxBus = fixture.sfxVolumeGain();

    await audio.destroy();
    const musicCalls = [...musicBus.gain.calls];
    const sfxCalls = [...sfxBus.gain.calls];
    audio.setVolumes({ bgm: 1, sfx: 1 });

    expect(musicBus.disconnect).toHaveBeenCalledTimes(1);
    expect(sfxBus.disconnect).toHaveBeenCalledTimes(1);
    expect(musicBus.gain.calls).toEqual(musicCalls);
    expect(sfxBus.gain.calls).toEqual(sfxCalls);
  });

  it('ducks active audible music for an intensity-three cue', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();

    expect(musicGain.calls.slice(-5)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
      ['exponential', 0.65, 4.02],
      ['set', 0.65, 4.09],
      ['exponential', 1, 4.27],
    ]);
  });

  it('cancels the prior duck automation before scheduling a repeated duck', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    fixture.context.currentTime = 4.03;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();

    expect(musicGain.calls.slice(-5)).toEqual([
      ['cancel', 0, 4.03],
      ['set', 1, 4.03],
      ['exponential', 0.65, 4.05],
      ['set', 0.65, 4.12],
      ['exponential', 1, 4.3],
    ]);
  });

  it('drops a deferred decoded cue after disable and re-enable without ducking resumed music', async () => {
    const catalog = createCatalog();
    const musicPayload = new ArrayBuffer(8);
    const cuePayload = new ArrayBuffer(8);
    const musicBuffer: WebAudioBufferPort = { duration: 5 };
    const cueDecode = deferred<WebAudioBufferPort>();
    const fixture = createContext(async (payload) => (
      payload === cuePayload ? cueDecode.promise : musicBuffer
    ));
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async (url) => url === catalog.sfx.clear.url ? cuePayload : musicPayload,
      resolveSources: () => catalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    audio.setEnabled(false);
    audio.setEnabled(true);
    await vi.waitFor(() => expect(fixture.bufferSources).toHaveLength(2));
    const musicGain = fixture.musicDynamicsGain().gain;
    const callsAfterResume = [...musicGain.calls];

    cueDecode.resolve({ duration: 0.14 });
    await flushMicrotasks();

    expect(fixture.bufferSources).toHaveLength(2);
    expect(musicGain.calls).toEqual(callsAfterResume);
  });

  it('drops a deferred fallback cue after suspend and resume without ducking resumed music', async () => {
    const catalog = createCatalog();
    const musicPayload = new ArrayBuffer(8);
    const cuePayload = new ArrayBuffer(8);
    const musicBuffer: WebAudioBufferPort = { duration: 5 };
    const cueDecode = deferred<WebAudioBufferPort>();
    const fixture = createContext(async (payload) => (
      payload === cuePayload ? cueDecode.promise : musicBuffer
    ));
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async (url) => url === catalog.sfx.attack.url ? cuePayload : musicPayload,
      resolveSources: () => catalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    audio.play('attack', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    await audio.suspend();
    await audio.resume();
    expect(fixture.bufferSources).toHaveLength(2);
    const musicGain = fixture.musicDynamicsGain().gain;
    const callsAfterResume = [...musicGain.calls];

    cueDecode.reject(new Error('decode failed'));
    await flushMicrotasks();

    expect(fixture.oscillators).toHaveLength(0);
    expect(musicGain.calls).toEqual(callsAfterResume);
  });

  it('does not duck a scheduled replacement before its music is audible', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    await audio.setMusic('early-floors');
    const musicGain = fixture.musicDynamicsGain().gain;
    const callsBeforeCue = [...musicGain.calls];
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();

    expect(musicGain.calls).toEqual(callsBeforeCue);
  });

  it('does not duck when no music is active', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();

    expect(fixture.decodedCueGain().gain.calls).toEqual([['set', 1, 4]]);
  });

  it('cancels duck automation before disabling active music', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    audio.setEnabled(false);

    expect(musicGain.calls.slice(-2)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
    ]);
  });

  it('cancels duck automation before suspending active music', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    await audio.suspend();

    expect(musicGain.calls.slice(-2)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
    ]);
  });

  it('cancels duck automation before replacing active music', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    await audio.setMusic('early-floors');

    expect(musicGain.calls.slice(-5)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
      ['exponential', 0.0001, 4.15],
      ['set', 0.0001, 4.15],
      ['exponential', 1, 4.162],
    ]);
  });

  it('cancels duck automation before destroying active music', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({
      createContext: () => fixture.context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveSources: createCatalog,
    });

    await audio.unlock();
    await audio.setMusic('tower');
    const musicGain = fixture.musicDynamicsGain().gain;
    audio.play('clear', { intensity: 3, duckMusic: true });
    await flushMicrotasks();
    await audio.destroy();

    expect(musicGain.calls.slice(-2)).toEqual([
      ['cancel', 0, 4],
      ['set', 1, 4],
    ]);
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
    const musicGain = fixture.musicDynamicsGain().gain;
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
    const musicGain = fixture.musicDynamicsGain().gain;

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

  it('keeps an existing fade intact when a decoding replacement is superseded', async () => {
    const catalog = createCatalog();
    const towerPayload = new ArrayBuffer(8);
    const earlyPayload = new ArrayBuffer(8);
    const latePayload = new ArrayBuffer(8);
    const towerBuffer: WebAudioBufferPort = { duration: 5 };
    const earlyDecode = deferred<WebAudioBufferPort>();
    const lateBuffer: WebAudioBufferPort = { duration: 11 };
    const fixture = createContext(async (payload) => {
      if (payload === towerPayload) return towerBuffer;
      if (payload === earlyPayload) return earlyDecode.promise;
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
    const firstReplacement = audio.setMusic('early-floors');
    await flushMicrotasks();
    const towerSource = fixture.bufferSources[0]!;
    const musicGain = fixture.musicDynamicsGain().gain;
    const callsDuringFade = musicGain.calls.length;
    fixture.context.currentTime = 10.05;

    await audio.setMusic('late-floors');
    earlyDecode.resolve({ duration: 7 });
    await firstReplacement;

    expect(towerSource.stop).toHaveBeenCalledWith(10.15);
    expect(fixture.bufferSources[1]!.buffer).toBe(lateBuffer);
    expect(fixture.bufferSources[1]!.start).toHaveBeenCalledWith(10.15, 0);
    expect(musicGain.calls.slice(callsDuringFade)).toEqual([
      ['set', 0.0001, 10.15],
      ['exponential', 1, 10.162],
    ]);
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
    const earlyGainCalls = fixture.musicDynamicsGain().gain.calls.length;

    towerDecode.resolve(towerBuffer);
    await staleTowerRequest;
    await flushMicrotasks();

    expect(fixture.bufferSources).toHaveLength(1);
    expect(fixture.bufferSources[0]!.buffer).toBe(earlyBuffer);
    expect(fixture.bufferSources[0]!.connect).toHaveBeenCalledTimes(1);
    expect(fixture.musicDynamicsGain().gain.calls).toHaveLength(earlyGainCalls);
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
