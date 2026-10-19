const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  loadEngine: () => ipcRenderer.invoke('engine:load'),
  recordingState: active => ipcRenderer.invoke('record:state', active),
  transcribe: samples => ipcRenderer.invoke('engine:transcribe', samples),
  history: () => ipcRenderer.invoke('history:list'),
  save: entry => ipcRenderer.invoke('history:add', entry),
  remove: id => ipcRenderer.invoke('history:remove', id),
  exportText: text => ipcRenderer.invoke('text:export', text),
  copy: text => ipcRenderer.invoke('text:copy', text),
  onStatus: callback => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('engine:status', listener);
    return () => ipcRenderer.removeListener('engine:status', listener);
  },
  onToggle: callback => {
    const listener = () => callback();
    ipcRenderer.on('record:toggle', listener);
    return () => ipcRenderer.removeListener('record:toggle', listener);
  }
});
