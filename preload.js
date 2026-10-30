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
  probeMedia: (p) => ipcRenderer.invoke('media:probe', String(p)),
  ensurePlayable: (p, opts) => ipcRenderer.invoke('media:ensurePlayable', String(p), opts || {}),
  gifVideo: (p, minBytes) => ipcRenderer.invoke('media:gifVideo', String(p), +minBytes || 0),
  watchFolders: (roots) => ipcRenderer.invoke('fs:watch', roots),
  onFolderChanged: (cb) => { ipcRenderer.on('fs:changed', (_e, root) => cb(String(root))); },
  openFiles: (multiple) => ipcRenderer.invoke('dialog:files', !!multiple),
  openFolder: () => ipcRenderer.invoke('dialog:folder'),
  exportData: (text) => ipcRenderer.invoke('dialog:export', text),
  chooseMusicFolder: () => ipcRenderer.invoke('dialog:musicFolder'),
  musicFiles: (dir) => ipcRenderer.invoke('fs:music', dir),
  importData: () => ipcRenderer.invoke('dialog:import'),

  // background work: jobs (making files playable, thumbnails, …) and the cache they fill
  jobs: () => ipcRenderer.invoke('jobs:list'),
  cancelJob: (id) => ipcRenderer.invoke('jobs:cancel', id),
  clearJobs: () => ipcRenderer.invoke('jobs:clear'),
  onJobs: (cb) => { ipcRenderer.on('jobs:changed', (_e, list) => cb(list)); },
  cacheInfo: () => ipcRenderer.invoke('cache:info'),
  setCacheLimit: (gb) => ipcRenderer.invoke('cache:setLimit', gb),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  revealCache: () => ipcRenderer.invoke('cache:reveal'),

  // window
  displays: () => ipcRenderer.invoke('win:displays'),
  setFullscreen: (on, displayId) => ipcRenderer.invoke('win:fullscreen', !!on, displayId == null ? null : displayId),
  keepAwake: (on) => ipcRenderer.invoke('win:keepAwake', !!on),
  newWindow: () => ipcRenderer.invoke('win:new'),
  windowInfo: () => ipcRenderer.invoke('win:info'),
  isFullscreen: () => ipcRenderer.invoke('win:isFullscreen'),
  onFullscreen: (cb) => { ipcRenderer.on('win:fullscreen-changed', (_e, v) => cb(!!v)); },
  onDisplaysChanged: (cb) => { ipcRenderer.on('win:displays-changed', () => cb()); },
  openDisplaySettings: () => ipcRenderer.invoke('app:openDisplaySettings'),

  // starting with Windows
  loginItem: () => ipcRenderer.invoke('app:loginItem'),
  setLoginItem: (on) => ipcRenderer.invoke('app:setLoginItem', !!on),

  // emergency hide: the key works from any program; the page shows the cover and blocks input while hidden
  hideState: () => ipcRenderer.invoke('hide:get'),
  setHide: (change) => ipcRenderer.invoke('hide:set', change),
  pickHideImage: () => ipcRenderer.invoke('hide:pickImage'),
  toggleHide: () => ipcRenderer.invoke('hide:toggle'),
  suspendHideKey: (on) => ipcRenderer.invoke('hide:suspend', !!on),
  onHide: (cb) => { ipcRenderer.on('hide:changed', (_e, s) => cb(s)); },

  // about: name, version, licence, and the app's own links (opened in the browser)
  appInfo: () => ipcRenderer.invoke('app:info'),
  openLink: (url) => ipcRenderer.invoke('app:openLink', String(url))
});
