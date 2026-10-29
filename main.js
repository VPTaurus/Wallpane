'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const DEV = process.argv.includes('--dev');

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

/* ---------- media files ---------- */
const VIDEO = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg']);
const FILTER_EXT = [...VIDEO, ...IMAGE].map((e) => e.slice(1));
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function kindOfPath(p) {
  const e = path.extname(p).toLowerCase();
  return VIDEO.has(e) ? 'video' : IMAGE.has(e) ? 'image' : null;
}

// Turns files and folders into a flat list of media files. Folders are searched recursively.
async function expand(paths) {
  const out = [];
  const seen = new Set();
  let skipped = 0;
  const dirs = [];
  async function walk(p, depth, top) {
    if (out.length >= 3000) return;
    let st;
    try { st = await fsp.stat(p); } catch { return; }
    if (st.isDirectory()) {
      if (top) dirs.push(p);
      if (depth > 8) return;
      let names;
      try { names = await fsp.readdir(p); } catch { return; }
      names.sort(collator.compare);
      for (const n of names) {
        if (n.startsWith('.')) continue;
        await walk(path.join(p, n), depth + 1, false);
      }
    } else if (st.isFile()) {
      const kind = kindOfPath(p);
      if (!kind) { if (top) skipped++; return; }
      const key = p.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ path: p, name: path.basename(p), kind });
    }
  }
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p === 'string' && p) await walk(p, 0, true);
  }
  return { entries: out, skipped, dirs };
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
async function writeStore(name, data, id) {
  const f = storeFile(name, id);
  const tmp = f + '.tmp';
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(tmp, JSON.stringify(data));
  await fsp.rename(tmp, f);
}

ipcMain.handle('store:get', async (_e, name) => {
  try { return JSON.parse(await fsp.readFile(storeFile(name, idOf(_e)), 'utf8')); } catch { return null; }
});
ipcMain.handle('store:set', async (_e, name, data) => {
  try { await writeStore(name, data, idOf(_e)); return true; } catch { return false; }
});
ipcMain.on('store:setSync', (e, name, data) => {
  try {
    const f = storeFile(name, idOf(e));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data));
    e.returnValue = true;
  } catch { e.returnValue = false; }
});
ipcMain.handle('store:info', () => ({ dir: dataDir(), presets: storeFile('presets') }));
ipcMain.handle('store:reveal', () => {
  const f = storeFile('presets');
  if (fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(dataDir());
  return true;
});

/* ---------- files and dialogs ---------- */
ipcMain.handle('fs:expand', (_e, paths) => expand(paths));
ipcMain.handle('fs:exists', (_e, paths) => (Array.isArray(paths) ? paths : []).map((p) => typeof p === 'string' && fs.existsSync(p)));
ipcMain.handle('fs:resolveNames', (_e, dir, names) => {
  const found = {};
  if (typeof dir !== 'string') return found;
  for (const n of Array.isArray(names) ? names : []) {
    if (typeof n !== 'string' || n !== path.basename(n)) continue;
    const p = path.join(dir, n);
    if (fs.existsSync(p)) found[n] = p;
  }
  return found;
});
// Length of one full play of an animated GIF, in seconds (0 if it is not animated or cannot be read).
function gifSeconds(buf) {
  try {
    if (buf.length < 14 || buf.toString('latin1', 0, 3) !== 'GIF') return 0;
    let p = 13;
    if (buf[10] & 0x80) p += 3 * (1 << ((buf[10] & 7) + 1));
    let total = 0, frames = 0, delay = 10;
    while (p < buf.length) {
      const b = buf[p++];
      if (b === 0x3b) break;
      if (b === 0x21) {
        const label = buf[p++];
        if (label === 0xf9 && buf[p] >= 4) { delay = buf.readUInt16LE(p + 2); if (delay < 2) delay = 10; }
        while (p < buf.length && buf[p] !== 0) p += buf[p] + 1;
        p++;
      } else if (b === 0x2c) {
        const packed = buf[p + 8];
        p += 9;
        if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
        p++; // LZW minimum code size
        while (p < buf.length && buf[p] !== 0) p += buf[p] + 1;
        p++;
        total += delay; frames++; delay = 10;
      } else break;
    }
    return frames > 1 ? total / 100 : 0;
  } catch { return 0; }
}
ipcMain.handle('fs:gifDuration', async (_e, p) => {
  try {
    if (typeof p !== 'string' || path.extname(p).toLowerCase() !== '.gif') return 0;
    const st = await fsp.stat(p);
    if (st.size > 60 * 1024 * 1024) return 0;
    return gifSeconds(await fsp.readFile(p));
  } catch { return 0; }
});
ipcMain.handle('shell:reveal', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
  return true;
});

ipcMain.handle('dialog:files', async (_e, multiple) => {
  const r = await dialog.showOpenDialog(winOf(_e), {
    title: 'Add media',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'Videos, images and GIFs', extensions: FILTER_EXT },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (r.canceled) return { entries: [], skipped: 0 };
  return expand(r.filePaths);
});
ipcMain.handle('dialog:folder', async (_e) => {
  const r = await dialog.showOpenDialog(winOf(_e), { title: 'Add a folder of media', properties: ['openDirectory'] });
  if (r.canceled) return { entries: [], skipped: 0 };
  return Object.assign(await expand(r.filePaths), { root: r.filePaths[0] });
});
ipcMain.handle('dialog:export', async (_e, text) => {
  const r = await dialog.showSaveDialog(winOf(_e), {
    title: 'Export presets and layouts',
    defaultPath: 'media-wall-presets.json',
    filters: [{ name: 'Media Wall presets', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, String(text), 'utf8');
  return r.filePath;
});
ipcMain.handle('dialog:import', async (_e) => {
  const r = await dialog.showOpenDialog(winOf(_e), {
    title: 'Import presets and layouts',
    properties: ['openFile'],
    filters: [{ name: 'Media Wall presets', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return { data: JSON.parse(await fsp.readFile(r.filePaths[0], 'utf8')) }; }
  catch { return { error: 'That file is not valid JSON.' }; }
});

/* ---------- window ---------- */
ipcMain.handle('win:displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: 'Display ' + (i + 1) + ' · ' + d.size.width + '×' + d.size.height + (d.id === primary ? ' (main)' : '')
  }));
});
ipcMain.handle('win:fullscreen', (_e, on, displayId) => {
  const win = winOf(_e);
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
ipcMain.handle('win:isFullscreen', (_e) => { const w = winOf(_e); return w ? w.isFullScreen() : false; });
ipcMain.handle('win:info', (e) => ({ id: idOf(e), count: wins.size }));
ipcMain.handle('win:new', (e) => {
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
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch { /* not critical */ }
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
    title: id > 1 ? 'Media Wall · Wall ' + id : 'Media Wall',
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
  win.on('closed', () => { wins.delete(id); });
  win.on('enter-full-screen', () => { if (!win.isDestroyed()) win.webContents.send('win:fullscreen-changed', true); });
  win.on('leave-full-screen', () => { if (!win.isDestroyed()) win.webContents.send('win:fullscreen-changed', false); });

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
  app.on('second-instance', () => {
    const win = [...wins.values()].pop();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    state = loadState();
    state.open.forEach((id) => createWindow(id));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(1); });
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { app.quit(); });
}
