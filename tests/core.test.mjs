import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validateAudio, appendTranscript } from '../shared/audio.mjs';
const require = createRequire(import.meta.url);
const { HistoryStore } = require('../electron/history.cjs');
const testRoot = fileURLToPath(new URL('../.test-artifacts/', import.meta.url));
await mkdir(testRoot, { recursive: true });
test('overlapping audio previews retain punctuation without duplicate boundary words', () => {
  assert.equal(appendTranscript('This is a good idea.', 'good idea, let us begin.'), 'This is a good idea. let us begin.');
  assert.equal(appendTranscript('', 'A fresh start.'), 'A fresh start.');
  assert.equal(appendTranscript('First thought.', 'Another thought.'), 'First thought. Another thought.');
});
test('audio boundary rejects malformed, huge, and non-finite payloads', () => {
  assert.throws(() => validateAudio([0, 0]));
  assert.throws(() => validateAudio(new Float32Array(4800001)));
  const audio = new Float32Array(1600); audio[5] = NaN;
  assert.throws(() => validateAudio(audio));
  audio[5] = 0.25; assert.equal(validateAudio(audio), audio);
});
test('concurrent saves persist atomically, survive reopening, and support deletion', async () => {
  const dir = await mkdtemp(path.join(testRoot, 'history-'));
  try {
    const store = new HistoryStore(dir);
    await Promise.all([store.add({ text: 'One', duration: 1 }), store.add({ text: 'Two', duration: 2 })]);
    const rows = await new HistoryStore(dir).read();
    assert.equal(rows.length, 2); assert.equal(new Set(rows.map(x => x.id)).size, 2);
    await store.remove(rows[0].id); assert.equal((await store.read()).length, 1);
    assert.equal(JSON.parse(await readFile(store.file, 'utf8')).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt history is preserved instead of silently overwritten', async () => {
  const dir = await mkdtemp(path.join(testRoot, 'history-'));
  try {
    const store = new HistoryStore(dir); await writeFile(store.file, '{broken');
    await assert.rejects(store.add({ text: 'New', duration: 1 }));
    assert.equal(await readFile(store.file, 'utf8'), '{broken');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
