import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const packagedRoot = process.argv[3] && path.resolve(process.argv[3]);
const { Transcriber } = require(packagedRoot ? path.join(packagedRoot, 'electron/transcriber.cjs') : '../electron/transcriber.cjs');
const input = process.argv[2];
if (!input) throw new Error('Usage: npm run test:engine -- path/to/16khz-mono-pcm16.wav');
const wav = await readFile(input);
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected RIFF WAV.');
let format, pcm;
for (let i = 12; i + 8 <= wav.length;) {
  const name = wav.toString('ascii', i, i + 4), size = wav.readUInt32LE(i + 4), start = i + 8;
  if (name === 'fmt ') format = wav.subarray(start, start + size);
  if (name === 'data') pcm = wav.subarray(start, start + size);
  i = start + size + size % 2;
}
if (!format || !pcm || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 16000 || format.readUInt16LE(14) !== 16) throw new Error('Expected 16 kHz mono PCM16 WAV.');
const audio = new Float32Array(pcm.length / 2);
for (let i = 0; i < audio.length; i++) audio[i] = pcm.readInt16LE(i * 2) / 32768;
const engine = new Transcriber(packagedRoot ? path.join(packagedRoot, '../models') : fileURLToPath(new URL('../models/', import.meta.url)), console.log);
try {
  await engine.request('load');
  const text = await engine.request('transcribe', audio);
  if (!text) throw new Error('No transcript produced.');
  console.log('OFFLINE TRANSCRIPT:', text);
} finally { await engine.close(); }
