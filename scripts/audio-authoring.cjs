const SAMPLE_RATE = 44_100;
const TAU = Math.PI * 2;

const BGM_DEFINITIONS = Object.freeze({
  tower: { bpm: 150, bars: 32, key: 60, motif: [0, 4, 7, 9, 7, 4, 2, 4, 7, 9, 12, 9, 7, 4, 2, null] },
  'early-floors': { bpm: 162, bars: 32, key: 62, motif: [0, 7, 4, 9, 7, 12, 9, 7, 4, 7, 11, 14, 12, 9, 7, 4] },
  'late-floors': { bpm: 174, bars: 36, key: 57, motif: [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 14, 10, 8, 5] },
  'demon-king': { bpm: 168, bars: 36, key: 55, motif: [0, 6, 7, 3, 10, 7, 6, 3, 0, 3, 7, 10, 6, 3, 1, 0] },
  ending: { bpm: 152, bars: 32, key: 60, motif: [0, 4, 7, 12, 11, 9, 7, 4, 5, 9, 12, 16, 14, 12, 11, 12] },
});

const CHORDS = Object.freeze({
  tower: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  'early-floors': [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]],
  'late-floors': [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  'demon-king': [[0, 3, 7], [6, 10, 13], [7, 10, 14], [1, 5, 8]],
  ending: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
});

const SFX_IDS = Object.freeze(['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss']);
const SFX_PHRASES = Object.freeze({
  move: [{ at: 0, seconds: 0.055, from: 55, to: 59, wave: 'square', gain: 0.18 }],
  rotate: [
    { at: 0, seconds: 0.075, from: 72, to: 79, wave: 'triangle', gain: 0.24 },
    { at: 0.055, seconds: 0.095, from: 79, to: 86, wave: 'pulse', gain: 0.18 },
  ],
  land: [
    { at: 0, seconds: 0.12, from: 43, to: 31, wave: 'triangle', gain: 0.34 },
    { at: 0.055, seconds: 0.08, from: 67, to: 62, wave: 'pulse', gain: 0.12 },
  ],
  clear: [72, 79, 84, 91].map((midi, index) => ({ at: index * 0.045, seconds: 0.11, from: midi, to: midi + 2, wave: 'triangle', gain: 0.18 })),
  attack: [
    { at: 0, seconds: 0.22, from: 45, to: 72, wave: 'saw', gain: 0.25 },
    { at: 0.12, seconds: 0.12, from: 36, to: 31, wave: 'noise', gain: 0.20 },
  ],
  item: [67, 74, 79].map((midi, index) => ({ at: index * 0.05, seconds: 0.14, from: midi, to: midi, wave: 'sine', gain: 0.20 })),
  win: [72, 76, 79, 84].map((midi, index) => ({ at: index * 0.075, seconds: 0.18, from: midi, to: midi, wave: 'pulse', gain: 0.22 })),
  loss: [55, 52, 48].map((midi, index) => ({ at: index * 0.08, seconds: 0.16, from: midi, to: midi - 1, wave: 'triangle', gain: 0.18 })),
});

