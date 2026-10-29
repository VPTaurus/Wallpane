'use strict';
// The only door between the page and the computer. The page gets these functions and nothing else.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('wall', {
  // stored data (prefs, presets, layouts, last session)
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, data) => ipcRenderer.invoke('store:set', name, data),
  storeSetSync: (name, data) => ipcRenderer.sendSync('store:setSync', name, data),
  storeInfo: () => ipcRenderer.invoke('store:info'),
  revealStore: () => ipcRenderer.invoke('store:reveal'),

  // files
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  expand: (paths) => ipcRenderer.invoke('fs:expand', paths),
  gifDuration: (p) => ipcRenderer.invoke('fs:gifDuration', p),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),
  resolveNames: (dir, names) => ipcRenderer.invoke('fs:resolveNames', dir, names),
  revealFile: (p) => ipcRenderer.invoke('shell:reveal', p),
  watchFolders: (roots) => ipcRenderer.invoke('fs:watch', roots),
  onFolderChanged: (cb) => { ipcRenderer.on('fs:changed', (_e, root) => cb(String(root))); },
  openFiles: (multiple) => ipcRenderer.invoke('dialog:files', !!multiple),
  openFolder: () => ipcRenderer.invoke('dialog:folder'),
  exportData: (text) => ipcRenderer.invoke('dialog:export', text),
  importData: () => ipcRenderer.invoke('dialog:import'),

  // window
  displays: () => ipcRenderer.invoke('win:displays'),
  setFullscreen: (on, displayId) => ipcRenderer.invoke('win:fullscreen', !!on, displayId == null ? null : displayId),
  keepAwake: (on) => ipcRenderer.invoke('win:keepAwake', !!on),
  newWindow: () => ipcRenderer.invoke('win:new'),
  windowInfo: () => ipcRenderer.invoke('win:info'),
  isFullscreen: () => ipcRenderer.invoke('win:isFullscreen'),
  onFullscreen: (cb) => { ipcRenderer.on('win:fullscreen-changed', (_e, v) => cb(!!v)); },

  // starting with Windows
  loginItem: () => ipcRenderer.invoke('app:loginItem'),
  setLoginItem: (on) => ipcRenderer.invoke('app:setLoginItem', !!on),

  // about: name, version, licence, and the app's own links (opened in the browser)
  appInfo: () => ipcRenderer.invoke('app:info'),
  openLink: (url) => ipcRenderer.invoke('app:openLink', String(url))
});
