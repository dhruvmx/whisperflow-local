const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('indicator', {
  toggle: () => ipcRenderer.invoke('indicator:toggle'),
  onState: callback => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('indicator:state', listener);
    return () => ipcRenderer.removeListener('indicator:state', listener);
  }
});