function deterministicNoise(sampleIndex, seed) {
  let value = (sampleIndex + 1) ^ Math.imul(seed + 17, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff * 2 - 1;
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function sectionForBar(bar) {
  if (bar <= 3) return 'intro';
  if (bar <= 11) return 'a';
  if (bar <= 19) return 'b';
  if (bar <= 23) return 'break';
  return 'chorus';
}

function oscillator(wave, phase) {
  const cycle = phase / TAU - Math.floor(phase / TAU);
  if (wave === 'sine') return Math.sin(phase);
  if (wave === 'triangle') return 1 - 4 * Math.abs(cycle - 0.5);
  if (wave === 'pulse') return cycle < 0.25 ? 1 : -1;
  if (wave === 'square') return cycle < 0.5 ? 1 : -1;
  if (wave === 'saw') return cycle * 2 - 1;
  throw new Error(`Unsupported wave: ${wave}`);
}

function eventEnvelope(localSample, sampleCount, attackSeconds = 0.006, releaseSeconds = 0.035) {
  const attackSamples = Math.max(1, Math.round(attackSeconds * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.min(sampleCount, Math.round(releaseSeconds * SAMPLE_RATE)));
  return Math.min(1, localSample / attackSamples, (sampleCount - 1 - localSample) / releaseSamples);
}

function addEvent(mix, event, seed = 0) {
  const start = Math.max(0, Math.round(event.at * SAMPLE_RATE));
  const sampleCount = Math.max(1, Math.round(event.seconds * SAMPLE_RATE));
  const end = Math.min(mix.length, start + sampleCount);
  const fromFrequency = midiToFrequency(event.from);
  const toFrequency = midiToFrequency(event.to);
  const releaseSeconds = Math.min(0.045, event.seconds * 0.28);
  let phase = 0;

  for (let index = start; index < end; index += 1) {
    const localSample = index - start;
    const progress = sampleCount <= 1 ? 1 : localSample / (sampleCount - 1);
    const envelope = eventEnvelope(localSample, sampleCount, Math.min(0.006, event.seconds * 0.12), releaseSeconds);
    let value;
    if (event.wave === 'noise') {
      value = deterministicNoise(index, seed);
    } else {
      const frequency = fromFrequency + (toFrequency - fromFrequency) * progress;
      phase += TAU * frequency / SAMPLE_RATE;
      value = oscillator(event.wave, phase);
    }
    mix[index] += value * event.gain * envelope;
  }
}

function trackSeed(track) {
  let seed = 0;
  for (let index = 0; index < track.length; index += 1) {
    seed = Math.imul(seed ^ track.charCodeAt(index), 16_777_619);
  }
  return seed | 0;
}

function addDrums(mix, at, beatSeconds, section, bar, seed) {
  const halfTimeBar = section === 'break' && bar % 2 === 1;
  if (halfTimeBar) return;

  for (const beat of [0, 2]) {
    addEvent(mix, {
      at: at + beat * beatSeconds,
      seconds: 0.13,
      from: 43,
      to: 31,
      wave: 'sine',
      gain: section === 'intro' ? 0.18 : 0.24,
    }, seed + bar * 31 + beat);
  }
  for (const beat of [1, 3]) {
    addEvent(mix, {
      at: at + beat * beatSeconds,
      seconds: 0.09,
      from: 48,
      to: 44,
      wave: 'noise',
      gain: section === 'intro' ? 0.08 : 0.13,
    }, seed + bar * 37 + beat);
  }

  const hatStep = section === 'chorus' || section === 'b' ? 0.5 : section === 'a' ? 1 : null;
  if (hatStep !== null) {
    for (let beat = 0; beat < 4; beat += hatStep) {
      addEvent(mix, {
        at: at + beat * beatSeconds,
        seconds: 0.035,
        from: 84,
        to: 84,
        wave: 'noise',
        gain: section === 'chorus' ? 0.055 : 0.035,
      }, seed + bar * 41 + Math.round(beat * 2));
    }
  }
}

function addBass(mix, definition, chord, barAt, beatSeconds, section) {
  const beatStride = section === 'break' ? 2 : 1;
  for (let beat = 0; beat < 4; beat += beatStride) {
    const offset = chord[beat % chord.length];
    addEvent(mix, {
      at: barAt + beat * beatSeconds,
      seconds: beatSeconds * (section === 'break' ? 1.55 : 0.78),
      from: definition.key + offset - 24,
      to: definition.key + offset - 24,
      wave: 'triangle',
      gain: section === 'break' ? 0.16 : 0.12,
    });
  }
}

function addHarmony(mix, definition, chord, barAt, barSeconds, section) {
  if (section === 'break') return;
  const gain = section === 'chorus' ? 0.052 : section === 'intro' ? 0.032 : 0.042;
  for (const offset of chord) {
    addEvent(mix, {
      at: barAt,
      seconds: barSeconds * 0.94,
      from: definition.key + offset - 12,
      to: definition.key + offset - 12,
      wave: 'pulse',
      gain,
    });
  }
}

function addMelody(mix, definition, bar, barAt, beatSeconds, section) {
  if (section === 'break') return;
  const stepSeconds = beatSeconds / 2;
  for (let step = 0; step < 8; step += 1) {
    const motifIndex = (bar * 8 + step) % definition.motif.length;
    const motifNote = definition.motif[motifIndex];
    if (motifNote === null) continue;
    const fifth = section === 'b' && motifIndex % 2 === 1 ? 7 : 0;
    addEvent(mix, {
      at: barAt + step * stepSeconds,
      seconds: stepSeconds * 0.82,
      from: definition.key + motifNote + fifth,
      to: definition.key + motifNote + fifth,
      wave: 'triangle',
      gain: section === 'chorus' ? 0.20 : 0.17,
    });

    if (section === 'chorus' && step % 2 === 1) {
      const counterNote = definition.motif[(motifIndex + 5) % definition.motif.length];
      if (counterNote !== null) {
        addEvent(mix, {
          at: barAt + step * stepSeconds,
          seconds: stepSeconds * 0.72,
          from: definition.key + counterNote + 12,
          to: definition.key + counterNote + 12,
          wave: 'sine',
          gain: 0.075,
        });
      }
    }
  }
}

function toInt16(mix) {
  const samples = new Int16Array(mix.length);
  for (let index = 0; index < mix.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, mix[index]));
    samples[index] = Math.round(clamped * 32_767);
  }
  return samples;
}

function renderBgm(track) {
  const definition = BGM_DEFINITIONS[track];
  if (!definition) throw new Error(`Unknown BGM track: ${track}`);

  const beatSeconds = 60 / definition.bpm;
  const barSeconds = beatSeconds * 4;
  const durationSeconds = definition.bars * barSeconds;
  const mix = new Float32Array(Math.round(durationSeconds * SAMPLE_RATE));
  const seed = trackSeed(track);

  for (let bar = 0; bar < definition.bars; bar += 1) {
    const section = sectionForBar(bar);
    const barAt = bar * barSeconds;
    const chord = CHORDS[track][bar % CHORDS[track].length];
    addBass(mix, definition, chord, barAt, beatSeconds, section);
    addHarmony(mix, definition, chord, barAt, barSeconds, section);
    addMelody(mix, definition, bar, barAt, beatSeconds, section);
    addDrums(mix, barAt, beatSeconds, section, bar, seed);
  }

  return {
    durationSeconds,
    samples: toInt16(mix),
    sections: ['intro', 'a', 'b', 'break', 'chorus'],
  };
}

function renderSfx(cue) {
  const phrase = SFX_PHRASES[cue];
  if (!phrase) throw new Error(`Unknown SFX cue: ${cue}`);
  const durationSeconds = Math.max(...phrase.map(({ at, seconds }) => at + seconds));
  const mix = new Float32Array(Math.round(durationSeconds * SAMPLE_RATE));
  const seed = trackSeed(cue);
  for (let index = 0; index < phrase.length; index += 1) {
    addEvent(mix, phrase[index], seed + index * 97);
  }
  return { durationSeconds, samples: toInt16(mix) };
}

module.exports = {
  BGM_DEFINITIONS,
  SFX_IDS,
  renderBgm,
  renderSfx,
};
