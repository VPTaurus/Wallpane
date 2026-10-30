'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen, Menu, powerSaveBlocker, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const files = require('./lib/files');
const { createWatchers } = require('./lib/watch');
const formats = require('./renderer/lib/formats');
const hotkey = require('./renderer/lib/hotkey');

const DEV = process.argv.includes('--dev');
const pkg = require('./package.json');
// The end-to-end tests run the app against a throwaway data folder.
if (process.env.WALLPANE_USER_DATA) app.setPath('userData', process.env.WALLPANE_USER_DATA);
// Wallpane used to be called Media Wall: bring its saved walls and settings over on the first start.
else try { files.migrateData(path.join(app.getPath('appData'), 'Media Wall'), app.getPath('userData')); } catch { /* start fresh */ }

// FFmpeg comes with the app (resources/ffmpeg), or for development from vendor/ffmpeg (npm run fetch-ffmpeg).
// build.json says which build it is and where its source is.
const FFMPEG_DIR = app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg') : path.join(__dirname, 'vendor', 'ffmpeg');
const ffmpegBuild = (() => {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(FFMPEG_DIR, 'build.json'), 'utf8'));
    return fs.existsSync(path.join(FFMPEG_DIR, 'ffmpeg.exe')) ? b : null;
  } catch { return null; }
})();

// Links the page may open in the browser (About and support). Nothing else leaves the app.
const LINKS = {
  source: pkg.homepage,
  support: [].concat(pkg.funding || []).map((f) => (typeof f === 'string' ? f : f && f.url)).filter((u) => /^https:\/\//.test(u || '')),
  ffmpeg: ffmpegBuild && /^https:\/\//.test(ffmpegBuild.source || '') ? ffmpegBuild.source : null
};

// Keep videos playing when another window covers the wall, and let a restored wall start with sound on.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// One entry per open wall window: id (1, 2, ...) -> BrowserWindow. Window 1 keeps the original data file names.
const wins = new Map();
let quitting = false;
const MAX_WINS = 6;
function winOf(e) { return BrowserWindow.fromWebContents(e.sender); }
function idOf(e) {
  const w = winOf(e);
  for (const [id, x] of wins) if (x === w) return id;
  return 1;
}

/* ---------- only our own pages may call in ---------- */
// The caller must be one of our wall windows, from its top frame, showing a page from the app folder.
function trusted(e) {
  const w = winOf(e);
  if (!w || ![...wins.values()].includes(w)) return false;
  const f = e.senderFrame;
  return !!f && !f.parent && /^file:/i.test(f.url);
}
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error('Blocked a call from an unknown page');
    return fn(e, ...args);
  });
}

/* ---------- stored data: small JSON files in the app's data folder ---------- */
const STORES = new Set(['prefs', 'presets', 'layouts', 'session']);
function dataDir() { return app.getPath('userData'); }
// The wall itself (session) and its settings (prefs) belong to one window; presets and layouts are shared by all.
function storeFile(name, id) {
  if (!STORES.has(name)) throw new Error('Unknown store');
  const own = (name === 'session' || name === 'prefs') && id > 1;
  return path.join(dataDir(), name + (own ? '-' + id : '') + '.json');
}

