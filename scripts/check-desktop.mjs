import { _electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const artifacts = path.join(root, '.test-artifacts');
await mkdir(artifacts, { recursive: true });
const env = { ...process.env, WHISPERFLOW_TEST_DATA: path.join(artifacts, `profile-${Date.now()}`) };
delete env.ELECTRON_RUN_AS_NODE;
await mkdir(env.WHISPERFLOW_TEST_DATA, { recursive: true });
const fixture = process.argv[2];
const args = ['.'];
if (fixture) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(fixture)}`);
const desktop = await _electron.launch({ args, cwd: root, env, timeout: 60000 });
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#record:not([disabled])').waitFor({ timeout: 180000 });
  await page.screenshot({ path: path.join(artifacts, 'ready.png') });
  // Prove both renderer network requests and worker network fallback are disabled.
  const networkBlocked = await page.evaluate(async () => {
    try { await fetch('https://api.openai.com/v1/models'); return false; } catch { return true; }
  });
  assert.equal(networkBlocked, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  if (fixture) {
    await page.locator('#record').click();
    await page.getByText('Listening to you', { exact: true }).waitFor();
    await page.waitForTimeout(20000);
    await page.locator('#record').click();
    await page.getByText('Ready when you are', { exact: true }).waitFor({ timeout: 180000 });
    const text = await page.locator('#transcript').inputValue();
    assert.match(text, /fellow|country|ask|Americans/i);
    assert.match(await page.locator('#save-status').textContent(), /Saved/);
    await page.screenshot({ path: path.join(artifacts, 'transcribed.png') });
    await page.locator('#copy').click();
    assert.equal(await desktop.evaluate(({ clipboard }) => clipboard.readText()), text);
    await page.locator('#history-tab').click();
    assert.equal(await page.locator('.history-card').count(), 1);
    await page.locator('#search').fill('no-such-phrase-123');
    assert.equal(await page.locator('.history-card').count(), 0);
    await page.locator('#search').fill('');
    const saved = JSON.parse(await readFile(path.join(env.WHISPERFLOW_TEST_DATA, 'history.json'), 'utf8'));
    assert.equal(saved[0].text, text);
    await page.reload();
    await page.locator('#record:not([disabled])').waitFor({ timeout: 180000 });
    await page.locator('#history-tab').click();
    assert.equal(await page.locator('.history-card').count(), 1);
    console.log('PASS: actual microphone pipeline (fixture), offline inference, copy, save, search, reload persistence.');
    console.log('TRANSCRIPT:', text);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop startup, local model load, renderer isolation, blocked network, no UI exceptions.');
} finally { await desktop.close(); }

