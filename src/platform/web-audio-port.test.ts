import { describe, expect, it, vi } from 'vitest';
import {
  createWebAudioPort,
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

function createContext() {
  const frequency = new TestParam();
  const gain = new TestParam();
  const oscillator = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    frequency,
    onended: null as ((event: Event) => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine' as OscillatorType,
  };
  const gainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain,
  };
  const context: WebAudioContextPort = {
    close: vi.fn(async () => undefined),
    createGain: vi.fn(() => gainNode),
    createOscillator: vi.fn(() => oscillator),
    currentTime: 4,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    state: 'suspended',
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
  };
  return { context, frequency, gain, gainNode, oscillator };
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
    expect(fixture.context.createOscillator).toHaveBeenCalledTimes(1);
    expect(fixture.oscillator.start).toHaveBeenCalledWith(4);
    expect(fixture.oscillator.stop).toHaveBeenCalledWith(4.14);
    expect(fixture.frequency.calls[0]).toEqual(['set', 660, 4]);
    expect(fixture.gain.calls).toEqual([
      ['set', 0.0001, 4],
      ['exponential', 0.12, 4.012],
      ['exponential', 0.0001, 4.14],
    ]);
  });

  it('emits no cue while disabled or suspended and resumes only when enabled', async () => {
    const fixture = createContext();
    const audio = createWebAudioPort({ createContext: () => fixture.context });
    await audio.unlock();

    audio.setEnabled(false);
    audio.play('move');
    await audio.suspend();
    await audio.resume();
    expect(fixture.context.createOscillator).not.toHaveBeenCalled();
    expect(fixture.context.suspend).toHaveBeenCalledTimes(1);
    expect(fixture.context.resume).toHaveBeenCalledTimes(1);

    audio.setEnabled(true);
    await audio.resume();
    audio.play('move');
    expect(fixture.context.resume).toHaveBeenCalledTimes(2);
    expect(fixture.context.createOscillator).toHaveBeenCalledTimes(1);
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