handle('store:get', async (e, name) => {
  try { return JSON.parse(await fsp.readFile(storeFile(name, idOf(e)), 'utf8')); } catch { return null; }
});
handle('store:set', async (e, name, data) => {
  try { await files.writeJsonAtomic(storeFile(name, idOf(e)), data); return true; } catch { return false; }
});
// Used while the window closes, when there is no time to wait for an answer.
ipcMain.on('store:setSync', (e, name, data) => {
  if (!trusted(e)) { e.returnValue = false; return; }
  try { files.writeJsonAtomicSync(storeFile(name, idOf(e)), data); e.returnValue = true; } catch { e.returnValue = false; }
});
handle('store:info', () => ({ dir: dataDir(), presets: storeFile('presets') }));
handle('store:reveal', () => {
  const f = storeFile('presets');
  if (fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(dataDir());
  return true;
});

/* ---------- files and dialogs ---------- */
handle('fs:expand', (_e, paths) => files.expand(paths));   // no options from the page
handle('fs:exists', (_e, paths) => (Array.isArray(paths) ? paths : []).map((p) => typeof p === 'string' && fs.existsSync(p)));
handle('fs:resolveNames', (_e, dir, names) => {
  const found = {};
  if (typeof dir !== 'string') return found;
  for (const n of Array.isArray(names) ? names : []) {
    if (typeof n !== 'string' || n !== path.basename(n)) continue;
    const p = path.join(dir, n);
    if (fs.existsSync(p)) found[n] = p;
  }
  return found;
});
handle('fs:gifDuration', async (_e, p) => {
  try {
    if (typeof p !== 'string' || path.extname(p).toLowerCase() !== '.gif') return 0;
    const st = await fsp.stat(p);
    if (st.size > 60 * 1024 * 1024) return 0;
    return files.gifSeconds(await fsp.readFile(p));
  } catch { return 0; }
});
handle('shell:reveal', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
  return true;
});

// Playlist folders: each window says which ones it plays, and hears when one of them changes.
const watchers = createWatchers({
  notify(owner, root) {
    const w = wins.get(owner);
    if (w && !w.isDestroyed()) w.webContents.send('fs:changed', root);
  }
});
handle('fs:watch', (e, roots) => watchers.set(idOf(e), roots));

handle('dialog:files', async (e, multiple) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Add media',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'Videos, images and GIFs', extensions: formats.VIDEO.concat(formats.IMAGE) },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (r.canceled) return { entries: [], skipped: 0 };
  return files.expand(r.filePaths);
});
handle('dialog:folder', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), { title: 'Add a folder of media', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { entries: [], skipped: 0 };
  return Object.assign(await files.expand(r.filePaths), { root: r.filePaths[0] });
});
// Background music: a folder of the user's own music (and its folders), and the same folder read again on the next start.
handle('dialog:musicFolder', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), { title: 'Choose a folder of music', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return Object.assign(await files.expand(r.filePaths, { audio: true }), { root: r.filePaths[0] });
});
handle('fs:music', (_e, dir) => (typeof dir === 'string' && dir ? files.expand([dir], { audio: true }) : { entries: [] }));
handle('dialog:export', async (e, text) => {
  const r = await dialog.showSaveDialog(winOf(e), {
    title: 'Export presets and layouts',
    defaultPath: 'wallpane-saved-walls.json',
    filters: [{ name: 'Wallpane saved walls', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, String(text), 'utf8');
  return r.filePath;
});
handle('dialog:import', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Import presets and layouts',
    properties: ['openFile'],
    filters: [{ name: 'Wallpane or Media Wall saved walls', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return { data: JSON.parse(await fsp.readFile(r.filePaths[0], 'utf8')) }; }
  catch { return { error: 'That file is not valid JSON.' }; }
});

/* ---------- window ---------- */
handle('win:displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: 'Display ' + (i + 1) + ' · ' + d.size.width + '×' + d.size.height + (d.id === primary ? ' (main)' : '')
  }));
});
handle('win:fullscreen', (e, on, displayId) => {
  const win = winOf(e);
  if (!win) return false;
  if (on) {
    const d = displayId == null ? null : screen.getAllDisplays().find((x) => x.id === displayId);
    if (d) {
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      win.setBounds(d.bounds);
    }
    win.setFullScreen(true);
  } else {
    win.setFullScreen(false);
  }
  return win.isFullScreen();
});
handle('win:isFullscreen', (e) => { const w = winOf(e); return w ? w.isFullScreen() : false; });
// Casting to a TV goes through Windows: its Display settings connect a wireless display (as Win+K does), which then
// is a display like any other. The windows hear when displays come and go, for Settings > Wall mode > Show on.
handle('app:openDisplaySettings', () => { shell.openExternal('ms-settings:display'); return true; });
function tellDisplays() {
  for (const w of wins.values()) if (!w.isDestroyed()) w.webContents.send('win:displays-changed');
}
handle('win:info', (e) => ({ id: idOf(e), count: wins.size }));
handle('app:info', () => ({
  name: app.getName(), version: app.getVersion(), license: pkg.license, links: LINKS,
  ffmpeg: ffmpegBuild ? { version: ffmpegBuild.version, by: ffmpegBuild.by, license: ffmpegBuild.license } : null
}));
// Opens one of the app's own links (source code, support, FFmpeg's source) in the browser; any other address is ignored.
handle('app:openLink', (_e, url) => {
  if (url === LINKS.source || LINKS.support.includes(url) || (LINKS.ffmpeg && url === LINKS.ffmpeg)) shell.openExternal(url);
  return true;
});

