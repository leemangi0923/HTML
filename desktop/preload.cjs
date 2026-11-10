'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('task1Desktop', Object.freeze({
  saveWiring: payload=>ipcRenderer.invoke('task1:save-wiring',payload)
}));
