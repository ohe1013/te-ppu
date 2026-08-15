const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44_100;
const CHANNELS = 1;
const root = path.resolve(__dirname, '..');

function encodeMono(Mp3Encoder, samples, bitrate) {
  const encoder = new Mp3Encoder(CHANNELS, SAMPLE_RATE, bitrate);
  const chunks = [];
  const blockSize = 1_152;
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const chunk = samples.subarray(offset, Math.min(samples.length, offset + blockSize));
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

function writeAudio(relativePath, rendered, bitrate, Mp3Encoder) {
  const output = path.join(root, 'public', 'assets', 'audio', relativePath);
  const encoded = encodeMono(Mp3Encoder, rendered.samples, bitrate);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encoded);
  return {
    bytes: encoded.length,
    hash: createHash('sha256').update(encoded).digest('hex'),
  };
}

async function main() {
  let lamejs;
  try {
    lamejs = await import('@breezystack/lamejs');
  } catch {
    console.error('AUTHORED_AUDIO_ENCODER_REQUIRED');
    process.exitCode = 1;
    return;
  }

  if (typeof lamejs.Mp3Encoder !== 'function') {
    console.error('AUTHORED_AUDIO_ENCODER_REQUIRED');
    process.exitCode = 1;
    return;
  }

  const {
    BGM_DEFINITIONS,
    SFX_IDS,
    renderBgm,
    renderSfx,
  } = require('./audio-authoring.cjs');

  for (const track of Object.keys(BGM_DEFINITIONS)) {
    const rendered = renderBgm(track);
    const relativePath = path.join('bgm', `${track}.mp3`);
    const { bytes, hash } = writeAudio(relativePath, rendered, 160, lamejs.Mp3Encoder);
    console.log(`AUTHORED_AUDIO_FILE type=bgm id=${track} seconds=${rendered.durationSeconds.toFixed(3)} kbps=160 bytes=${bytes} sha256=${hash}`);
  }

  for (const cue of SFX_IDS) {
    const rendered = renderSfx(cue);
    const relativePath = path.join('sfx', `${cue}.mp3`);
    const { bytes, hash } = writeAudio(relativePath, rendered, 128, lamejs.Mp3Encoder);
    console.log(`AUTHORED_AUDIO_FILE type=sfx id=${cue} seconds=${rendered.durationSeconds.toFixed(3)} kbps=128 bytes=${bytes} sha256=${hash}`);
  }

  console.log(`AUTHORED_AUDIO_OK bgm=${Object.keys(BGM_DEFINITIONS).length} sfx=${SFX_IDS.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