// Keep the display from sleeping while a window that asked for it is full screen (wall mode).
const awake = new Map();   // window id -> { want, blocker }
function updateAwake(id) {
  const a = awake.get(id) || { want: false, blocker: null };
  const w = wins.get(id);
  const on = a.want && !!w && !w.isDestroyed() && w.isFullScreen();
  if (on && a.blocker === null) a.blocker = powerSaveBlocker.start('prevent-display-sleep');
  else if (!on && a.blocker !== null) { powerSaveBlocker.stop(a.blocker); a.blocker = null; }
  awake.set(id, a);
}
handle('win:keepAwake', (e, on) => {
  const id = idOf(e);
  awake.set(id, Object.assign(awake.get(id) || { blocker: null }, { want: !!on }));
  updateAwake(id);
  return true;
});

/* ---------- emergency hide: one key, from any program, covers or hides every wall window and silences it ---------- */
// The same key brings everything back. Settings are app-wide (hide.json), not per window.
const COVERS = ['sheet', 'black', 'image', 'away'];
const MOUSE = ['', 'middle', 'back', 'forward'];   // a mouse button that also hides, over a Wallpane window ('' none)
const HIDE_DEFAULT = { key: 'Ctrl+Shift+H', cover: 'sheet', image: null, mouse: '' };
let hideCfg = Object.assign({}, HIDE_DEFAULT);
let hideOk = false;        // Windows gave us the key (another program may hold it)
let hideKeyOn = null;      // the key registered right now (none while Settings records a new one)
let hidden = false, hiddenAway = false, hideAt = 0, hideFrom = '';
function hideFile() { return path.join(dataDir(), 'hide.json'); }
function cleanHide(j) {
  const c = Object.assign({}, HIDE_DEFAULT);
  if (j && typeof j === 'object') {
    const k = hotkey.normalize(j.key);
    if (k && !hotkey.problem(k)) c.key = k;
    if (typeof j.image === 'string' && j.image) c.image = j.image;
    if (COVERS.includes(j.cover) && (j.cover !== 'image' || c.image)) c.cover = j.cover;
    if (MOUSE.includes(j.mouse)) c.mouse = j.mouse;
  }
  return c;
}
function saveHide() {
  files.writeJsonAtomic(hideFile(), hideCfg).catch(() => { /* not critical */ });
}
function releaseKey() {
  if (hideKeyOn) { globalShortcut.unregister(hideKeyOn); hideKeyOn = null; }
}
function claimKey(key) {
  releaseKey();
  try { if (globalShortcut.register(key, () => toggleHide('key'))) { hideKeyOn = key; return true; } } catch { /* refused */ }
  return false;
}
function hideState() { return { key: hideCfg.key, cover: hideCfg.cover, image: hideCfg.image, mouse: hideCfg.mouse, ok: hideOk, on: hidden }; }
function tellHide() {
  for (const w of wins.values()) if (!w.isDestroyed()) w.webContents.send('hide:changed', hideState());
}
function setHidden(on) {
  if (hidden === !!on) return;
  hidden = !!on;
  // Sound goes off here at once, whatever the page is doing; the page pauses its videos and covers itself.
  for (const w of wins.values()) if (!w.isDestroyed()) w.webContents.setAudioMuted(hidden);
  tellHide();
  if (hidden && hideCfg.cover === 'away') { hiddenAway = true; for (const w of wins.values()) if (!w.isDestroyed()) w.hide(); }
  if (!hidden && hiddenAway) { hiddenAway = false; for (const w of wins.values()) if (!w.isDestroyed()) w.show(); }
}
// One press, one change, even if both Windows ('key') and the focused page ('page') report the same press.
function toggleHide(from) {
  const now = Date.now();
  if (from !== hideFrom && now - hideAt < 300) return;
  hideAt = now; hideFrom = from;
  setHidden(!hidden);
}
handle('hide:get', () => hideState());
handle('hide:toggle', () => { toggleHide('page'); return hidden; });
// While Settings records a new key, the old one must not hide the windows.
handle('hide:suspend', (_e, on) => {
  if (on) releaseKey();
  else if (!hideKeyOn) hideOk = claimKey(hideCfg.key);
  return hideState();
});
handle('hide:set', (_e, change) => {
  const c = change && typeof change === 'object' ? change : {};
  if (c.key !== undefined) {
    const k = hotkey.normalize(c.key), why = k ? hotkey.problem(k) : 'That key can\'t be a shortcut.';
    if (why) return Object.assign(hideState(), { error: why });
    if (k !== hideCfg.key || !hideOk) {
      if (claimKey(k)) { hideCfg.key = k; hideOk = true; }
      else {
        hideOk = claimKey(hideCfg.key);
        return Object.assign(hideState(), { error: hotkey.label(k) + ' is taken by another program. Pick another.' });
      }
    }
  }
  if (COVERS.includes(c.cover) && (c.cover !== 'image' || hideCfg.image)) hideCfg.cover = c.cover;
  if (MOUSE.includes(c.mouse)) hideCfg.mouse = c.mouse;
  saveHide(); tellHide();
  return hideState();
});
handle('hide:pickImage', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Picture to show when hidden',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: formats.IMAGE }]
  });
  if (r.canceled || !r.filePaths[0]) return hideState();
  hideCfg.image = r.filePaths[0]; hideCfg.cover = 'image';
  saveHide(); tellHide();
  return hideState();
});

