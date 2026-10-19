const { app, BrowserWindow, ipcMain, session, dialog, clipboard, globalShortcut,
  systemPreferences, Tray, Menu, nativeImage, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HistoryStore } = require('./history.cjs');
const { Transcriber } = require('./transcriber.cjs');
const { DictationController } = require('./dictation-controller.cjs');
const { createWindowsIntegration } = require('./windows.cjs');
let window, overlay, tray, transcriber, controller, stopWatching;
let quitting = false, quitWhenFinished = false, indicatorMessage = '', messageTimer;
let indicatorState = { phase: 'loading', elapsed: 0, level: 0 };
app.setName('Whisperflow Local');
if (!app.isPackaged && process.env.WHISPERFLOW_TEST_DATA) app.setPath('userData', process.env.WHISPERFLOW_TEST_DATA);
const locked = app.requestSingleInstanceLock();

function sendIndicator() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('indicator:state', { ...indicatorState, message: indicatorMessage });
}
function notify(message) {
  indicatorMessage = String(message).slice(0, 100);
  clearTimeout(messageTimer); sendIndicator();
  messageTimer = setTimeout(() => { indicatorMessage = ''; sendIndicator(); }, 3000);
}
function showHistory() {
  window.show(); window.focus(); window.webContents.send('view:history');
}
function quit() {
  if (['requesting', 'recording', 'finishing'].includes(controller?.phase)) {
    quitWhenFinished = true; controller.stop();
  } else app.quit();
}
if (!locked) app.quit();
else {
  app.on('second-instance', () => { if (window) showHistory(); });
  app.whenReady().then(async () => {
    const entry = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
    const indicatorEntry = pathToFileURL(path.join(__dirname, '../src/overlay.html')).href;
    const store = new HistoryStore(app.getPath('userData'));
    const modelDirectory = app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(__dirname, '../models');
    let native;
    try { native = createWindowsIntegration(); }
    catch (error) { console.error('Windows integration unavailable:', error.message); }
    controller = new DictationController({ native,
      writeClipboard: text => clipboard.writeText(text),
      onCommand: command => window.webContents.send('record:command', command),
      onState: state => {
        indicatorState = state; sendIndicator();
        if (quitWhenFinished && ['ready', 'error'].includes(state.phase)) app.quit();
      }
    });
    transcriber = new Transcriber(modelDirectory, status => {
      if (window && !window.isDestroyed()) window.webContents.send('engine:status', status);
    });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_, callback) => callback({ cancel: true }));
    session.defaultSession.setPermissionCheckHandler((contents, permission) =>
      contents === window?.webContents && ['media', 'audioCapture'].includes(permission));
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (contents !== window?.webContents || !['media', 'audioCapture'].includes(permission) || details.mediaTypes?.includes('video')) return callback(false);
      if (process.platform === 'darwin') return callback(await systemPreferences.askForMediaAccess('microphone'));
      callback(true);
    });
    function handle(channel, fn) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (event.senderFrame !== window?.webContents.mainFrame || event.senderFrame.url !== entry) throw new Error('Untrusted request.');
        return fn(...args);
      });
    }
    handle('engine:load', () => transcriber.request('load'));
    handle('engine:transcribe', async samples => {
      const { validateAudio } = await import('../shared/audio.mjs');
      return transcriber.request('transcribe', validateAudio(samples));
    });
    handle('history:list', () => store.read());
    handle('history:add', value => store.add(value));
    handle('history:remove', id => store.remove(id));
    handle('record:begin', () => controller.begin('manual'));
    handle('record:abort', id => controller.abort(id));
    handle('record:state', state => controller.update(state));
    handle('record:complete', async value => {
      try { const result = await controller.complete(value); notify(result.message); return result; }
      catch (error) { notify('Text saved · paste manually from history'); throw error; }
    });
    handle('record:notice', text => { if (typeof text === 'string') notify(text); });
    const checkText = text => {
      if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid text.');
      return text;
    };
    handle('text:copy', text => clipboard.writeText(checkText(text)));
    handle('text:export', async text => {
      checkText(text);
      const result = await dialog.showSaveDialog(window, { defaultPath: 'transcription.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (result.canceled) return false;
      await fs.writeFile(result.filePath, text, 'utf8'); return true;
    });
    window = new BrowserWindow({ width: 1180, height: 820, minWidth: 840, minHeight: 650,
      backgroundColor: '#0e1015', title: 'Whisperflow Local', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => {
      if (!quitting) { event.preventDefault(); controller.stop(); window.hide(); }
    });
    await window.loadURL(entry);
    overlay = new BrowserWindow({ width: 302, height: 70, frame: false, transparent: true,
      resizable: false, movable: false, focusable: false, skipTaskbar: true, show: false,
      alwaysOnTop: true, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, 'overlay-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    function positionIndicator() {
      const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
      overlay.setPosition(Math.round(x + (width - 302) / 2), Math.round(y + height - 94));
    }
    positionIndicator(); screen.on('display-metrics-changed', positionIndicator);
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlay.webContents.on('will-navigate', event => event.preventDefault());
    ipcMain.handle('indicator:toggle', event => {
      if (event.senderFrame !== overlay.webContents.mainFrame || event.senderFrame.url !== indicatorEntry) throw new Error('Untrusted request.');
      controller.toggle();
    });
    await overlay.loadURL(indicatorEntry); sendIndicator(); overlay.showInactive();
    const bitmap = Buffer.alloc(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 52) bitmap.set([255, 160, 179, 255], (y * 16 + x) * 4);
    }
    tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 16, height: 16 }));
    tray.setToolTip('Whisperflow Local · Hold Right Ctrl to talk');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open transcription history', click: showHistory },
      { label: 'Show/hide recording indicator', click: () => overlay.isVisible() ? overlay.hide() : overlay.showInactive() },
      { type: 'separator' }, { label: 'Quit Whisperflow Local', click: quit }
    ]));
    tray.on('double-click', showHistory);
    const registered = globalShortcut.register('CommandOrControl+Shift+Space', () => controller.toggle());
    if (!registered) notify('Shortcut busy · use Right Ctrl or the capsule');
    if (native) stopWatching = native.watchHold(() => controller.start('hold'), () => controller.releaseHold());
    else notify('Use the Record button · automatic paste unavailable');
  }).catch(error => { dialog.showErrorBox('Startup failed', error.message); app.quit(); });
}
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
app.on('will-quit', () => {
  clearTimeout(messageTimer); stopWatching?.(); globalShortcut.unregisterAll();
  transcriber?.close(); tray?.destroy();
});
