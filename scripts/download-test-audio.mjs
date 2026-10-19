import { mkdir, writeFile } from 'node:fs/promises';
// Public-domain JFK speech fixture, downloaded only during development/CI.
const response = await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav');
if (!response.ok) throw new Error(`Fixture download failed: ${response.status}`);
const wav = Buffer.from(await response.arrayBuffer());
let format, pcm;
for (let i = 12; i + 8 <= wav.length;) {
  const size = wav.readUInt32LE(i + 4), name = wav.toString('ascii', i, i + 4);
  if (name === 'fmt ') format = wav.subarray(i + 8, i + 8 + size);
  if (name === 'data') pcm = wav.subarray(i + 8, i + 8 + size);
  i += 8 + size + size % 2;
}
if (!format || !pcm || format.readUInt16LE(0) !== 1 || format.readUInt16LE(14) !== 16) throw new Error('Unexpected test WAV encoding.');
const channels = format.readUInt16LE(2), rate = format.readUInt32LE(4);
const inputLength = pcm.length / (channels * 2), length = Math.floor(inputLength * 16000 / rate);
const output = Buffer.alloc(44 + length * 2);
output.write('RIFF'); output.writeUInt32LE(36 + length * 2, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16);
output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(16000, 24); output.writeUInt32LE(32000, 28);
output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(length * 2, 40);
const sample = index => {
  let sum = 0;
  for (let c = 0; c < channels; c++) sum += pcm.readInt16LE((index * channels + c) * 2) / channels;
  return sum;
};
for (let i = 0; i < length; i++) {
  const position = i * rate / 16000, left = Math.floor(position), fraction = position - left;
  output.writeInt16LE(Math.round(sample(left) * (1 - fraction) + sample(Math.min(left + 1, inputLength - 1)) * fraction), 44 + i * 2);
}
await mkdir('.test-artifacts', { recursive: true });
await writeFile('.test-artifacts/jfk-16k.wav', output);
console.log(`Prepared ${length / 16000} seconds of 16 kHz mono test audio.`);