// Starting with Windows. The portable build runs from a temporary copy, so register the .exe the user started.
function loginOpts() { return { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] }; }
function loginSupported() { return app.isPackaged && process.platform === 'win32'; }
handle('app:loginItem', () => ({
  supported: loginSupported(),
  on: loginSupported() ? app.getLoginItemSettings(loginOpts()).openAtLogin : false
}));
handle('app:setLoginItem', (_e, on) => {
  if (!loginSupported()) return { ok: false, on: false };
  app.setLoginItemSettings(Object.assign({ openAtLogin: !!on }, loginOpts()));
  const now = app.getLoginItemSettings(loginOpts()).openAtLogin;
  return { ok: now === !!on, on: now };
});

handle('win:new', (e) => {
  if (wins.size >= MAX_WINS) return { error: 'You can have up to ' + MAX_WINS + ' wall windows.' };
  let id = 1;
  while (wins.has(id)) id++;
  // A new window starts with a clean wall, not the leftovers of an earlier window with the same number.
  for (const n of ['session', 'prefs']) { try { fs.unlinkSync(storeFile(n, id)); } catch { /* none */ } }
  const from = winOf(e);
  let bounds = null;
  if (from) {
    const here = screen.getDisplayMatching(from.getBounds());
    const other = screen.getAllDisplays().find((d) => d.id !== here.id);
    if (other) {
      const a = other.workArea;
      bounds = { x: a.x + 40, y: a.y + 40, width: Math.max(720, a.width - 80), height: Math.max(480, a.height - 80) };
    } else {
      const b = from.getBounds();
      bounds = { x: b.x + 40, y: b.y + 40, width: b.width, height: b.height };
    }
  }
  state.open = Array.from(new Set([...state.open, id]));
  createWindow(id, bounds);
  return { id };
});

