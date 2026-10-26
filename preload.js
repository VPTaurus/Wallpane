'use strict';
// The only door between the page and the computer. The page gets these functions and nothing else.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// The sandboxed preload has no full Node 'url' module, so build file:// addresses by hand.
function fileUrl(p) {
  let s = String(p).replace(/\\/g, '/');
  let host = '';
  if (s.startsWith('//')) {            // network path: //server/share/file
    const rest = s.slice(2), i = rest.indexOf('/');
    host = i < 0 ? rest : rest.slice(0, i);
    s = i < 0 ? '/' : rest.slice(i);
  } else if (!s.startsWith('/')) {
    s = '/' + s;                       // C:/folder/file -> /C:/folder/file
  }
  const enc = s.split('/').map((seg, n) => (n === 1 && /^[A-Za-z]:$/.test(seg)) ? seg : encodeURIComponent(seg)).join('/');
  return 'file://' + host + enc;
}

contextBridge.exposeInMainWorld('wall', {
  // stored data (prefs, presets, layouts, last session)
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, data) => ipcRenderer.invoke('store:set', name, data),
  storeSetSync: (name, data) => ipcRenderer.sendSync('store:setSync', name, data),
  storeInfo: () => ipcRenderer.invoke('store:info'),
  revealStore: () => ipcRenderer.invoke('store:reveal'),

  // files
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  fileUrl: (p) => fileUrl(p),
  expand: (paths) => ipcRenderer.invoke('fs:expand', paths),
  gifDuration: (p) => ipcRenderer.invoke('fs:gifDuration', p),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),
  resolveNames: (dir, names) => ipcRenderer.invoke('fs:resolveNames', dir, names),
  revealFile: (p) => ipcRenderer.invoke('shell:reveal', p),
  openFiles: (multiple) => ipcRenderer.invoke('dialog:files', !!multiple),
  openFolder: () => ipcRenderer.invoke('dialog:folder'),
  exportData: (text) => ipcRenderer.invoke('dialog:export', text),
  importData: () => ipcRenderer.invoke('dialog:import'),

  // window
  displays: () => ipcRenderer.invoke('win:displays'),
  setFullscreen: (on, displayId) => ipcRenderer.invoke('win:fullscreen', !!on, displayId == null ? null : displayId),
  newWindow: () => ipcRenderer.invoke('win:new'),
  windowInfo: () => ipcRenderer.invoke('win:info'),
  isFullscreen: () => ipcRenderer.invoke('win:isFullscreen'),
  onFullscreen: (cb) => { ipcRenderer.on('win:fullscreen-changed', (_e, v) => cb(!!v)); }
});
