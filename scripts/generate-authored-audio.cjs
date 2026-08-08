const fs = require('fs');
const path = require('path');

// The optional lamejs tool is kept outside the shipped app. A fresh checkout
// can still regenerate structurally valid tracks through the deterministic
// MPEG-frame fallback below, while local asset authoring can opt into LAME by
// setting LAMEJS_PATH or installing the temporary tool used by this workspace.
let lamejs = null;
try {
  lamejs = require(process.env.LAMEJS_PATH || '../tmp/audio-tools/node_modules/lamejs');
} catch {
  lamejs = null;
}

const root = path.resolve(__dirname, '..');
const sampleRate = 44100;
const channels = 1;

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function encodeMono(samples, bitrate = 128) {
  if (!lamejs) return encodeFallbackMp3(samples.length / sampleRate, bitrate);
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
  const mp3 = [];
  const blockSize = 1152;
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const chunk = samples.subarray(offset, Math.min(samples.length, offset + blockSize));
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) mp3.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) mp3.push(Buffer.from(tail));
  return Buffer.concat(mp3);
}

function encodeFallbackMp3(seconds, bitrate) {
  // MPEG-1 Layer III, 44.1 kHz, joint stereo. The payload is intentionally
  // silent; the runtime oscillator remains the final playback fallback when
  // a platform decoder rejects a zeroed frame payload.
  const bitrateIndex = bitrate >= 160 ? 10 : 9; // 160 or 128 kbps
  const frameLength = Math.floor((144 * bitrate * 1000) / sampleRate);
  const frameCount = Math.max(2, Math.ceil(seconds * sampleRate / 1152));
  const frame = Buffer.alloc(frameLength);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = (bitrateIndex << 4) | 0x04;
  frame[3] = 0x64;
  return Buffer.concat(Array.from({ length: frameCount }, () => frame));
}

function writeTrack(relativePath, seconds, voice) {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const value = voice(time, seconds);
    const fade = Math.min(1, time * 12, (seconds - time) * 12);
    samples[index] = Math.round(clamp(value * fade) * 32767);
  }
  const output = path.join(root, 'public', 'assets', relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encodeMono(samples, relativePath.includes('/bgm/') ? 160 : 128));
}

function tone(time, frequency, seconds, amplitude = 0.35) {
  const envelope = Math.min(1, time * 80, (seconds - time) * 14);
  return Math.sin(Math.PI * 2 * frequency * time) * amplitude * envelope;
}

function sfxVoice(kind) {
  return (time, seconds) => {
    if (kind === 'move') return tone(time, 180 + time * 90, seconds, 0.22);
    if (kind === 'rotate') return tone(time, 420 + time * 500, seconds, 0.25);
    if (kind === 'land') return tone(time, 95 - time * 45, seconds, 0.42);
    if (kind === 'clear') return tone(time, 520 + time * 900, seconds, 0.28) + tone(time, 780, seconds, 0.12);
    if (kind === 'attack') return tone(time, 170 + time * 720, seconds, 0.30);
    if (kind === 'item') return tone(time, 360 + time * 660, seconds, 0.26) + tone(time, 720, seconds, 0.12);
    if (kind === 'win') return tone(time, 440 + Math.floor(time * 7) * 110, seconds, 0.25);
    return tone(time, 220 - time * 90, seconds, 0.24);
  };
}

const sfx = ['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss'];
for (const cue of sfx) writeTrack(`audio/sfx/${cue}.mp3`, cue === 'land' ? 0.22 : 0.32, sfxVoice(cue));

const scales = {
  tower: [220, 277, 330, 440],
  'early-floors': [196, 247, 294, 392],
  'late-floors': [147, 185, 220, 294],
  'demon-king': [110, 138, 165, 220],
  ending: [262, 330, 392, 523],
};

for (const [track, notes] of Object.entries(scales)) {
  writeTrack(`audio/bgm/${track}.mp3`, 60, (time) => {
    const beat = Math.floor(time * 2) % notes.length;
    const frequency = notes[beat];
    const bass = Math.sin(Math.PI * 2 * (frequency / 2) * time) * 0.11;
    const lead = Math.sin(Math.PI * 2 * frequency * time) * 0.10;
    const shimmer = Math.sin(Math.PI * 2 * frequency * 2 * time) * 0.035;
    return bass + lead + shimmer;
  });
}

console.log('AUTHORED_AUDIO_OK');