/* ---------- windows: size, position and which wall windows were open are remembered ---------- */
function stateFile() { return path.join(dataDir(), 'window.json'); }
let state = { wins: {}, open: [1] };
function loadState() {
  try {
    const j = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (j && j.wins && typeof j.wins === 'object') {
      const open = Array.isArray(j.open) ? j.open.filter((n) => Number.isInteger(n) && n >= 1 && n <= 99).slice(0, MAX_WINS) : [1];
      return { wins: j.wins, open: open.length ? open : [1] };
    }
    return { wins: { 1: j }, open: [1] };   // file from an earlier version: one window
  } catch { return { wins: {}, open: [1] }; }
}
function saveState() {
  try { files.writeJsonAtomicSync(stateFile(), state); } catch { /* not critical */ }
}
function boundsVisible(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
  });
}

function createWindow(id, given) {
  const st = (state.wins && state.wins[id]) || {};
  const opts = {
    width: st.width > 400 ? st.width : 1440,
    height: st.height > 300 ? st.height : 880,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#0e1218',
    title: id > 1 ? 'Wallpane · Wall ' + id : 'Wallpane',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  };
  if (given) Object.assign(opts, given);
  else if (Number.isFinite(st.x) && Number.isFinite(st.y) && boundsVisible({ x: st.x, y: st.y, width: opts.width, height: opts.height })) {
    opts.x = st.x; opts.y = st.y;
  } else if (id > 1) {
    opts.x = 60 * id; opts.y = 60 * id;
  }
  const win = new BrowserWindow(opts);
  wins.set(id, win);
  let lastBounds = win.getBounds();
  const remember = () => { if (!win.isDestroyed() && !win.isMaximized() && !win.isFullScreen()) lastBounds = win.getBounds(); };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', () => {
    state.wins[id] = Object.assign({}, lastBounds, { maximized: win.isMaximized() });
    // Closing one of several windows means it should not come back; closing the last one (or quitting) keeps it.
    if (!quitting && wins.size > 1) state.open = state.open.filter((n) => n !== id);
    saveState();
  });
  win.on('closed', () => {
    wins.delete(id);
    watchers.dropOwner(id);
    const a = awake.get(id);
    if (a && a.blocker !== null) powerSaveBlocker.stop(a.blocker);
    awake.delete(id);
  });
  win.on('enter-full-screen', () => { updateAwake(id); if (!win.isDestroyed()) win.webContents.send('win:fullscreen-changed', true); });
  win.on('leave-full-screen', () => { updateAwake(id); if (!win.isDestroyed()) win.webContents.send('win:fullscreen-changed', false); });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (DEV) {
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F12' || (input.control && input.shift && String(input.key).toLowerCase() === 'i')) win.webContents.toggleDevTools();
    });
  }

  win.once('ready-to-show', () => {
    if (st.maximized && !given) win.maximize();
    win.show();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Starting Wallpane again brings it to the front, and back from an emergency hide (in case the key is forgotten).
  app.on('second-instance', () => {
    if (hidden) setHidden(false);
    const win = [...wins.values()].pop();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    state = loadState();
    try { hideCfg = cleanHide(JSON.parse(fs.readFileSync(hideFile(), 'utf8'))); } catch { /* defaults */ }
    hideOk = claimKey(hideCfg.key);
    screen.on('display-added', tellDisplays);
    screen.on('display-removed', tellDisplays);
    state.open.forEach((id) => createWindow(id));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(1); });
  });
  app.on('before-quit', () => { quitting = true; watchers.closeAll(); });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => { app.quit(); });
}
