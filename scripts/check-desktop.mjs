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
  const dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.dismiss(); });
  await page.locator('#record:not([disabled])').waitFor({ timeout: 180000 });
  await page.screenshot({ path: path.join(artifacts, 'ready.png') });
  // Prove both renderer network requests and worker network fallback are disabled.
  const networkBlocked = await page.evaluate(async () => {
    try { await fetch('https://api.openai.com/v1/models'); return false; } catch { return true; }
  });
  assert.equal(networkBlocked, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  // Reproduce a regular browser: a separate window with no preload/IPC bridge.
  const unsupportedWindowPromise = desktop.waitForEvent('window');
  await desktop.evaluate(async ({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/index.html'));
    const browserOnly = new BrowserWindow({ show: false, webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true
    } });
    await browserOnly.loadURL(main.webContents.getURL());
  });
  const browserOnly = await unsupportedWindowPromise;
  await browserOnly.getByText('Open the desktop app', { exact: true }).first().waitFor();
  assert.equal(await browserOnly.locator('#record').isDisabled(), true);
  assert.match(await browserOnly.locator('#notice').textContent(), /Whisperflow Local\.exe/);
  await browserOnly.close();
  console.log('PASS: browser-only page shows launch instructions instead of an endless loading state.');
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
    if (process.platform === 'win32') {
      // A separate process proves that we paste into another application, not our own UI.
      const targetEnv = { ...env, WHISPERFLOW_TEST_DATA: path.join(artifacts, `target-${Date.now()}`) };
      await mkdir(targetEnv.WHISPERFLOW_TEST_DATA, { recursive: true });
      await desktop.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/index.html')).close();
      });
      assert.equal(await desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/index.html')).isVisible()), false);
      const target = await _electron.launch({ args: [path.join(root, 'tests/fixtures/paste-target.cjs')], env: targetEnv, timeout: 60000 });
      try {
        const fieldPage = await target.firstWindow();
        await target.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
        await fieldPage.locator('#target').click();
        const expectedPid = await target.evaluate(() => process.pid);
        const captured = await desktop.evaluate(({ app }) =>
          require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs')).createWindowsIntegration().captureTarget());
        assert.equal(captured?.pid, expectedPid, 'The external text box must have OS focus.');
        await desktop.evaluate(({ app }) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().sendKeys([{ key: 0xa3 }]));
        await page.getByText('Listening to you', { exact: true }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(6000);
        await desktop.evaluate(({ app }) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().sendKeys([{ key: 0xa3, up: true }]));
        await page.getByText('Ready when you are', { exact: true }).waitFor({ timeout: 180000 });
        const dictated = await fieldPage.locator('#target').inputValue();
        assert.match(dictated, /fellow|Americans|country|ask/i);
        assert.equal(dictated.includes('\n'), false, 'Paste must not press Enter.');
        assert.equal(await desktop.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/index.html')).isVisible()), false);
        await fieldPage.screenshot({ path: path.join(artifacts, 'pasted-into-external-app.png') });
        // Test the existing toggle chord too, with no reset/new-recording confirmation.
        await fieldPage.locator('#target').fill('');
        const toggleKeys = [{ key: 0x11 }, { key: 0x10 }, { key: 0x20 }, { key: 0x20, up: true }, { key: 0x10, up: true }, { key: 0x11, up: true }];
        await desktop.evaluate(({ app }, keys) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().sendKeys(keys), toggleKeys);
        await page.getByText('Listening to you', { exact: true }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(6000);
        await desktop.evaluate(({ app }, keys) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().sendKeys(keys), toggleKeys);
        await page.getByText('Ready when you are', { exact: true }).waitFor({ timeout: 180000 });
        assert.match(await fieldPage.locator('#target').inputValue(), /fellow|Americans|country|ask/i);
        const indicator = desktop.windows().find(p => p.url().endsWith('/src/overlay.html'));
        assert.ok(indicator, 'The compact recording indicator must exist.');
        await indicator.screenshot({ path: path.join(artifacts, 'recording-indicator.png') });
        assert.equal(await desktop.evaluate(({ app }) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().captureTarget()?.pid), expectedPid);
        console.log('PASS: native Right Ctrl hold/release, native toggle shortcut, external-app auto-paste, no Enter, close-to-tray, no main-window activation.');
      } finally {
        await desktop.evaluate(({ app }) => require(require('node:path').join(app.getAppPath(), 'electron/windows.cjs'))
          .createWindowsIntegration().sendKeys([{ key: 0xa3, up: true }, { key: 0x11, up: true }, { key: 0x10, up: true }]));
        await target.close();
      }
    }
  }
  assert.deepEqual(dialogs, [], 'Starting, stopping and closing must not show confirmation popups.');
  assert.deepEqual(errors, []);
  console.log('PASS: desktop startup, local model load, renderer isolation, blocked network, no UI exceptions.');
} finally { await desktop.close(); }
