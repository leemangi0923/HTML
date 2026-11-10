'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('task1Desktop', Object.freeze({
  saveWiring: payload=>ipcRenderer.invoke('task1:save-wiring',payload),
  updateAction: action=>ipcRenderer.invoke('task1:update-action',action),
  watchUpdates: listener=>{
    const handler=(_event,state)=>listener(state);
    ipcRenderer.on('task1:update-state',handler);
    ipcRenderer.invoke('task1:update-state').then(listener).catch(()=>{});
    return ()=>ipcRenderer.removeListener('task1:update-state',handler);
  }
}));
