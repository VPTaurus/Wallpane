// The page's shared state and helpers. The other ui/*.js files add their functions to A (window.MW.app) and call
// each other through it (A.render(), A.toast(), ...), so a call works no matter which file defines the function.
(function () {
  'use strict';
  var MW = window.MW, F = MW.free, PL = MW.pl;
  var api = window.wall;
  if (!api) {
    document.body.innerHTML = '<p style="padding:24px;font:14px sans-serif">This page needs the Media Wall desktop app.</p>';
    return;
  }
  var $ = function (s) { return document.querySelector(s); };
  var A = MW.app = {
    api: api, $: $,
    S: {
      cols: 4, rows: 3, gap: 6, aspect: 'fill', fit: 'cover', display: null, items: [], sel: null, nid: 1, presetName: null,
      playlists: {}, fillPl: null, panel: true, mode: 'grid', startWall: false, awake: true
    },
    wall: $('#wall'), inspector: $('#inspector'),
    tileEls: new Map(),
    drag: { id: null, dx: 0, dy: 0 },   // the tile being dragged on the grid, and where in it the pointer holds it
    winId: 1, wallPaused: false, isFs: false, userLayouts: []
  };
  var S = A.S, wall = A.wall, toastEl = $('#toast'), toastTimer = 0;

  A.toast = function (msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; A.toast('Error: ' + ((r && r.message) || r)); });
  window.addEventListener('error', function (e) { A.toast('Error: ' + e.message); });

  function svg(d, fill) {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  A.ICON = {
    play: svg('<path d="M4 2.5v11l9-5.5z"/>', true),
    pause: svg('<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>', true),
    vol: svg('<path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.7a6 6 0 0 1 0 8.6"/>'),
    mute: svg('<path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11.5 6l3.5 4M15 6l-3.5 4"/>'),
    fit: svg('<path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    loop: svg('<path d="M3 7V6a2 2 0 0 1 2-2h7M10 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H4M6 14l-2-2 2-2"/>'),
    next: svg('<path d="M3 2.5v11l7-5.5zM12.5 2.5v11"/>'),
    pin: svg('<path d="M10 2l4 4-2 .5-2.5 3 .5 3-1 1-3-3-3.5 3.5M6.5 6.5L10 2"/>')
  };
  A.kindLabel = function (it) {
    if (it.kind === 'video') return 'Video';
    return /\.gif$/i.test(it.name) ? 'GIF' : 'Image';
  };

  /* ---------- stored settings (one set per window) ---------- */
  A.savePrefs = function () {
    api.storeSet('prefs', { cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, display: S.display, panel: S.panel, mode: S.mode, startWall: S.startWall, awake: S.awake });
  };
  A.applyPrefs = function (p) {
    if (!p || typeof p !== 'object') return;
    if (p.cols >= 1 && p.cols <= 12) S.cols = p.cols | 0;
    if (p.rows >= 1 && p.rows <= 12) S.rows = p.rows | 0;
    if (p.gap >= 0 && p.gap <= 24) S.gap = p.gap | 0;
    if (MW.util.ASPECTS.indexOf(p.aspect) > -1) S.aspect = p.aspect;
    if (p.fit === 'cover' || p.fit === 'contain') S.fit = p.fit;
    if (typeof p.display === 'number') S.display = p.display;
    if (p.panel === false) S.panel = false;
    if (p.mode === 'free') S.mode = 'free';
    if (p.startWall === true) S.startWall = true;
    if (p.awake === false) S.awake = false;
  };

  /* ---------- items ---------- */
  A.itemById = function (id) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i];
    return null;
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
