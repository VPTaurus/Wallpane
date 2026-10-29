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
      playlists: {}, fillPl: null, mode: 'grid', startWall: false, awake: true, clock24: null
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
    pin: svg('<path d="M10 2l4 4-2 .5-2.5 3 .5 3-1 1-3-3-3.5 3.5M6.5 6.5L10 2"/>'),
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    chev: svg('<path d="M4.5 6.5L8 10l3.5-3.5"/>'),
    file: svg('<path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3"/>'),
    folder: svg('<path d="M1.5 4h4.5l1.5 1.5h7v8h-13z"/>'),
    playlist: svg('<path d="M2 4h9M2 8h9M2 12h5M11 10.5v4l3-2z"/>'),
    grid: svg('<path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z"/>'),
    wand: svg('<path d="M2.5 13.5l8-8M11 1.5v2.5M14.5 5H12M13.5 2.5L12 4M9 4l3 3"/>'),
    layout: svg('<path d="M2.5 2.5h11v11h-11zM2.5 9h11M8 2.5V9"/>'),
    undo: svg('<path d="M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7"/>'),
    redo: svg('<path d="M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/>'),
    bookmark: svg('<path d="M4 2h8v12l-4-3-4 3z"/>'),
    // A cog: a ring with eight square teeth (thin round rays would read as a sun).
    gear: svg('<circle cx="8" cy="8" r="4.3"/><circle cx="8" cy="8" r="1.7"/><path stroke-width="2.6" stroke-linecap="butt" d="M12.3 8h2.4M11.04 11.04l1.7 1.7M8 12.3v2.4M4.96 11.04l-1.7 1.7M3.7 8H1.3M4.96 4.96l-1.7-1.7M8 3.7V1.3M11.04 4.96l1.7-1.7"/>'),
    panel: svg('<path d="M2 3h12v10H2zM10 3v10"/>'),
    tv: svg('<path d="M1.5 3h13v8.5h-13zM5 14.5h6M8 11.5v3"/>'),
    window: svg('<path d="M1.5 5.5h9v8h-9zM4.5 5.5V2.5h10v8h-4"/>'),
    move: svg('<path d="M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2"/>'),
    reset: svg('<path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2v3h3"/>'),
    tile: svg('<path d="M2.5 2.5h11v11h-11zM8 5.5v5M5.5 8h5"/>'),
    copy: svg('<path d="M5.5 5.5h8v8h-8zM2.5 10.5v-8h8"/>'),
    splitv: svg('<path d="M2.5 2.5h11v11h-11zM8 2.5v11"/>'),
    splith: svg('<path d="M2.5 2.5h11v11h-11zM2.5 8h11"/>'),
    rows: svg('<path d="M2.5 2.5h11v11h-11zM2.5 8h11M6.2 2.5V8M9.8 2.5V8M5.2 8v5.5M8 8v5.5M10.8 8v5.5"/>'),
    sliders: svg('<path d="M2.5 4.5h11M2.5 11.5h11M5.5 3v3M10.5 10v3"/>'),
    help: svg('<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.4v.2"/>'),
    x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    watch: svg('<path d="M8 4.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM6.5 1.5h3M8 1.5v3M8 9.5l2-2M12.3 4.6l1-1"/>'),
    timer: svg('<path d="M4 1.5h8M4 14.5h8M5 1.5v2.5l3 4 3-4V1.5M5 14.5V12l3-4 3 4v2.5"/>')
  };
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
    api.storeSet('prefs', { cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, display: S.display, mode: S.mode, startWall: S.startWall, awake: S.awake, clock24: S.clock24 });
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
