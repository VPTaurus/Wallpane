// The page's shared state and helpers. The other ui/*.js files add their functions to A (window.MW.app) and call
// each other through it (A.render(), A.toast(), ...), so a call works no matter which file defines the function.
(function () {
  'use strict';
  var MW = window.MW, F = MW.free, PL = MW.pl;
  var api = window.wall;
  if (!api) {
    document.body.innerHTML = '<p style="padding:24px;font:14px sans-serif">This page needs the Wallpane desktop app.</p>';
    return;
  }
  var $ = function (s) { return document.querySelector(s); };
  var A = MW.app = {
    api: api, $: $,
    S: {
      cols: 4, rows: 3, gap: 6, aspect: 'fill', fit: 'cover', display: null, items: [], sel: null, nid: 1, presetName: null,
      playlists: {}, fillPl: null, mode: 'grid', startWall: false, awake: true, clock24: null, soloSound: true, resizeMode: 'even', autoConvert: true, gifVideo: '2', fillShapes: true, pauseMin: true,
      music: { root: null, shuffle: false, vol: 0.6, on: false },   // background music: its folder, and whether it plays
      timeBar: { clock: true, sw: false, tm: false, ct: false },    // what the bar always shows of the clock popover
      counter: 0,                                                    // the counter in the clock popover
      // The library: how it shows (a drawer over the wall, a panel beside it, or a window of its own) and on which side,
      // open or not, its width, the thumbnail size, the order, and what it shows (ui/libview.js checks what was saved).
      lib: { place: 'drawer', side: 'left', open: false, w: 400, size: 110, sort: 'name', rev: false, kinds: [], shape: '', length: '', res: '', copy: false, folder: null }
    },
    wall: $('#wall'), inspector: $('#inspector'),
    tileEls: new Map(),
    drag: { id: null, dx: 0, dy: 0 },   // the tile being dragged on the grid, and where in it the pointer holds it
    // Files dragged out of the library carry their paths under this type; libDrag { n } while one is under way.
    LIB_TYPE: 'application/x-wallpane-files', libDrag: null,
    winId: 1, wallPaused: false, isFs: false, userLayouts: []
  };
  var S = A.S, wall = A.wall, toastEl = $('#toast'), toastTimer = 0;

  A.toast = function (msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; A.toast('Error: ' + ((r && r.message) || r)); });
  window.addEventListener('error', function (e) { A.toast('Error: ' + e.message); });

  A.ICON = MW.icons;

  // Buttons in the page name their icon with data-icon="..."; draw them once here.
  Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
    el.classList.add('ic'); el.setAttribute('aria-hidden', 'true');
    el.innerHTML = A.ICON[el.dataset.icon] || '';
  });
  A.kindLabel = function (it) {
    if (it.kind === 'empty') return 'Empty tile';
    if (it.kind === 'video') return 'Video';
    return /\.gif$/i.test(it.name) ? 'GIF' : 'Image';
  };

  /* ---------- stored settings (one set per window) ---------- */
  A.savePrefs = function () {
    api.storeSet('prefs', { cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, display: S.display, mode: S.mode, startWall: S.startWall, awake: S.awake, clock24: S.clock24, soloSound: S.soloSound, fillShapes: S.fillShapes, pauseMin: S.pauseMin, resizeMode: S.resizeMode, autoConvert: S.autoConvert, gifVideo: S.gifVideo, music: S.music, timeBar: S.timeBar, counter: S.counter, lib: S.lib });
  };
  A.applyPrefs = function (p) {
    if (!p || typeof p !== 'object') return;
    if (p.cols >= 1 && p.cols <= 12) S.cols = p.cols | 0;
    if (p.rows >= 1 && p.rows <= 12) S.rows = p.rows | 0;
    if (p.gap >= 0 && p.gap <= 24) S.gap = p.gap | 0;
    if (MW.util.ASPECTS.indexOf(p.aspect) > -1) S.aspect = p.aspect;
    if (p.fit === 'cover' || p.fit === 'contain') S.fit = p.fit;
    if (typeof p.display === 'number') S.display = p.display;
    if (p.mode === 'free') S.mode = 'free';
    if (p.startWall === true) S.startWall = true;
    if (p.awake === false) S.awake = false;
    if (typeof p.clock24 === 'boolean') S.clock24 = p.clock24;   // null: as Windows shows the time
    if (p.soloSound === false) S.soloSound = false;
    if (p.fillShapes === false) S.fillShapes = false;   // Fill the wall: playlists then pick files shaped like their tile
    if (p.pauseMin === false) S.pauseMin = false;       // the wall rests while its window is minimized
    if (p.autoConvert === false) S.autoConvert = false;
    if (['off', '2', '10', 'all'].indexOf(p.gifVideo) > -1) S.gifVideo = p.gifVideo;   // GIF to video: from what size
    if (p.resizeMode === 'squeeze') S.resizeMode = 'squeeze';   // Free layout: how tiles in the way of a growing tile give way
    var tb = p.timeBar;
    if (tb && typeof tb === 'object') S.timeBar = { clock: tb.clock !== false, sw: tb.sw === true, tm: tb.tm === true, ct: tb.ct === true };
    if (Number.isFinite(p.counter)) S.counter = MW.util.clamp(Math.round(p.counter), -999999, 999999);
    if (p.lib && typeof p.lib === 'object') S.lib = A.libView.cleanPrefs(p.lib);
    var m = p.music;
    if (m && typeof m === 'object') {
      S.music = {
        root: typeof m.root === 'string' && m.root ? m.root : null, shuffle: m.shuffle === true,
        vol: m.vol >= 0 && m.vol <= 1 ? +m.vol : 0.6, on: m.on === true
      };
    }
  };

  /* ---------- items ---------- */
  A.itemById = function (id) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i];
    return null;
  };
  // A grid change from geo.resolveYield: empty tiles it covers go at once (arrow keys, typed numbers, drops).
  A.commitYield = function (r) {
    MW.geo.applyGeo(S.items, r.geo);
    if (!r.removed.length) return;
    S.items = S.items.filter(function (i) { return r.removed.indexOf(i.id) < 0; });
    if (S.sel != null && !A.itemById(S.sel)) S.sel = null;
  };
  // The same during a drag: covered empty tiles are only hidden, so dragging back brings them back. dropGone() at the end.
  A.previewYield = function (r) {
    MW.geo.applyGeo(S.items, r.geo);
    S.items.forEach(function (i) { if (i.kind === 'empty') i._gone = r.removed.indexOf(i.id) > -1; });
  };
  A.dropGone = function () {
    if (!S.items.some(function (i) { return i._gone; })) return;
    S.items = S.items.filter(function (i) { return !i._gone; });
    if (S.sel != null && !A.itemById(S.sel)) S.sel = null;
  };
  A.removeTileEl = function (id) {
    var el = A.tileEls.get(id);
    if (el) { el.remove(); A.tileEls.delete(id); }
  };

  /* ---------- measuring the wall ---------- */
  A.metrics = function () {
    var r = wall.getBoundingClientRect(), pad = S.gap;
    var cw = (r.width - 2 * pad - S.gap * (S.cols - 1)) / S.cols;
    var ch = (r.height - 2 * pad - S.gap * (S.rows - 1)) / S.rows;
    return { r: r, pad: pad, px: Math.max(1, cw + S.gap), py: Math.max(1, ch + S.gap) };
  };
  A.inWall = function (x, y) { var r = wall.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  A.cellAt = function (x, y) {
    var m = A.metrics();
    return {
      col: MW.util.clamp(Math.floor((x - m.r.left - m.pad) / m.px), 0, S.cols - 1),
      row: MW.util.clamp(Math.floor((y - m.r.top - m.pad) / m.py), 0, S.rows - 1)
    };
  };
  A.wallPx = function () { return { W: wall.clientWidth, H: wall.clientHeight }; };
  A.freeGeoPx = function () { return F.pxMap(S.items, A.wallPx()); };
  A.applyFreePx = function (g) { F.applyPx(S.items, g, A.wallPx()); };

  /* ---------- undo and redo ---------- */
  var undoStack = [], redoStack = [];
  function snap() {
    return { cols: S.cols, rows: S.rows, items: S.items.map(function (i) { return Object.assign({}, i); }), playlists: PL.clone(S.playlists), fillPl: S.fillPl, mode: S.mode };
  }
  A.updateHistoryButtons = function () {
    $('#undoBtn').disabled = !undoStack.length;
    $('#redoBtn').disabled = !redoStack.length;
  };
  A.pushHistory = function () {
    undoStack.push(snap());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    A.updateHistoryButtons();
  };
  A.clearHistory = function () { undoStack = []; redoStack = []; A.updateHistoryButtons(); };
  // Forget the last step when the change it was taken for did not happen after all (a drag that went back).
  A.dropHistory = function () { undoStack.pop(); A.updateHistoryButtons(); };
  function restore(s) {
    var byId = {};
    S.items.forEach(function (i) { byId[i.id] = i; });
    S.items = s.items.map(function (c) {
      var cur = byId[c.id];
      if (!cur) return Object.assign({}, c);
      if (cur.url !== c.url || cur.missing !== c.missing || cur.kind !== c.kind || cur.pl !== c.pl) A.removeTileEl(cur.id);
      return Object.assign(cur, c);
    });
    S.cols = s.cols; S.rows = s.rows;
    if (s.mode) S.mode = s.mode;
    if (s.playlists) { S.playlists = PL.clone(s.playlists); S.fillPl = s.fillPl; }
    if (S.sel && !A.itemById(S.sel)) S.sel = null;
    A.savePrefs(); A.render(); A.refreshInspector();
  }
  A.undo = function () {
    if (!undoStack.length) return;
    redoStack.push(snap());
    restore(undoStack.pop());
    A.updateHistoryButtons();
  };
  A.redo = function () {
    if (!redoStack.length) return;
    undoStack.push(snap());
    restore(redoStack.pop());
    A.updateHistoryButtons();
  };
})();
