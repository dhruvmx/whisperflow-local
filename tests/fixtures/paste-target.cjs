const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setName('Whisperflow paste test target');
if (process.env.WHISPERFLOW_TEST_DATA) app.setPath('userData', process.env.WHISPERFLOW_TEST_DATA);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 700, height: 420, title: 'Test text box',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await window.loadFile(path.join(__dirname, 'paste-target.html'));
  window.show(); window.focus();
});
app.on('window-all-closed', () => app.quit());
