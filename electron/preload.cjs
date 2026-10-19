const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  loadEngine: () => ipcRenderer.invoke('engine:load'),
  beginSession: () => ipcRenderer.invoke('record:begin'),
  abortSession: id => ipcRenderer.invoke('record:abort', id),
  updateState: state => ipcRenderer.invoke('record:state', state),
  completeSession: value => ipcRenderer.invoke('record:complete', value),
  notify: text => ipcRenderer.invoke('record:notice', text),
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
  onCommand: callback => {
    const listener = (_, command) => callback(command);
    ipcRenderer.on('record:command', listener);
    return () => ipcRenderer.removeListener('record:command', listener);
  },
  onHistory: callback => {
    const listener = () => callback();
    ipcRenderer.on('view:history', listener);
    return () => ipcRenderer.removeListener('view:history', listener);
  }
});
