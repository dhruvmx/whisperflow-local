const { app, BrowserWindow, ipcMain, session, dialog, clipboard, globalShortcut, systemPreferences } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HistoryStore } = require('./history.cjs');
const { Transcriber } = require('./transcriber.cjs');
let window, transcriber;
app.setName('Whisperflow Local');
if (!app.isPackaged && process.env.WHISPERFLOW_TEST_DATA) app.setPath('userData', process.env.WHISPERFLOW_TEST_DATA);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    const entry = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
    const trusted = frame => frame && frame.url === entry;
    const store = new HistoryStore(app.getPath('userData'));
    const modelDirectory = app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(__dirname, '../models');
    transcriber = new Transcriber(modelDirectory, status => {
      if (window && !window.isDestroyed()) window.webContents.send('engine:status', status);
    });
    // No runtime HTTP(S), sockets, analytics, CDN fonts, or cloud endpoints.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_, callback) => callback({ cancel: true }));
    session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
      webContents === window?.webContents && ['media', 'audioCapture'].includes(permission));
    session.defaultSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
      if (webContents !== window?.webContents || !['media', 'audioCapture'].includes(permission) || details.mediaTypes?.includes('video')) return callback(false);
      if (process.platform === 'darwin') return callback(await systemPreferences.askForMediaAccess('microphone'));
      callback(true);
    });
    function handle(channel, fn) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (!trusted(event.senderFrame)) throw new Error('Untrusted request.');
        return fn(...args);
      });
    }
    handle('engine:load', () => transcriber.request('load'));
    handle('engine:transcribe', async samples => {
      const { validateAudio } = await import('../shared/audio.mjs');
      return transcriber.request('transcribe', validateAudio(samples));
    });
    handle('history:list', () => store.read());
    handle('history:add', entry => store.add(entry));
    handle('history:remove', id => store.remove(id));
    const checkText = text => {
      if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid text.');
      return text;
    };
    handle('text:copy', text => clipboard.writeText(checkText(text)));
    handle('text:export', async text => {
      checkText(text);
      const result = await dialog.showSaveDialog(window, { defaultPath: 'transcription.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (result.canceled) return false;
      await fs.writeFile(result.filePath, text, 'utf8');
      return true;
    });
    window = new BrowserWindow({ width: 1180, height: 820, minWidth: 840, minHeight: 650,
      backgroundColor: '#0e1015', title: 'Whisperflow Local', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => {
      if (window.recording && dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Keep recording', 'Discard and quit'], defaultId: 0, cancelId: 0, message: 'A recording or transcription is still in progress. Quit and discard unsaved work?' }) === 0) event.preventDefault();
    });
    handle('record:state', active => { window.recording = active === true; });
    // State reporting is intentionally a narrow additional bridge method.
    await window.loadURL(entry);
    const registered = globalShortcut.register('CommandOrControl+Shift+Space', () => {
      window.show(); window.webContents.send('record:toggle');
    });
    if (!registered) console.warn('Global shortcut unavailable; use the Record button.');
  }).catch(error => { dialog.showErrorBox('Startup failed', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); transcriber?.close(); });
