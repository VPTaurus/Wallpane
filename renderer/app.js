(function () {
  'use strict';
  var api = window.wall;
  var $ = function (s) { return document.querySelector(s); };
  if (!api) {
    document.body.innerHTML = '<p style="padding:24px;font:14px sans-serif">This page needs the Media Wall desktop app.</p>';
    return;
  }

  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; toast('Error: ' + ((r && r.message) || r)); });
  window.addEventListener('error', function (e) { toast('Error: ' + e.message); });
  var wall = $('#wall'), inspector = $('#inspector'), toastEl = $('#toast');
  var tileEls = new Map();
  var S = { cols: 4, rows: 3, gap: 6, aspect: 'fill', fit: 'cover', display: null, items: [], sel: null, nid: 1, presetName: null, playlists: {}, fillPl: null, panel: true, mode: 'grid' };
  var dragId = null, dragOff = { dx: 0, dy: 0 }, clearArmed = false, toastTimer = 0;
  var winId = 1, wallPaused = false, isFs = false, userLayoutsCache = [], undoStack = [], redoStack = [];

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  }
  function svg(d, fill) {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  var ICON = {
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
  var VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
  var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
  function kindOfName(name) {
    var ext = (String(name).split('.').pop() || '').toLowerCase();
    return VIDEO_EXT.indexOf(ext) > -1 ? 'video' : (IMAGE_EXT.indexOf(ext) > -1 ? 'image' : null);
  }
  function kindLabel(it) {
    if (it.kind === 'video') return 'Video';
    return /\.gif$/i.test(it.name) ? 'GIF' : 'Image';
  }
  function dirOf(p) { return String(p).replace(/[\\/][^\\/]*$/, ''); }
  function sortEntries(a) {
    return a.slice().sort(function (x, y) { return x.path.localeCompare(y.path, undefined, { numeric: true, sensitivity: 'base' }); });
  }
  function readingOrder(a, b) { return a.row - b.row || a.col - b.col; }
  var ASPECTS = ['fill', '16:9', '4:3', '1:1', '9:16'];

  /* ---------- stored settings ---------- */
  function savePrefs() {
    api.storeSet('prefs', { cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, display: S.display, panel: S.panel, mode: S.mode });
  }
  function applyPrefs(p) {
    if (!p || typeof p !== 'object') return;
    if (p.cols >= 1 && p.cols <= 12) S.cols = p.cols | 0;
    if (p.rows >= 1 && p.rows <= 12) S.rows = p.rows | 0;
    if (p.gap >= 0 && p.gap <= 24) S.gap = p.gap | 0;
    if (ASPECTS.indexOf(p.aspect) > -1) S.aspect = p.aspect;
    if (p.fit === 'cover' || p.fit === 'contain') S.fit = p.fit;
    if (typeof p.display === 'number') S.display = p.display;
    if (p.panel === false) S.panel = false;
    if (p.mode === 'free') S.mode = 'free';
  }

  /* ---------- geometry ---------- */
  function overlap(a, b) { return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h; }
  function validLayout(over) {
    over = over || {};
    var boxes = S.items.map(function (i) { return over[i.id] || i; });
    for (var a = 0; a < boxes.length; a++) {
      var b = boxes[a];
      if (b.col < 0 || b.row < 0 || b.w < 1 || b.h < 1 || b.col + b.w > S.cols || b.row + b.h > S.rows) return false;
      for (var c = a + 1; c < boxes.length; c++) if (overlap(b, boxes[c])) return false;
    }
    return true;
  }
  function occupancy() {
    var m = [];
    for (var r = 0; r < S.rows; r++) m.push(new Array(S.cols).fill(false));
    S.items.forEach(function (i) { mark(m, i, i.w, i.h); });
    return m;
  }
  function mark(m, s, w, h) {
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (m[s.row + y] && m[s.row + y][s.col + x] !== undefined) m[s.row + y][s.col + x] = true;
  }
  function freeSpot(m, w, h, start, cols, rows) {
    cols = cols || S.cols; rows = rows || S.rows;
    var T = cols * rows;
    for (var k = 0; k < T; k++) {
      var idx = ((start || 0) + k) % T, c = idx % cols, r = Math.floor(idx / cols);
      if (c + w > cols || r + h > rows) continue;
      var ok = true;
      for (var y = 0; y < h && ok; y++) for (var x = 0; x < w; x++) if (m[r + y][c + x]) { ok = false; break; }
      if (ok) return { col: c, row: r, idx: idx };
    }
    return null;
  }
  function arrange(cols, rows) {
    var m = [];
    for (var r = 0; r < rows; r++) m.push(new Array(cols).fill(false));
    var out = {};
    var order = S.items.slice().sort(readingOrder);
    for (var i = 0; i < order.length; i++) {
      var it = order[i], w = Math.min(it.w, cols), h = Math.min(it.h, rows);
      var s = freeSpot(m, w, h, 0, cols, rows);
      if (!s) { w = 1; h = 1; s = freeSpot(m, 1, 1, 0, cols, rows); }
      if (!s) return null;
      mark(m, s, w, h);
      out[it.id] = { col: s.col, row: s.row, w: w, h: h };
    }
    return out;
  }
  function itemAt(col, row, skipId) {
    for (var i = 0; i < S.items.length; i++) {
      var t = S.items[i];
      if (t.id !== skipId && col >= t.col && col < t.col + t.w && row >= t.row && row < t.row + t.h) return t;
    }
    return null;
  }
  function metrics() {
    var r = wall.getBoundingClientRect(), pad = S.gap;
    var cw = (r.width - 2 * pad - S.gap * (S.cols - 1)) / S.cols;
    var ch = (r.height - 2 * pad - S.gap * (S.rows - 1)) / S.rows;
    return { r: r, pad: pad, px: Math.max(1, cw + S.gap), py: Math.max(1, ch + S.gap) };
  }
  function inWall(x, y) { var r = wall.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function cellAt(x, y) {
    var m = metrics();
    return {
      col: clamp(Math.floor((x - m.r.left - m.pad) / m.px), 0, S.cols - 1),
      row: clamp(Math.floor((y - m.r.top - m.pad) / m.py), 0, S.rows - 1)
    };
  }

  /* Push-aside placement: put one tile where it is wanted, and every tile it lands on makes room by moving
     to the nearest free spot (or, if the wall is packed, by bumping another tile, or shrinking to one cell). */
  function geoMap() {
    var m = {};
    S.items.forEach(function (i) { m[i.id] = { col: i.col, row: i.row, w: i.w, h: i.h }; });
    return m;
  }
  function applyGeo(geo) {
    S.items.forEach(function (i) { var g = geo[i.id]; if (g) { i.col = g.col; i.row = g.row; i.w = g.w; i.h = g.h; } });
  }
  function nearestSpot(v, blockers) {
    var best = null, bd = 1e9;
    for (var r = 0; r + v.h <= S.rows; r++) for (var c = 0; c + v.w <= S.cols; c++) {
      var box = { col: c, row: r, w: v.w, h: v.h }, ok = true;
      for (var k = 0; k < blockers.length; k++) if (overlap(box, blockers[k])) { ok = false; break; }
      if (!ok) continue;
      var d = Math.abs(c - v.col) + Math.abs(r - v.row);
      if (d < bd) { bd = d; best = box; }
    }
    return best;
  }
  function resolve(id, g, base) {
    if (g.col < 0 || g.row < 0 || g.w < 1 || g.h < 1 || g.col + g.w > S.cols || g.row + g.h > S.rows) return null;
    var geo = {}, src = base || geoMap();
    Object.keys(src).forEach(function (k) { geo[k] = src[k]; });
    geo[id] = { col: g.col, row: g.row, w: g.w, h: g.h };
    var fixed = {}; fixed[id] = true;
    for (var guard = 0; guard < 400; guard++) {
      var victim = null, fixedIds = Object.keys(fixed);
      for (var i = 0; i < S.items.length && !victim; i++) {
        var t = S.items[i];
        if (fixed[t.id]) continue;
        for (var f = 0; f < fixedIds.length; f++) if (overlap(geo[t.id], geo[fixedIds[f]])) { victim = t; break; }
      }
      if (!victim) return geo;
      var v = geo[victim.id];
      var everyone = S.items.filter(function (x) { return x.id !== victim.id; }).map(function (x) { return geo[x.id]; });
      var fixedBoxes = fixedIds.map(function (k) { return geo[k]; });
      var one = { col: v.col, row: v.row, w: 1, h: 1 };
      var spot = nearestSpot(v, everyone) || nearestSpot(v, fixedBoxes) || nearestSpot(one, everyone) || nearestSpot(one, fixedBoxes);
      if (!spot) return null;
      geo[victim.id] = spot; fixed[victim.id] = true;
    }
    return null;
  }


  /* ---------- Free layout: tiles placed by the pixel. Positions are stored as fractions of the wall, so they scale with the window. ---------- */
  var MIN_FREE = 24, SNAP = 6, lastNudge = { id: null, t: 0 };
  function wallPx() { return { W: wall.clientWidth, H: wall.clientHeight }; }
  function freeGeoPx() {
    var d = wallPx(), g = {};
    S.items.forEach(function (i) {
      if (i.fx === undefined || i.fx === null) return;
      g[i.id] = { x: i.fx * d.W, y: i.fy * d.H, w: i.fw * d.W, h: i.fh * d.H };
    });
    return g;
  }
  function applyFreePx(g) {
    var d = wallPx();
    if (!(d.W > 0 && d.H > 0)) return;
    S.items.forEach(function (i) {
      var r = g[i.id];
      if (r) { i.fx = r.x / d.W; i.fy = r.y / d.H; i.fw = r.w / d.W; i.fh = r.h / d.H; }
    });
  }
  function setFreePx(it, r) {
    var d = wallPx();
    it.fx = r.x / d.W; it.fy = r.y / d.H; it.fw = r.w / d.W; it.fh = r.h / d.H;
  }
  function ovlPx(a, b) { return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5; }
  function inWallPx(box, d) { return !(box.x < -0.5 || box.y < -0.5 || box.x + box.w > d.W + 0.5 || box.y + box.h > d.H + 0.5); }
  // Put one tile where it is wanted. Tiles in the way slide aside (the way that needs the least movement); tiles they
  // touch slide too. Always computed from the layout at the start of the gesture, so dragging back puts tiles back.
  function resolveFree(id, g, base) {
    var d = wallPx();
    if (g.w < MIN_FREE - 0.01 || g.h < MIN_FREE - 0.01 || !inWallPx(g, d)) return null;
    var ids = S.items.map(function (i) { return i.id; }), geo = {};
    ids.forEach(function (k) { if (base[k]) geo[k] = base[k]; });
    geo[id] = { x: g.x, y: g.y, w: g.w, h: g.h };
    var fixed = [id], isFixed = {};
    isFixed[id] = true;
    for (var guard = 0; guard < 400; guard++) {
      var victim = null, by = null;
      for (var a = 0; a < ids.length && victim === null; a++) {
        var t = ids[a];
        if (isFixed[t] || !geo[t]) continue;
        for (var b = 0; b < fixed.length; b++) if (ovlPx(geo[t], geo[fixed[b]])) { victim = t; by = fixed[b]; break; }
      }
      if (victim === null) return geo;
      var v = geo[victim], f = geo[by], best = null, bd = 1e12;
      [{ x: f.x + f.w, y: v.y }, { x: f.x - v.w, y: v.y }, { x: v.x, y: f.y + f.h }, { x: v.x, y: f.y - v.h }].forEach(function (c) {
        var box = { x: c.x, y: c.y, w: v.w, h: v.h };
        if (!inWallPx(box, d)) return;
        for (var k = 0; k < fixed.length; k++) if (ovlPx(box, geo[fixed[k]])) return;
        var dist = Math.abs(c.x - v.x) + Math.abs(c.y - v.y);
        if (dist < bd) { bd = dist; best = box; }
      });
      if (!best) return null;
      geo[victim] = best; isFixed[victim] = true; fixed.push(victim);
    }
    return null;
  }
  function snapLines(base, skipId, d) {
    var X = [0, d.W], Y = [0, d.H];
    Object.keys(base).forEach(function (k) {
      if (String(k) === String(skipId)) return;
      var r = base[k];
      X.push(r.x, r.x + r.w); Y.push(r.y, r.y + r.h);
    });
    return { X: X, Y: Y };
  }
  // Move so that the near edge or the far edge lands on a line, if one is within a few pixels.
  function snapAxis(p, size, lines) {
    var best = 0, bd = SNAP + 1;
    lines.forEach(function (l) {
      var d1 = l - p, d2 = l - (p + size);
      if (Math.abs(d1) < bd) { bd = Math.abs(d1); best = d1; }
      if (Math.abs(d2) < bd) { bd = Math.abs(d2); best = d2; }
    });
    return bd <= SNAP ? best : 0;
  }
  function snapPos(p, lines) {
    var best = p, bd = SNAP + 1;
    lines.forEach(function (l) { if (Math.abs(l - p) < bd) { bd = Math.abs(l - p); best = l; } });
    return bd <= SNAP ? best : p;
  }
  function startMoveFree(e, it, el) {
    var d = wallPx(), base = freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, moved = false, pushed = false, lines = snapLines(base, it.id, d);
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved) { if (Math.abs(dx) + Math.abs(dy) < 4) return; moved = true; el.classList.add('dragging'); }
      var x = clamp(g0.x + dx, 0, d.W - g0.w), y = clamp(g0.y + dy, 0, d.H - g0.h);
      if (!ev.altKey) {
        x = clamp(x + snapAxis(x, g0.w, lines.X), 0, d.W - g0.w);
        y = clamp(y + snapAxis(y, g0.h, lines.Y), 0, d.H - g0.h);
      }
      var res = resolveFree(it.id, { x: x, y: y, w: g0.w, h: g0.h }, base);
      if (res) { if (!pushed) { pushHistory(); pushed = true; } applyFreePx(res); render(); refreshInspector(); }
    }
    function up() {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      if (moved) { el._moved = true; setTimeout(function () { el._moved = false; }, 0); }
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function startResizeFree(e, it, el, hd, edge) {
    e.preventDefault(); e.stopPropagation();
    select(it.id); hd.classList.add('active');
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var d = wallPx(), base = freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, pushed = false, lines = snapLines(base, it.id, d);
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy, g = { x: g0.x, y: g0.y, w: g0.w, h: g0.h }, snap = !ev.altKey, p;
      if (edge.indexOf('e') > -1) { p = g0.x + g0.w + dx; if (snap) p = snapPos(p, lines.X); p = clamp(p, g0.x + MIN_FREE, d.W); g.w = p - g0.x; }
      if (edge.indexOf('w') > -1) { p = g0.x + dx; if (snap) p = snapPos(p, lines.X); p = clamp(p, 0, g0.x + g0.w - MIN_FREE); g.x = p; g.w = g0.x + g0.w - p; }
      if (edge.indexOf('s') > -1) { p = g0.y + g0.h + dy; if (snap) p = snapPos(p, lines.Y); p = clamp(p, g0.y + MIN_FREE, d.H); g.h = p - g0.y; }
      if (edge.indexOf('n') > -1) { p = g0.y + dy; if (snap) p = snapPos(p, lines.Y); p = clamp(p, 0, g0.y + g0.h - MIN_FREE); g.y = p; g.h = g0.y + g0.h - p; }
      var res = resolveFree(it.id, g, base);
      if (res) { if (!pushed) { pushHistory(); pushed = true; } applyFreePx(res); render(); refreshInspector(); }
    }
    function up() {
      hd.classList.remove('active');
      hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
    }
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  }
  function nudgeFree(it, dir, e) {
    var step = e.ctrlKey ? 10 : 1, d = wallPx(), base = freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var g = { x: g0.x, y: g0.y, w: g0.w, h: g0.h };
    if (e.shiftKey) { g.w = clamp(g.w + dir[0] * step, MIN_FREE, d.W - g.x); g.h = clamp(g.h + dir[1] * step, MIN_FREE, d.H - g.y); }
    else { g.x = clamp(g.x + dir[0] * step, 0, d.W - g.w); g.y = clamp(g.y + dir[1] * step, 0, d.H - g.h); }
    var res = resolveFree(it.id, g, base);
    if (!res) return;
    var now = Date.now();
    if (lastNudge.id !== it.id || now - lastNudge.t > 700) pushHistory();
    lastNudge = { id: it.id, t: now };
    applyFreePx(res); render(); refreshInspector();
  }
  function itemUnderPoint(p) {
    var el = document.elementFromPoint ? document.elementFromPoint(p.x, p.y) : null, t = el && el.closest && el.closest('.tile');
    if (!t) return null;
    return S.items.filter(function (i) { return String(i.id) === t.dataset.id; })[0] || null;
  }
  // Where to put a new tile in free layout: the first gap that fits, else the middle, pushing others aside.
  function placeFreeNew(it) {
    var d = wallPx(), geo = freeGeoPx(), ids = Object.keys(geo), sizes = [[1 / 3, 1 / 3], [1 / 4, 1 / 4], [1 / 6, 1 / 6]];
    for (var si = 0; si < sizes.length; si++) {
      var w = d.W * sizes[si][0], h = d.H * sizes[si][1];
      for (var y = 0; y + h <= d.H + 0.5; y += Math.max(8, h / 6)) for (var x = 0; x + w <= d.W + 0.5; x += Math.max(8, w / 6)) {
        var box = { x: x, y: y, w: w, h: h }, free = true;
        for (var k = 0; k < ids.length; k++) if (ovlPx(box, geo[ids[k]])) { free = false; break; }
        if (free) { setFreePx(it, box); S.items.push(it); return true; }
      }
    }
    it.fx = 0.375; it.fy = 0.375; it.fw = 0.25; it.fh = 0.25;
    S.items.push(it);
    var res = resolveFree(it.id, { x: 0.375 * d.W, y: 0.375 * d.H, w: 0.25 * d.W, h: 0.25 * d.H }, freeGeoPx());
    if (res) { applyFreePx(res); return true; }
    S.items.pop();
    return false;
  }
  function addFilesFree(res, target) {
    var media = sortEntries(res.entries || []), bad = res.skipped || 0;
    if (!media.length) { toast(bad ? 'Only video, image and GIF files can go on the wall.' : 'No videos, images or GIFs found there.'); return; }
    pushHistory();
    var under = target && target.free ? itemUnderPoint(target) : null;
    S.items = S.items.filter(function (i) { return !i.sample; });
    if (S.sel && !S.items.some(function (i) { return i.id === S.sel; })) S.sel = null;
    if (under && S.items.indexOf(under) > -1) {
      var f1 = media.shift();
      if (under.missing) relinkItem(under, f1); else replaceMedia(under, f1);
      if (under.pl) { under.pinned = true; under.loop = true; }
    }
    var added = 0, failed = 0;
    media.forEach(function (f) {
      var it = makeItem(f, { col: 0, row: 0, w: 1, h: 1 });
      if (placeFreeNew(it)) added++; else failed++;
    });
    render(); refreshInspector();
    var msg = [];
    if (failed) msg.push(failed + (failed === 1 ? ' file did' : ' files did') + ' not fit. Make room and add again.');
    if (bad) msg.push(bad + ' unsupported ' + (bad === 1 ? 'file was' : 'files were') + ' skipped.');
    if (msg.length) toast(msg.join(' '));
  }
  // Switching layouts. Grid to free keeps every tile exactly where it is on screen.
  function toFree(onlyMissing) {
    var d = wallPx(), gap = S.gap;
    if (!(d.W > 0 && d.H > 0)) return;
    var px = (d.W - 2 * gap - gap * (S.cols - 1)) / S.cols + gap, py = (d.H - 2 * gap - gap * (S.rows - 1)) / S.rows + gap;
    S.items.forEach(function (i) {
      if (onlyMissing && i.fx !== undefined && i.fx !== null) return;
      i.fx = (gap + i.col * px - gap / 2) / d.W; i.fy = (gap + i.row * py - gap / 2) / d.H;
      i.fw = (i.w * px) / d.W; i.fh = (i.h * py) / d.H;
    });
  }
  // Free to grid snaps each tile to the nearest cells; tiles that would collide move to the nearest free spot.
  function toGrid() {
    var d = wallPx(), gap = S.gap;
    var px = (d.W - 2 * gap - gap * (S.cols - 1)) / S.cols + gap, py = (d.H - 2 * gap - gap * (S.rows - 1)) / S.rows + gap;
    var mm = [], dropped = [], r;
    for (r = 0; r < S.rows; r++) mm.push(new Array(S.cols).fill(false));
    S.items.slice().sort(function (a, b) { return (a.fy - b.fy) || (a.fx - b.fx); }).forEach(function (it) {
      var w = clamp(Math.round(it.fw * d.W / px) || 1, 1, S.cols), h = clamp(Math.round(it.fh * d.H / py) || 1, 1, S.rows);
      var col = clamp(Math.round((it.fx * d.W + gap / 2 - gap) / px), 0, S.cols - w), row = clamp(Math.round((it.fy * d.H + gap / 2 - gap) / py), 0, S.rows - h);
      var free = true, y, x;
      for (y = 0; y < h && free; y++) for (x = 0; x < w; x++) if (mm[row + y][col + x]) { free = false; break; }
      if (!free) {
        var sp = freeSpot(mm, w, h, row * S.cols + col);
        if (!sp) { w = 1; h = 1; sp = freeSpot(mm, 1, 1, row * S.cols + col); }
        if (!sp) { dropped.push(it.id); return; }
        col = sp.col; row = sp.row;
      }
      mark(mm, { col: col, row: row }, w, h);
      it.col = col; it.row = row; it.w = w; it.h = h;
    });
    if (dropped.length) {
      S.items = S.items.filter(function (i) { return dropped.indexOf(i.id) < 0; });
      if (S.sel && dropped.indexOf(S.sel) > -1) S.sel = null;
    }
    return dropped.length;
  }
  function setMode(m) {
    if (m === S.mode) return;
    pushHistory();
    var lost = 0;
    if (m === 'free') { toFree(false); S.mode = 'free'; }
    else { lost = toGrid(); S.mode = 'grid'; }
    savePrefs(); render(); refreshInspector();
    toast(m === 'free' ? 'Free layout: drag, and resize by any edge. Alt turns snapping off. Arrow keys move by 1 px, Ctrl makes it 10.' : (lost ? 'Back on the grid; ' + lost + ' tiles did not fit and were removed. Ctrl+Z brings them back.' : 'Back on the grid.'));
  }
  $('#modeSel').addEventListener('change', function () { setMode($('#modeSel').value); });

  /* ---------- undo and redo ---------- */
  function clonePlaylists(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { var p = o[k]; out[k] = Object.assign({}, p, { order: p.order ? p.order.slice() : null }); });
    return out;
  }
  function snap() {
    return { cols: S.cols, rows: S.rows, items: S.items.map(function (i) { return Object.assign({}, i); }), playlists: clonePlaylists(S.playlists), fillPl: S.fillPl, mode: S.mode };
  }
  function updateHistoryButtons() {
    $('#undoBtn').disabled = !undoStack.length;
    $('#redoBtn').disabled = !redoStack.length;
  }
  function pushHistory() {
    undoStack.push(snap());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }
  function removeTileEl(id) {
    var el = tileEls.get(id);
    if (el) { el.remove(); tileEls.delete(id); }
  }
  function restore(s) {
    var byId = {};
    S.items.forEach(function (i) { byId[i.id] = i; });
    S.items = s.items.map(function (c) {
      var cur = byId[c.id];
      if (!cur) return Object.assign({}, c);
      if (cur.url !== c.url || cur.missing !== c.missing || cur.kind !== c.kind || cur.pl !== c.pl) removeTileEl(cur.id);
      return Object.assign(cur, c);
    });
    S.cols = s.cols; S.rows = s.rows;
    if (s.mode) S.mode = s.mode;
    if (s.playlists) { S.playlists = clonePlaylists(s.playlists); S.fillPl = s.fillPl; }
    if (S.sel && !S.items.some(function (i) { return i.id === S.sel; })) S.sel = null;
    savePrefs(); render(); refreshInspector();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snap());
    restore(undoStack.pop());
    updateHistoryButtons();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snap());
    restore(redoStack.pop());
    updateHistoryButtons();
  }

  /* ---------- tiles ---------- */
  function createTile(it) {
    var el = document.createElement('div');
    el.className = 'tile is-' + it.kind + (it.missing ? ' is-missing' : '');
    el.draggable = true;
    el.dataset.id = it.id;
    var media;
    if (it.missing) {
      media = document.createElement('div');
      media.className = 'media offline-ph';
      var box = document.createElement('div');
      box.title = it.path || '';
      var n1 = document.createElement('div'); n1.className = 'nm'; n1.textContent = it.name;
      var n2 = document.createElement('div'); n2.textContent = 'File not found';
      var rb = document.createElement('button'); rb.className = 'btn rl'; rb.type = 'button'; rb.dataset.act = 'relink'; rb.textContent = 'Locate file';
      box.appendChild(n1); box.appendChild(n2); box.appendChild(rb); media.appendChild(box);
    } else if (it.kind === 'video') {
      media = document.createElement('video');
      media.className = 'media';
      media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true;
      media.setAttribute('playsinline', ''); media.preload = 'auto';
      if (it.pl) {
        media.addEventListener('ended', function () { if (!el._dead) advance(it); });
        media.addEventListener('loadedmetadata', function () { applyClipStart(it, media); });
        media.addEventListener('timeupdate', function () { if (!el._dead) clipTick(it, media); });
        media.addEventListener('playing', function () { var pp = S.playlists[it.pl]; if (pp) pp.bad = 0; });
      }
      media.addEventListener('error', function () { el.classList.add('broken'); });
      media.src = it.url;
    } else {
      media = document.createElement('img');
      media.className = 'media'; media.alt = it.name;
      media.addEventListener('error', function () { el.classList.add('broken'); });
      media.src = it.url;
    }
    media.draggable = false;
    if (it.pl && !it.missing) {
      media.addEventListener('error', function () { if (!el._dead) failAdvance(it); });
      media.addEventListener('load', function () { var pp = S.playlists[it.pl]; if (pp) pp.bad = 0; });
    }
    el.appendChild(media);

    var fail = document.createElement('div');
    fail.className = 'fail';
    fail.textContent = 'Cannot play ' + it.name + '. The file may be damaged or use a format this app does not support.';
    el.appendChild(fail);

    var hud = document.createElement('div');
    hud.className = 'hud';
    var nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = it.name; nm.title = it.path || it.name;
    var bt = document.createElement('span'); bt.className = 'hbtns';
    bt.innerHTML =
      (it.pl ? '<button class="hb" data-act="pin" aria-label="Pin to this tile"></button>' : '') +
      (it.pl ? '<button class="hb" data-act="next" aria-label="Next in playlist"></button>' : '') +
      '<button class="hb" data-act="play" aria-label="Play or pause"></button>' +
      '<button class="hb" data-act="mute" aria-label="Sound on or off"></button>' +
      (it.pl ? '' : '<button class="hb" data-act="loop" aria-label="Loop on or off"></button>') +
      '<button class="hb" data-act="fit" aria-label="Fit"></button>' +
      '<button class="hb danger" data-act="remove" aria-label="Remove from wall">' + ICON.trash + '</button>';
    hud.appendChild(nm); hud.appendChild(bt);
    el.appendChild(hud);

    if (it.sample) { var bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'SAMPLE'; el.appendChild(bd); }

    ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(function (edge) {
      var hd = document.createElement('div');
      hd.className = 'rz' + (edge.length === 2 ? ' c' : '');
      hd.dataset.edge = edge;
      hd.addEventListener('pointerdown', function (e) { startResize(e, it, el, hd, edge); });
      el.appendChild(hd);
    });

    if (media.tagName === 'VIDEO') {
      media.addEventListener('play', function () { syncPlayBtn(el); updateTransport(); });
      media.addEventListener('pause', function () { syncPlayBtn(el); updateTransport(); });
    }

    el.addEventListener('pointerdown', function (e) {
      if (S.mode !== 'free' || e.button !== 0) return;
      if (e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      startMoveFree(e, it, el);
    });
    el.addEventListener('click', function (e) {
      if (el._moved) { el._moved = false; return; }
      var b = e.target.closest('[data-act]');
      if (!b) { select(S.sel === it.id ? null : it.id); return; }
      e.stopPropagation();
      var act = b.dataset.act;
      if (act === 'remove') { removeItem(it.id); return; }
      if (act === 'next') { if (it.pinned) toast('This tile is pinned. Unpin it to skip.'); else advance(it); return; }
      if (act === 'pin') { setPinned(it, !it.pinned); return; }
      if (act === 'relink') { select(it.id); relinkOne(it); return; }
      if (act === 'fit') { it.fit = it.fit === 'cover' ? 'contain' : 'cover'; it.fitSet = true; render(); refreshInspector(); }
      else if (act === 'mute') { it.muted = !it.muted; render(); refreshInspector(); updateTransport(); }
      else if (act === 'loop') {
        it.loop = !it.loop; render(); refreshInspector(); updateTransport();
        if (it.loop && media.ended) media.play().catch(function () {});
      }
      else if (act === 'play') { if (media.paused) media.play().catch(function () {}); else media.pause(); }
    });
    el.addEventListener('dblclick', function (e) {
      if (e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      try {
        // Double-click toggles: into fullscreen for this tile, and back out when it is already fullscreen.
        var pr = document.fullscreenElement ? document.exitFullscreen() : (el.requestFullscreen && el.requestFullscreen());
        if (pr && pr.catch) pr.catch(function () {});
      } catch (err) { /* ignore */ }
    });
    el.addEventListener('dragstart', function (e) {
      dragId = it.id;
      var c = cellAt(e.clientX, e.clientY);
      dragOff = { dx: clamp(c.col - it.col, 0, it.w - 1), dy: clamp(c.row - it.row, 0, it.h - 1) };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', it.name); } catch (err) { /* ignore */ }
      setTimeout(function () { el.classList.add('dragging'); }, 0);
    });
    el.addEventListener('dragend', function () { dragId = null; el.classList.remove('dragging'); hideGhost(); wall.classList.remove('hot'); });
    return el;
  }

  /* Drag any border or corner: the edge you grab follows the pointer, snapped to cells; tiles in the way move aside.
     Every step is computed from the layout at the start of the drag, so dragging back puts tiles back. */
  function startResize(e, it, el, hd, edge) {
    if (S.mode === 'free') { startResizeFree(e, it, el, hd, edge); return; }
    e.preventDefault(); e.stopPropagation();
    el.draggable = false; select(it.id); hd.classList.add('active');
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var m = metrics(), sx = e.clientX, sy = e.clientY, base = geoMap(), pushed = false;
    var g0 = base[it.id];
    var useX = edge.indexOf('e') > -1 || edge.indexOf('w') > -1;
    var useY = edge.indexOf('n') > -1 || edge.indexOf('s') > -1;
    function geom(dx, dy) {
      var g = { col: g0.col, row: g0.row, w: g0.w, h: g0.h };
      if (edge.indexOf('e') > -1) g.w = g0.w + dx;
      if (edge.indexOf('w') > -1) { g.col = g0.col + dx; g.w = g0.w - dx; }
      if (edge.indexOf('s') > -1) g.h = g0.h + dy;
      if (edge.indexOf('n') > -1) { g.row = g0.row + dy; g.h = g0.h - dy; }
      return g;
    }
    function changed(geo) {
      return S.items.some(function (i) { var g = geo[i.id]; return g && (g.col !== i.col || g.row !== i.row || g.w !== i.w || g.h !== i.h); });
    }
    function mv(ev) {
      var dx = useX ? Math.round((ev.clientX - sx) / m.px) : 0;
      var dy = useY ? Math.round((ev.clientY - sy) / m.py) : 0;
      var res = null, n = 0;
      for (;;) {
        res = resolve(it.id, geom(dx, dy), base);
        if (res || n++ > 40) break;
        if (Math.abs(dx) >= Math.abs(dy)) dx += dx > 0 ? -1 : 1; else dy += dy > 0 ? -1 : 1;
      }
      if (res && changed(res)) {
        if (!pushed) { pushHistory(); pushed = true; }
        applyGeo(res); render(); refreshInspector();
      }
    }
    function up() {
      hd.classList.remove('active');
      hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
      el.draggable = S.mode !== 'free';
    }
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  }

  function syncPlayBtn(el) {
    var v = el.querySelector('video'), b = el.querySelector('[data-act="play"]');
    if (v && b) { b.innerHTML = v.paused ? ICON.play : ICON.pause; b.title = v.paused ? 'Play' : 'Pause'; }
  }
  function syncTile(it, el) {
    if (S.mode === 'free' && it.fx !== undefined && it.fx !== null) {
      var hg = S.gap / 2;
      el.style.gridColumn = ''; el.style.gridRow = '';
      el.style.left = 'calc(' + (it.fx * 100) + '% + ' + hg + 'px)'; el.style.top = 'calc(' + (it.fy * 100) + '% + ' + hg + 'px)';
      el.style.width = 'calc(' + (it.fw * 100) + '% - ' + S.gap + 'px)'; el.style.height = 'calc(' + (it.fh * 100) + '% - ' + S.gap + 'px)';
    } else {
      el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.height = '';
      el.style.gridColumn = (it.col + 1) + ' / span ' + it.w;
      el.style.gridRow = (it.row + 1) + ' / span ' + it.h;
    }
    el.draggable = S.mode !== 'free';
    el.classList.toggle('sel', S.sel === it.id);
    var m = el.querySelector('.media');
    if (!it.missing) m.style.objectFit = it.fit;
    if (m.tagName === 'VIDEO') { m.muted = it.muted; m.loop = it.loop; }
    var mb = el.querySelector('[data-act="mute"]');
    if (mb) { mb.innerHTML = it.muted ? ICON.mute : ICON.vol; mb.title = it.muted ? 'Turn sound on' : 'Mute'; }
    var fb = el.querySelector('[data-act="fit"]');
    if (fb) { fb.innerHTML = ICON.fit; fb.title = it.fit === 'cover' ? 'Show whole frame' : 'Fill the cell'; }
    var pb = el.querySelector('[data-act="pin"]');
    if (pb) {
      pb.innerHTML = ICON.pin; pb.classList.toggle('on', !!it.pinned);
      pb.title = it.pinned ? 'Pinned. Click to let the playlist continue' : 'Pin: keep this on the tile';
      pb.setAttribute('aria-pressed', String(!!it.pinned));
    }
    el.classList.toggle('pinned', !!it.pinned);
    var nb = el.querySelector('[data-act="next"]');
    if (nb) { nb.innerHTML = ICON.next; nb.title = 'Next in playlist'; }
    var lb = el.querySelector('[data-act="loop"]');
    if (lb) {
      lb.innerHTML = ICON.loop; lb.classList.toggle('on', it.loop);
      lb.title = it.loop ? 'Looping. Click to play once' : 'Plays once. Click to loop';
      lb.setAttribute('aria-pressed', String(it.loop));
    }
    syncPlayBtn(el);
  }

  /* ---------- render ---------- */
  var ghost = document.createElement('div');
  ghost.className = 'ghost'; ghost.hidden = true;
  ghost.innerHTML = '<span></span>';
  wall.appendChild(ghost);

  function showGhost(g, ok, label) {
    ghost.style.gridColumn = (g.col + 1) + ' / span ' + g.w;
    ghost.style.gridRow = (g.row + 1) + ' / span ' + g.h;
    ghost.classList.toggle('bad', !ok);
    ghost.firstChild.textContent = label || '';
    ghost.hidden = false;
  }
  function hideGhost() { ghost.hidden = true; }

  function render() {
    wall.style.setProperty('--cols', S.cols);
    wall.style.setProperty('--rows', S.rows);
    wall.style.setProperty('--gap', S.gap + 'px');
    wall.classList.toggle('free', S.mode === 'free');
    var ar = { 'fill': 0, '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 }[S.aspect];
    if (ar) { wall.classList.add('ratio'); wall.style.setProperty('--ratio', (S.cols * ar / S.rows).toFixed(4)); }
    else { wall.classList.remove('ratio'); wall.style.removeProperty('--ratio'); }

    var ids = {};
    S.items.forEach(function (i) { ids[i.id] = 1; });
    tileEls.forEach(function (el, id) { if (!ids[id]) { el.remove(); tileEls.delete(id); } });
    S.items.forEach(function (it) {
      var el = tileEls.get(it.id);
      if (!el) { el = createTile(it); tileEls.set(it.id, el); }
      syncTile(it, el);
      if (el.parentNode !== wall) wall.appendChild(el);
    });

    Array.prototype.slice.call(wall.querySelectorAll('.slot')).forEach(function (s) { s.remove(); });
    var m = occupancy();
    for (var r = 0; r < S.rows && S.mode !== 'free'; r++) for (var c = 0; c < S.cols; c++) {
      if (m[r][c]) continue;
      var b = document.createElement('button');
      b.className = 'slot';
      b.style.gridColumn = String(c + 1); b.style.gridRow = String(r + 1);
      b.setAttribute('aria-label', 'Empty cell, column ' + (c + 1) + ' row ' + (r + 1) + '. Choose files.');
      b.innerHTML = '<span>C' + (c + 1) + ' · R' + (r + 1) + '</span><span class="hint">Drop or click</span>';
      b.dataset.col = c; b.dataset.row = r;
      wall.appendChild(b);
    }

    var gridOnly = S.mode === 'free';
    ['colsDec', 'colsInc', 'rowsDec', 'rowsInc', 'cols', 'rows', 'arrangeBtn', 'layoutBtn', 'fitMediaBtn'].forEach(function (id) { $('#' + id).disabled = gridOnly; });
    $('#modeSel').value = S.mode;
    if (gridOnly) $('#readout').textContent = (winId > 1 ? 'Wall ' + winId + ' · ' : '') + 'Free layout · ' + S.items.length + (S.items.length === 1 ? ' item' : ' items') + (S.presetName ? ' · ' + S.presetName : '');
    else $('#readout').textContent = (winId > 1 ? 'Wall ' + winId + ' · ' : '') + S.cols + ' × ' + S.rows + ' · ' + S.items.length + (S.items.length === 1 ? ' item' : ' items') + ' on ' + (S.cols * S.rows) + ' cells' + (S.presetName ? ' · ' + S.presetName : '');
    $('#cols').value = S.cols; $('#rows').value = S.rows;
    $('#gap').value = S.gap; $('#gapval').textContent = S.gap + ' px';
    $('#aspect').value = S.aspect; $('#fit').value = S.fit;
    $('#display').value = S.display == null ? '' : String(S.display);
    updateTransport();
    updateHistoryButtons();
    scheduleSession();
  }

  function hasImagePlaylist() {
    return S.items.some(function (i) { return i.pl && i.kind === 'image' && !i.missing && S.playlists[i.pl]; });
  }
  function updateTransport() {
    var vids = [];
    tileEls.forEach(function (el) { var v = el.querySelector('video'); if (v) vids.push(v); });
    var imgPl = hasImagePlaylist();
    $('#playAll').disabled = !(vids.length > 0 || imgPl); $('#muteAll').disabled = !vids.length;
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing; });
    var vl = vi.filter(function (i) { return !i.pl; });
    var nl = vl.filter(function (i) { return i.loop; }).length;
    $('#loopAll').disabled = !vl.length;
    $('#loopAll').textContent = !vl.length || nl === vl.length ? 'Loop: on' : (nl ? 'Loop: mixed' : 'Loop: off');
    $('#playAll').textContent = (vids.some(function (v) { return !v.paused; }) || (imgPl && !wallPaused)) ? 'Pause all' : 'Play all';
    $('#muteAll').textContent = vi.some(function (i) { return !i.muted; }) ? 'Mute all' : 'Unmute all';
  }

  function applyPanel() {
    document.body.classList.toggle('no-panel', !S.panel);
    $('#panelBtn').textContent = S.panel ? 'Hide panel' : 'Show panel';
    $('#panelBtn').setAttribute('aria-pressed', String(!S.panel));
  }
  $('#panelBtn').addEventListener('click', function () { S.panel = !S.panel; applyPanel(); savePrefs(); });

  /* ---------- selection + inspector ---------- */
  function select(id) {
    if (S.sel === id) return;
    S.sel = id;
    tileEls.forEach(function (el, k) { el.classList.toggle('sel', k === id); });
    refreshInspector();
  }
  function selected() { return S.items.filter(function (i) { return i.id === S.sel; })[0] || null; }
  function field(id, label, val, max) {
    return '<label class="fld" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="number" min="1" max="' + max + '" value="' + val + '" inputmode="numeric"></label>';
  }
  function freeFields(it) {
    var g = freeGeoPx()[it.id] || { x: 0, y: 0, w: 0, h: 0 };
    function f(id, label, v) { return '<label class="fld" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="number" step="1" value="' + Math.round(v) + '" inputmode="numeric"></label>'; }
    return f('fX', 'X', g.x) + f('fY', 'Y', g.y) + f('fW', 'Width', g.w) + f('fH', 'Height', g.h);
  }
  function seg(id, a, b, aOn) {
    return '<div class="seg" id="' + id + '"><button data-v="a" aria-pressed="' + aOn + '">' + a + '</button><button data-v="b" aria-pressed="' + (!aOn) + '">' + b + '</button></div>';
  }
  function refreshInspector() {
    var it = selected();
    if (!it) {
      inspector.innerHTML =
        '<div><div class="ins-name">Nothing selected</div><div class="ins-kind">Click a tile to set its position and size.</div></div>' +
        '<ul class="tips">' +
        '<li>Drop files or a whole folder from Explorer onto the wall. They fill empty cells in name order.</li>' +
        '<li>Drop on a cell to put media there. Drop on a tile to replace it.</li>' +
        '<li>Drag a tile anywhere. Tiles in the way move aside, or swap if they are the same size.</li>' +
        '<li>Drag any border or corner of a tile to resize it. Double-click a tile for fullscreen.</li>' +
        '<li>Arrow keys move the selected tile. Shift and arrows resize it. Ctrl+Z undoes. In Free layout the arrows move by 1 px (Ctrl: 10).</li>' +
        '<li>F11 toggles fullscreen. Wall mode hides the controls and fills the display you pick.</li>' +
        '</ul>' +
        '<p class="note">Sample tiles disappear when you add your own media. The wall you leave open comes back next time you start the app.</p>';
      return;
    }
    inspector.innerHTML =
      '<div><div class="ins-name">' + esc(it.name) + '</div><div class="ins-kind">' + kindLabel(it) + (it.sample ? ' · sample' : '') + (it.missing ? ' · file not found' : '') + '</div></div>' +
      (it.path ? '<div class="ins-path">' + esc(it.path) + '</div>' : '') +
      '<div class="sec"><span class="lab">Placement' + (S.mode === 'free' ? ' (pixels)' : '') + '</span><div class="fields">' +
      (S.mode === 'free' ? freeFields(it) :
      field('fCol', 'Column', it.col + 1, S.cols) + field('fRow', 'Row', it.row + 1, S.rows) +
      field('fW', 'Width', it.w, S.cols) + field('fH', 'Height', it.h, S.rows)) + '</div></div>' +
      (it.missing ? '' : '<div class="sec"><span class="lab">Display</span>' + seg('sFit', 'Fill cell', 'Whole frame', it.fit === 'cover') + '</div>') +
      (it.kind === 'video' && !it.missing ? '<div class="sec"><span class="lab">Playback</span>' + seg('sMute', 'Sound off', 'Sound on', it.muted) + (it.pl ? '' : seg('sLoop', 'Loop', 'Play once', it.loop)) + '</div>' : '') +
      (it.pl && !it.missing ? '<div class="sec"><span class="lab">Playlist</span>' + seg('sPin', 'Rotating', 'Pinned', !it.pinned) + '</div>' : '') +
      '<div class="acts">' +
      '<button class="btn" id="insFolder">Own folder…</button>' +
      (it.missing ? '<button class="btn pri" id="insRelink">Locate file</button>' : '<button class="btn" id="insReplace">Replace file</button>') +
      (it.path && !it.missing ? '<button class="btn" id="insReveal">Show in folder</button>' : '') +
      '<button class="btn warn" id="insRemove">Remove</button></div>';

    function commit() {
      var col = clamp((parseInt($('#fCol').value, 10) || 1) - 1, 0, S.cols - 1);
      var row = clamp((parseInt($('#fRow').value, 10) || 1) - 1, 0, S.rows - 1);
      var w = clamp(parseInt($('#fW').value, 10) || 1, 1, S.cols);
      var h = clamp(parseInt($('#fH').value, 10) || 1, 1, S.rows);
      var res = resolve(it.id, { col: col, row: row, w: w, h: h });
      if (res) { pushHistory(); applyGeo(res); render(); }
      else toast('There is no room for that placement.');
      refreshInspector();
    }
    function commitFree() {
      var d = wallPx();
      var w = clamp(parseInt($('#fW').value, 10) || MIN_FREE, MIN_FREE, d.W), h = clamp(parseInt($('#fH').value, 10) || MIN_FREE, MIN_FREE, d.H);
      var x = clamp(parseInt($('#fX').value, 10) || 0, 0, d.W - w), y = clamp(parseInt($('#fY').value, 10) || 0, 0, d.H - h);
      var res = resolveFree(it.id, { x: x, y: y, w: w, h: h }, freeGeoPx());
      if (res) { pushHistory(); applyFreePx(res); render(); }
      else toast('There is no room for that.');
      refreshInspector();
    }
    (S.mode === 'free' ? ['#fX', '#fY', '#fW', '#fH'] : ['#fCol', '#fRow', '#fW', '#fH']).forEach(function (s) { $(s).addEventListener('change', S.mode === 'free' ? commitFree : commit); });
    if ($('#sFit')) $('#sFit').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.fit = b.dataset.v === 'a' ? 'cover' : 'contain'; it.fitSet = true; render(); refreshInspector(); });
    if ($('#sMute')) {
      $('#sMute').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.muted = b.dataset.v === 'a'; render(); refreshInspector(); });
      if ($('#sLoop')) $('#sLoop').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.loop = b.dataset.v === 'a'; render(); refreshInspector(); });
    }
    if ($('#sPin')) $('#sPin').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setPinned(it, b.dataset.v === 'b'); });
    $('#insFolder').addEventListener('click', function () {
      api.openFolder().then(function (res) { if (res.entries.length) assignFolder(it, res); else if (res.skipped) toast('No videos, images or GIFs found in that folder.'); });
    });
    if ($('#insReplace')) $('#insReplace').addEventListener('click', function () {
      api.openFiles(false).then(function (res) {
        var f = res.entries[0];
        if (!f) { if (res.skipped) toast('Only video, image and GIF files can go on the wall.'); return; }
        pushHistory(); replaceMedia(it, f);
        if (it.pl) { it.pinned = true; it.loop = true; }
        render(); refreshInspector();
      });
    });
    if ($('#insRelink')) $('#insRelink').addEventListener('click', function () { relinkOne(it); });
    if ($('#insReveal')) $('#insReveal').addEventListener('click', function () { api.revealFile(it.path); });
    $('#insRemove').addEventListener('click', function () { removeItem(it.id); });
  }

  /* ---------- adding / replacing / removing media ---------- */
  function makeItem(entry, g) {
    return {
      id: S.nid++, name: entry.name, path: entry.path, kind: entry.kind, url: api.fileUrl(entry.path),
      col: g.col, row: g.row, w: g.w, h: g.h, fit: S.fit, muted: true, loop: true, sample: false, missing: false
    };
  }
  function replaceMedia(it, entry) {
    removeTileEl(it.id);
    it.name = entry.name; it.path = entry.path; it.kind = entry.kind; it.url = api.fileUrl(entry.path);
    it.sample = false; it.missing = false; it.muted = true; it.loop = true; it.gifSecs = undefined;
  }
  function relinkItem(it, entry) {
    var mu = it.muted, lp = it.loop, ft = it.fit;
    replaceMedia(it, entry);
    it.muted = mu; it.loop = lp; it.fit = ft; it.done = false;
  }
  function relinkOne(it) {
    api.openFiles(false).then(function (res) {
      var f = res.entries[0];
      if (!f) return;
      pushHistory();
      relinkItem(it, f);
      // Files that moved together usually still sit together, so look for the other missing ones in the same folder.
      var dir = dirOf(f.path), others = S.items.filter(function (i) { return i.missing && i !== it; });
      var go = others.length ? api.resolveNames(dir, others.map(function (i) { return i.name; })) : Promise.resolve({});
      return go.then(function (found) {
        var n = 0;
        others.forEach(function (o) {
          var p = found[o.name];
          if (p) { relinkItem(o, { path: p, name: o.name, kind: kindOfName(o.name) || o.kind }); n++; }
        });
        render(); refreshInspector();
        if (n) toast('Also reconnected ' + n + ' more from the same folder.');
      });
    });
  }
  function removeItem(id) {
    pushHistory();
    S.items = S.items.filter(function (i) { return i.id !== id; });
    if (S.sel === id) S.sel = null;
    render(); refreshInspector();
  }
  function addFiles(res, target, fromDrop) {
    if (fromDrop && res.dirs && res.dirs.length === 1 && (res.entries || []).length) {
      // A folder dropped on a tile gives that tile the folder. Dropped anywhere else it fills the wall.
      var occ0 = target ? (target.free ? itemUnderPoint(target) : itemAt(target.col, target.row)) : null;
      if (occ0 && !occ0.sample) assignFolder(occ0, res); else fillWithFolder(res, readPlOpts());
      return;
    }
    if (S.mode === 'free') { addFilesFree(res, target); return; }
    var media = sortEntries(res.entries || []), bad = res.skipped || 0;
    if (!media.length) { toast(bad ? 'Only video, image and GIF files can go on the wall.' : 'No videos, images or GIFs found there.'); return; }
    pushHistory();

    // Files that match tiles marked "not found" reconnect those tiles first.
    var offl = S.items.filter(function (i) { return i.missing; }), matched = 0;
    if (offl.length) {
      var rest = [];
      media.forEach(function (f) {
        var m = offl.filter(function (o) { return !o.done && o.name.toLowerCase() === f.name.toLowerCase(); })[0];
        if (m) { m.done = true; relinkItem(m, f); matched++; } else rest.push(f);
      });
      var ignored = 0;
      if (matched && rest.length && !target) { ignored = rest.length; rest = []; }
      media = rest;
      if (!media.length) {
        render(); refreshInspector();
        toast('Reconnected ' + matched + (matched === 1 ? ' file.' : ' files.') + (ignored ? ' ' + ignored + ' other ' + (ignored === 1 ? 'file was' : 'files were') + ' left out. Drop them again to add them.' : ''));
        return;
      }
    }

    var list = media.slice(), all = media.slice(), fresh = [], start = 0, lastItem = null;
    var occ = target ? itemAt(target.col, target.row) : null;
    var inherit = null;
    if (occ && !occ.sample) {
      var f1 = list.shift();
      if (occ.missing) relinkItem(occ, f1); else replaceMedia(occ, f1);
      if (occ.pl) { occ.pinned = true; occ.loop = true; }
      lastItem = occ;
      start = occ.row * S.cols + occ.col + 1;
    } else if (occ && occ.sample) {
      inherit = { col: occ.col, row: occ.row, w: occ.w, h: occ.h };
    } else if (target) {
      start = target.row * S.cols + target.col;
    }
    S.items = S.items.filter(function (i) { return !i.sample; });
    if (S.sel && !S.items.some(function (i) { return i.id === S.sel; })) S.sel = null;
    var m = occupancy(), skipped = 0;
    if (inherit && list.length) {
      var it0 = makeItem(list.shift(), inherit);
      S.items.push(it0); fresh.push(it0); mark(m, inherit, inherit.w, inherit.h); lastItem = it0; start = inherit.row * S.cols + inherit.col + 1;
    }
    list.forEach(function (f) {
      var s = freeSpot(m, 1, 1, start);
      if (!s) { skipped++; return; }
      var it = makeItem(f, { col: s.col, row: s.row, w: 1, h: 1 });
      S.items.push(it); fresh.push(it); mark(m, s, 1, 1); start = s.idx + 1; lastItem = it;
    });
    // More files than free cells: the new tiles become a playlist, so the rest of the folder plays in turn.
    var madePl = false;
    if (skipped && fresh.length) {
      var idx = {};
      all.forEach(function (f, n) { idx[f.path] = n; });
      var last = 0;
      fresh.forEach(function (t) { if (idx[t.path] > last) last = idx[t.path]; });
      var pid = 'p' + Date.now().toString(36);
      var order = all.map(function (f, n) { return n; });
      S.playlists[pid] = {
        name: dirOf(all[0].path).split(/[\\/]/).pop() || 'Playlist',
        files: all.map(function (f) { return { path: f.path, name: f.name, kind: f.kind }; }),
        shuffle: false, secs: 10, randomStart: false, maxClip: 0, fade: 0, gifOnce: false, root: rootFor(res, all), order: order, pos: last + 1
      };
      fresh.forEach(function (t) { t.pl = pid; t.loop = false; t.shown = 0; removeTileEl(t.id); });
      S.fillPl = pid;
      madePl = true;
    }
    render(); refreshInspector();
    var msg = [];
    if (madePl) msg.push('The folder has ' + all.length + ' files, so ' + fresh.length + (fresh.length === 1 ? ' tile plays' : ' tiles play') + ' it as a playlist.');
    if (matched) msg.push('Reconnected ' + matched + (matched === 1 ? ' file.' : ' files.'));
    if (skipped && !madePl) msg.push(skipped + (skipped === 1 ? ' file did' : ' files did') + ' not fit. Add rows or columns and add them again.');
    if (bad) msg.push(bad + ' unsupported ' + (bad === 1 ? 'file was' : 'files were') + ' skipped.');
    if (msg.length) toast(msg.join(' '));
  }

  /* ---------- folder playlists: one folder feeds a few tiles; when a clip ends (or an image has been shown
     long enough) that tile takes the next file from the folder. ---------- */
  function makeOrder(n, shuffle) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    if (shuffle) for (i = n - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function nextFile(p) {
    var n = p.files.length;
    if (!n) return null;
    if (!p.order || p.order.length !== n || p.pos >= n) { p.order = makeOrder(n, p.shuffle); p.pos = 0; }
    return p.files[p.order[p.pos++]];
  }
  function advance(it) {
    var p = it.pl && S.playlists[it.pl];
    if (!p) { it.pl = null; return; }
    if (it.pinned) return;
    var f = nextFile(p);
    if (!f) return;
    var mu = it.muted, ft = it.fit;
    var old = p.fade > 0 ? tileEls.get(it.id) : null;
    if (old) tileEls.delete(it.id); // keep the old element on screen while the new one fades in
    replaceMedia(it, f);
    it.muted = mu; it.fit = ft; it.loop = false; it.shown = 0;
    render();
    if (old) crossfade(it, old, p.fade);
    if (S.sel === it.id) refreshInspector();
  }
  function applyClipStart(it, media) {
    var p = it.pl && S.playlists[it.pl];
    it._t0 = 0;
    if (!p || it.pinned || !p.randomStart || !isFinite(media.duration)) return;
    var room = media.duration - (p.maxClip || 10);
    if (room > 1) { it._t0 = Math.random() * room; try { media.currentTime = it._t0; } catch (e) { it._t0 = 0; } }
  }
  function clipTick(it, media) {
    var p = it.pl && S.playlists[it.pl];
    if (!p || it.pinned || !p.maxClip || !media.isConnected) return;
    if (media.currentTime - (it._t0 || 0) >= p.maxClip) advance(it);
  }
  function crossfade(it, old, secs) {
    old._dead = true;
    old.style.pointerEvents = 'none';
    old.classList.remove('sel');
    var ov = old.querySelector('video'), vol = ov ? ov.volume : 0;
    var ne = tileEls.get(it.id);
    if (!ne) { old.remove(); return; }
    var nm = ne.querySelector('.media'), started = false;
    ne.style.opacity = '0';
    function go() {
      if (started) return;
      started = true;
      ne.style.transition = 'opacity ' + secs + 's linear';
      ne.style.opacity = '1';
      var t0 = Date.now(), iv = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / (secs * 1000));
        if (ov) { try { ov.volume = Math.max(0, vol * (1 - k)); } catch (e) { /* ignore */ } }
        if (k >= 1) {
          clearInterval(iv);
          if (ov) ov.pause();
          old.remove();
          ne.style.transition = ''; ne.style.opacity = '';
        }
      }, 60);
    }
    if (!nm || nm.classList.contains('offline-ph')) go();
    else {
      nm.addEventListener(nm.tagName === 'VIDEO' ? 'loadeddata' : 'load', go, { once: true });
      setTimeout(go, 1500);
    }
  }
  function setPinned(it, v) {
    it.pinned = !!v;
    if (v) it.loop = true;
    else {
      it.loop = false; it.shown = 0;
      var el = tileEls.get(it.id), vid = el && el.querySelector('video');
      if (vid) it._t0 = vid.currentTime;
    }
    render(); refreshInspector();
  }
  function failAdvance(it) {
    var p = it.pl && S.playlists[it.pl];
    if (!p) return;
    p.bad = (p.bad || 0) + 1;
    if (p.bad > p.files.length) return; // nothing in this folder plays, so stop trying
    setTimeout(function () { if (it.pl && S.items.indexOf(it) > -1) advance(it); }, 600);
  }
  setInterval(function () {
    if (wallPaused) return;
    S.items.slice().forEach(function (it) {
      if (!it.pl) return;
      var p = S.playlists[it.pl];
      if (!p) return;
      if (it.missing || it.kind === 'image') {
        var need = it.missing ? 2 : (p.secs || 10);
        if (!it.missing && p.gifOnce && /\.gif$/i.test(it.name)) {
          if (it.gifSecs === undefined) {
            it.gifSecs = null;
            api.gifDuration(it.path).then(function (d) { it.gifSecs = d > 0 ? clamp(d, 1, 600) : 0; }, function () { it.gifSecs = 0; });
          }
          if (it.gifSecs === null) return;       // still measuring
          if (it.gifSecs) need = it.gifSecs;
        }
        it.shown = (it.shown || 0) + 1;
        if (it.shown >= need) advance(it);
      }
    });
  }, 1000);
  function cleanPlaylists(o) {
    var out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).slice(0, 24).forEach(function (k) {
      var p = o[k];
      if (!p || !Array.isArray(p.files)) return;
      var files = p.files.filter(function (f) { return f && typeof f.path === 'string' && typeof f.name === 'string' && (f.kind === 'video' || f.kind === 'image'); })
        .slice(0, 3000).map(function (f) { return { path: f.path, name: f.name, kind: f.kind }; });
      if (!files.length) return;
      var order = Array.isArray(p.order) && p.order.length === files.length && p.order.every(function (x) { return x >= 0 && x < files.length; }) ? p.order.map(Number) : null;
      out[k] = { name: typeof p.name === 'string' ? p.name.slice(0, 60) : 'Playlist', files: files, shuffle: !!p.shuffle, secs: clamp(+p.secs || 10, 2, 300), randomStart: !!p.randomStart, maxClip: clamp(+p.maxClip || 0, 0, 3600), fade: clamp(+p.fade || 0, 0, 5), gifOnce: !!p.gifOnce, root: typeof p.root === 'string' ? p.root : null, order: order, pos: order ? clamp(p.pos | 0, 0, order.length) : 0 };
    });
    return out;
  }
  function usedPlaylists() {
    var out = {};
    S.items.forEach(function (i) {
      var p = i.pl && S.playlists[i.pl];
      if (p) out[i.pl] = { name: p.name, files: p.files, shuffle: p.shuffle, secs: p.secs, randomStart: p.randomStart, maxClip: p.maxClip, fade: p.fade, gifOnce: p.gifOnce, root: p.root, order: p.order, pos: p.pos };
    });
    if (S.fillPl && S.playlists[S.fillPl]) { var fp = S.playlists[S.fillPl]; out[S.fillPl] = { name: fp.name, files: fp.files, shuffle: fp.shuffle, secs: fp.secs, randomStart: fp.randomStart, maxClip: fp.maxClip, fade: fp.fade, gifOnce: fp.gifOnce, root: fp.root, order: fp.order, pos: fp.pos }; }
    return out;
  }
  function playlistTiles() { return S.items.filter(function (i) { return i.pl && S.playlists[i.pl]; }); }
  function refreshPlaylistStatus() {
    var tiles = playlistTiles(), box = $('#plStatus');
    $('#plFill').hidden = !(S.fillPl && S.playlists[S.fillPl]);
    if (!tiles.length) { box.textContent = S.fillPl && S.playlists[S.fillPl] ? 'Waiting for empty cells to fill.' : 'No playlist running.'; $('#plStop').hidden = !$('#plFill').hidden ? false : true; return; }
    var seen = {}, lines = [];
    tiles.forEach(function (t) { seen[t.pl] = (seen[t.pl] || 0) + 1; });
    Object.keys(seen).forEach(function (k) {
      var p = S.playlists[k];
      lines.push('"' + p.name + '": ' + p.files.length + ' files on ' + seen[k] + (seen[k] === 1 ? ' tile' : ' tiles'));
    });
    box.textContent = lines.join('. ') + '.';
    $('#plStop').hidden = false;
  }
  // The folder a playlist came from, if every file really lives inside it. Used to pick up new files.
  function rootFor(res, files) {
    var root = res && res.root ? res.root : (res && res.dirs && res.dirs.length === 1 ? res.dirs[0] : null);
    if (!root) return null;
    var pre = root.replace(/[\\/]+$/, '').toLowerCase();
    return files.every(function (f) { var q = f.path.toLowerCase(); return q.indexOf(pre) === 0 && /[\\/]/.test(q.charAt(pre.length)); }) ? root : null;
  }
  function refreshPlaylist(p, entries) {
    var files = entries.map(function (f) { return { path: f.path, name: f.name, kind: f.kind }; });
    var idx = {};
    files.forEach(function (f, i) { idx[f.path] = i; });
    if (!p.order || p.order.length !== p.files.length) { p.order = makeOrder(p.files.length, p.shuffle); p.pos = 0; }
    var upcoming = [], done = [];
    p.order.forEach(function (oi, n) {
      var old = p.files[oi], ni = old ? idx[old.path] : undefined;
      if (ni === undefined) return;
      (n >= p.pos ? upcoming : done).push(ni);
    });
    var seen = {};
    upcoming.concat(done).forEach(function (i) { seen[i] = true; });
    var added = [];
    files.forEach(function (f, i) { if (!seen[i]) added.push(i); });
    var removed = p.files.length - (files.length - added.length);
    if (!added.length && !removed) return 0;
    makeOrder(added.length, p.shuffle).forEach(function (k) {
      var i = added[k];
      if (p.shuffle) upcoming.splice(Math.floor(Math.random() * (upcoming.length + 1)), 0, i); else upcoming.push(i);
    });
    p.files = files; p.order = done.concat(upcoming); p.pos = done.length;
    return added.length;
  }
  var watching = false;
  function watchFolders() {
    if (watching) return;
    var jobs = [], seen = {};
    playlistTiles().forEach(function (t) {
      var p = S.playlists[t.pl];
      if (p && p.root && !seen[t.pl]) { seen[t.pl] = true; jobs.push([t.pl, p]); }
    });
    if (!jobs.length) return;
    watching = true;
    Promise.all(jobs.map(function (j) {
      return api.expand([j[1].root]).then(function (res) {
        if (!res.entries.length || S.playlists[j[0]] !== j[1]) return;
        var n = refreshPlaylist(j[1], res.entries);
        if (n) toast('"' + j[1].name + '": ' + n + (n === 1 ? ' new file' : ' new files') + ' added to the playlist.');
      });
    })).then(function () { watching = false; scheduleSession(); }, function () { watching = false; });
  }
  setInterval(watchFolders, 15000);

  function readPlOpts() {
    return {
      shuffle: $('#plOrder').value === 'shuffle',
      secs: clamp(parseInt($('#plSecs').value, 10) || 10, 2, 300),
      randomStart: $('#plFrom').value === 'random',
      maxClip: clamp(parseInt($('#plMax').value, 10) || 0, 0, 3600),
      fade: parseFloat($('#plFade').value) || 0,
      gifOnce: $('#plGif').value === 'once'
    };
  }
  // Choose a folder and it fills the empty cells of the wall. Rows or columns added later fill up with it too.
  function fillWithFolder(res, opts) {
    var files = (res.entries || []).map(function (f) { return { path: f.path, name: f.name, kind: f.kind }; });
    if (!files.length) { toast('No videos, images or GIFs found in that folder.'); return; }
    if (S.mode === 'free') { toast('A playlist fills the grid. Switch Layout to Grid, or select a tile and use Own folder.'); return; }
    pushHistory();
    S.items = S.items.filter(function (i) { return !i.sample; });
    if (S.sel && !S.items.some(function (i) { return i.id === S.sel; })) S.sel = null;
    var folder = dirOf(files[0].path), id = 'p' + Date.now().toString(36) + S.nid;
    S.playlists[id] = { name: folder.split(/[\\/]/).pop() || folder, files: files, shuffle: opts.shuffle, secs: opts.secs, randomStart: opts.randomStart, maxClip: opts.maxClip, fade: opts.fade, gifOnce: opts.gifOnce, root: rootFor(res, files), order: null, pos: 0 };
    S.fillPl = id;
    var n = autoFill(false);
    render(); refreshInspector();
    toast(n
      ? 'Playing "' + S.playlists[id].name + '" (' + files.length + ' files) on ' + n + (n === 1 ? ' tile.' : ' tiles.') + ' Add rows or columns and they fill too.'
      : 'The wall is full. Add rows or columns and the folder "' + S.playlists[id].name + '" will fill them.');
  }
  // Puts a tile playing the fill folder into each empty cell (never more tiles than files).
  function autoFill(onlyNew, oldCols, oldRows) {
    var p = S.fillPl && S.playlists[S.fillPl];
    if (!p || S.mode === 'free') return 0;
    var room = p.files.length - S.items.filter(function (i) { return i.pl === S.fillPl; }).length;
    if (room <= 0) return 0;
    var m = occupancy(), count = 0;
    for (var r = 0; r < S.rows && count < room; r++) for (var c = 0; c < S.cols && count < room; c++) {
      if (m[r][c]) continue;
      if (onlyNew && c < oldCols && r < oldRows) continue;
      var f = nextFile(p);
      S.items.push({
        id: S.nid++, name: f.name, path: f.path, kind: f.kind, url: api.fileUrl(f.path),
        col: c, row: r, w: 1, h: 1, fit: S.fit, muted: true, loop: false, sample: false, missing: false, pl: S.fillPl, shown: 0
      });
      m[r][c] = true; count++;
    }
    return count;
  }
  function stopPlaylist() {
    if (S.items.some(function (i) { return i.pl; })) pushHistory();
    S.items.forEach(function (it) { if (it.pl) { it.pl = null; it.pinned = false; it.loop = true; removeTileEl(it.id); } });
    S.playlists = {}; S.fillPl = null;
    render(); refreshInspector(); refreshPlaylistStatus();
  }
  $('#plStart').addEventListener('click', function () {
    var opts = readPlOpts();
    closePops();
    api.openFolder().then(function (res) { if (res.entries.length || res.skipped) fillWithFolder(res, opts); });
  });
  $('#plStop').addEventListener('click', stopPlaylist);
  $('#plFill').addEventListener('click', function () {
    var n = autoFill(false);
    render(); refreshInspector(); refreshPlaylistStatus();
    toast(n ? 'Added ' + n + (n === 1 ? ' tile.' : ' tiles.') : 'No empty cells to fill, or every file is already on a tile.');
  });

  // Give one tile its own folder. It gets a separate playlist, so other tiles keep theirs.
  function assignFolder(it, res) {
    var files = (res.entries || []).map(function (f) { return { path: f.path, name: f.name, kind: f.kind }; });
    if (!files.length) { toast('No videos, images or GIFs found in that folder.'); return; }
    var base = (it.pl && S.playlists[it.pl]) || readPlOpts();
    var folder = dirOf(files[0].path), id = 'p' + Date.now().toString(36) + S.nid;
    var p = { name: folder.split(/[\\/]/).pop() || folder, files: files, shuffle: !!base.shuffle, secs: base.secs || 10, randomStart: !!base.randomStart, maxClip: base.maxClip || 0, fade: base.fade || 0, gifOnce: !!base.gifOnce, root: rootFor(res, files), order: null, pos: 0 };
    pushHistory();
    S.playlists[id] = p;
    var mu = it.muted, ft = it.fit, f = nextFile(p);
    replaceMedia(it, f);
    it.muted = mu; it.fit = ft; it.pl = id; it.pinned = false; it.loop = false; it.shown = 0;
    render(); refreshInspector();
    toast('This tile now plays "' + p.name + '" (' + files.length + ' files).');
  }

  /* ---------- drag and drop ---------- */
  function planDrop(e, isFiles) {
    var inside = inWall(e.clientX, e.clientY);
    if (dragId != null) {
      var it = S.items.filter(function (i) { return i.id === dragId; })[0];
      if (!it || !inside) return { ok: false, ghost: null };
      var c = cellAt(e.clientX, e.clientY);
      var mine = { col: clamp(c.col - dragOff.dx, 0, S.cols - it.w), row: clamp(c.row - dragOff.dy, 0, S.rows - it.h), w: it.w, h: it.h };
      var o = {}; o[it.id] = mine;
      if (validLayout(o)) return { ok: true, changes: o, ghost: mine, label: 'Move' };
      var occ = itemAt(c.col, c.row, it.id);
      if (occ && occ.w === it.w && occ.h === it.h) {
        var a = { col: occ.col, row: occ.row, w: it.w, h: it.h };
        var b = { col: it.col, row: it.row, w: occ.w, h: occ.h };
        var o2 = {}; o2[it.id] = a; o2[occ.id] = b;
        if (validLayout(o2)) return { ok: true, changes: o2, ghost: a, label: 'Swap' };
      }
      var res = resolve(it.id, mine);
      if (res) return { ok: true, changes: res, ghost: mine, label: 'Move, others make room' };
      return { ok: false, ghost: mine, label: 'No room' };
    }
    if (!isFiles) return null;
    if (!inside) return { ok: true, target: null, ghost: null };
    var cc = cellAt(e.clientX, e.clientY), oc = itemAt(cc.col, cc.row);
    var n = (e.dataTransfer && e.dataTransfer.items) ? e.dataTransfer.items.length : 1;
    if (oc) return { ok: true, target: cc, ghost: { col: oc.col, row: oc.row, w: oc.w, h: oc.h }, label: oc.missing ? 'Reconnect' : (oc.sample ? 'Replace sample' : 'Replace') };
    return { ok: true, target: cc, ghost: { col: cc.col, row: cc.row, w: 1, h: 1 }, label: n > 1 ? 'Add ' + n : 'Add' };
  }

  window.addEventListener('dragover', function (e) {
    e.preventDefault();
    var types = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.types) || []);
    var isFiles = types.indexOf('Files') > -1;
    if (dragId == null && !isFiles) return;
    if (S.mode === 'free') { hideGhost(); wall.classList.toggle('hot', isFiles && inWall(e.clientX, e.clientY)); e.dataTransfer.dropEffect = 'copy'; return; }
    var plan = planDrop(e, isFiles);
    if (plan && plan.ghost) showGhost(plan.ghost, plan.ok, plan.label); else hideGhost();
    wall.classList.toggle('hot', !!(plan && plan.ok && isFiles && !plan.ghost));
    e.dataTransfer.dropEffect = (plan && plan.ok === false) ? 'none' : (dragId != null ? 'move' : 'copy');
  });
  window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) { hideGhost(); wall.classList.remove('hot'); } });

  window.addEventListener('drop', function (e) {
    e.preventDefault();
    hideGhost(); wall.classList.remove('hot');
    if (dragId != null) {
      var plan = planDrop(e, false);
      if (plan && plan.ok) { pushHistory(); applyGeo(plan.changes); render(); refreshInspector(); }
      else if (plan && plan.label === 'No room') toast('The wall is too full to make room for that.');
      dragId = null;
      return;
    }
    var dt = e.dataTransfer;
    if (!dt || Array.prototype.slice.call(dt.types || []).indexOf('Files') < 0) return;
    var plan2 = planDrop(e, true);
    var paths = Array.prototype.slice.call(dt.files || []).map(function (f) { return api.pathOf(f); }).filter(Boolean);
    if (!paths.length) { toast('Could not read those files. Drop files or folders from Explorer.'); return; }
    var tgt = S.mode === 'free' ? { x: e.clientX, y: e.clientY, free: true } : (plan2 && plan2.target);
    api.expand(paths).then(function (res) { addFiles(res, tgt, true); });
  });

  /* ---------- controls ---------- */
  function setGrid(c, r) {
    c = clamp(parseInt(c, 10) || S.cols, 1, 12); r = clamp(parseInt(r, 10) || S.rows, 1, 12);
    if (c === S.cols && r === S.rows) { render(); return; }
    var oc = S.cols, orows = S.rows;
    var fits = S.items.every(function (i) { return i.col + i.w <= c && i.row + i.h <= r; });
    if (!fits) {
      // Tiles that still fit stay where they are. Tiles outside the new grid move to the nearest free
      // cell (smaller if needed). If there is no room at all, those tiles are removed; Ctrl+Z brings them back.
      var geo = {}, dropped = [], mm = [], y;
      for (y = 0; y < r; y++) mm.push(new Array(c).fill(false));
      var outside = [];
      S.items.forEach(function (i) {
        if (i.col + i.w <= c && i.row + i.h <= r) { geo[i.id] = { col: i.col, row: i.row, w: i.w, h: i.h }; mark(mm, i, i.w, i.h); }
        else outside.push(i);
      });
      outside.sort(readingOrder).forEach(function (i) {
        var w = Math.min(i.w, c), h = Math.min(i.h, r);
        var sp = freeSpot(mm, w, h, 0, c, r);
        if (!sp) { w = 1; h = 1; sp = freeSpot(mm, 1, 1, 0, c, r); }
        if (!sp) { dropped.push(i.id); return; }
        mark(mm, sp, w, h);
        geo[i.id] = { col: sp.col, row: sp.row, w: w, h: h };
      });
      pushHistory();
      applyGeo(geo);
      if (dropped.length) {
        S.items = S.items.filter(function (i) { return dropped.indexOf(i.id) < 0; });
        if (S.sel && dropped.indexOf(S.sel) > -1) S.sel = null;
      }
      S.cols = c; S.rows = r;
      toast(dropped.length
        ? dropped.length + (dropped.length === 1 ? ' tile' : ' tiles') + ' removed to fit ' + c + ' × ' + r + '. Ctrl+Z brings back.'
        : 'Tiles moved to fit ' + c + ' × ' + r + '.');
    } else { pushHistory(); S.cols = c; S.rows = r; }
    var filled = autoFill(true, oc, orows);
    if (filled) toast(filled + (filled === 1 ? ' new tile' : ' new tiles') + ' playing "' + S.playlists[S.fillPl].name + '".');
    savePrefs(); render(); refreshInspector();
  }
  $('#colsDec').addEventListener('click', function () { setGrid(S.cols - 1, S.rows); });
  $('#colsInc').addEventListener('click', function () { setGrid(S.cols + 1, S.rows); });
  $('#rowsDec').addEventListener('click', function () { setGrid(S.cols, S.rows - 1); });
  $('#rowsInc').addEventListener('click', function () { setGrid(S.cols, S.rows + 1); });
  $('#cols').addEventListener('change', function () { setGrid($('#cols').value, S.rows); });
  $('#rows').addEventListener('change', function () { setGrid(S.cols, $('#rows').value); });
  $('#gap').addEventListener('input', function () { S.gap = parseInt($('#gap').value, 10) || 0; savePrefs(); render(); });
  $('#aspect').addEventListener('change', function () { S.aspect = $('#aspect').value; savePrefs(); render(); });
  $('#fit').addEventListener('change', function () { S.fit = $('#fit').value; S.items.forEach(function (i) { if (!i.fitSet) i.fit = S.fit; }); savePrefs(); render(); refreshInspector(); });
  $('#display').addEventListener('change', function () { var v = $('#display').value; S.display = v === '' ? null : Number(v); savePrefs(); });

  $('#addBtn').addEventListener('click', function () {
    api.openFiles(true).then(function (res) { if (res.entries.length || res.skipped) addFiles(res, null); });
  });
  $('#folderBtn').addEventListener('click', function (e) { e.stopPropagation(); if ($('#popF').hidden) openPop('folder'); else closePops(); });
  $('#folderPl').addEventListener('click', function () {
    var opts = readPlOpts();
    closePops();
    api.openFolder().then(function (res) { if (res.entries.length || res.skipped) fillWithFolder(res, opts); });
  });
  $('#folderTiles').addEventListener('click', function () {
    closePops();
    api.openFolder().then(function (res) { if (res.entries.length || res.skipped) addFiles(res, null); });
  });
  wall.addEventListener('click', function (e) {
    var slot = e.target.closest('.slot');
    if (slot) {
      var target = { col: +slot.dataset.col, row: +slot.dataset.row };
      api.openFiles(true).then(function (res) { if (res.entries.length || res.skipped) addFiles(res, target); });
      return;
    }
    if (e.target === wall) select(null);
  });

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#arrangeBtn').addEventListener('click', function () {
    if (!S.items.length) { toast('Nothing to arrange yet.'); return; }
    var plan = arrange(S.cols, S.rows);
    if (!plan) { toast('Not enough room. Add rows or columns first.'); return; }
    pushHistory(); applyGeo(plan); render(); refreshInspector();
  });

  /* ---------- Fit to media: choose tile shapes so each media fills its tile with as few bars as possible ---------- */
  function mediaAspect(it) {
    var el = tileEls.get(it.id), m = el && el.querySelector('.media'), w = 0, h = 0;
    if (m && !it.missing) {
      if (m.tagName === 'VIDEO') { w = m.videoWidth; h = m.videoHeight; }
      else if (m.tagName === 'IMG') { w = m.naturalWidth; h = m.naturalHeight; }
    }
    if (w > 0 && h > 0) { it.ar = w / h; return { a: it.ar, known: true }; }
    return { a: it.ar || 16 / 9, known: !!it.ar };
  }
  function fitFrac(r, a) { return Math.min(r / a, a / r); }
  function seededRandom(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Random guillotine partition of a w by h block of cells into exactly k rectangles.
  function randomPartition(col, row, w, h, k, rnd, out) {
    if (k === 1) { out.push({ col: col, row: row, w: w, h: h }); return; }
    var cuts = [], i;
    for (i = 1; i < w; i++) cuts.push([0, i]);
    for (i = 1; i < h; i++) cuts.push([1, i]);
    var cut = cuts[Math.floor(rnd() * cuts.length)];
    var a1 = cut[0] === 0 ? cut[1] * h : w * cut[1], a2 = w * h - a1;
    var lo = Math.max(1, k - a2), hi = Math.min(k - 1, a1);
    var k1 = rnd() < 0.5 ? lo + Math.floor(rnd() * (hi - lo + 1)) : Math.max(lo, Math.min(hi, Math.round(k * a1 / (w * h))));
    if (cut[0] === 0) {
      randomPartition(col, row, cut[1], h, k1, rnd, out);
      randomPartition(col + cut[1], row, w - cut[1], h, k - k1, rnd, out);
    } else {
      randomPartition(col, row, w, cut[1], k1, rnd, out);
      randomPartition(col, row + cut[1], w, h - cut[1], k - k1, rnd, out);
    }
  }
  function fitToMedia() {
    if (S.mode === 'free') { toast('Fit to media works on the grid. Switch Layout to Grid first.'); return; }
    var N = S.items.length;
    if (!N) { toast('Nothing to fit yet.'); return; }
    if (N > S.cols * S.rows) { toast('There are more tiles than cells. Add rows or columns first.'); return; }
    var mt = metrics(), gap = S.gap, unknown = 0;
    var asp = S.items.map(function (it) { var r = mediaAspect(it); if (!r.known) unknown++; return r.a; });
    function ratio(g) { return Math.max(1, g.w * mt.px - gap) / Math.max(1, g.h * mt.py - gap); }
    function coverage(rects, assign) {
      var sum = 0, area = 0;
      rects.forEach(function (g, j) { sum += g.w * g.h * fitFrac(ratio(g), asp[assign[j]]); area += g.w * g.h; });
      return sum / area;
    }
    var before = coverage(S.items.map(function (i) { return { w: i.w, h: i.h }; }), S.items.map(function (i, n) { return n; }));
    var order = asp.map(function (a, n) { return n; }).sort(function (x, y) { return asp[x] - asp[y]; });
    function assignTo(rects) {
      var idx = rects.map(function (g, j) { return j; }).sort(function (x, y) { return ratio(rects[x]) - ratio(rects[y]); });
      var assign = new Array(rects.length);
      idx.forEach(function (j, n) { assign[j] = order[n]; });
      var improved = true, guard = 0;
      while (improved && guard++ < 8) {
        improved = false;
        for (var x = 0; x < rects.length; x++) for (var y = x + 1; y < rects.length; y++) {
          var cur = rects[x].w * rects[x].h * fitFrac(ratio(rects[x]), asp[assign[x]]) + rects[y].w * rects[y].h * fitFrac(ratio(rects[y]), asp[assign[y]]);
          var swp = rects[x].w * rects[x].h * fitFrac(ratio(rects[x]), asp[assign[y]]) + rects[y].w * rects[y].h * fitFrac(ratio(rects[y]), asp[assign[x]]);
          if (swp > cur + 1e-9) { var t = assign[x]; assign[x] = assign[y]; assign[y] = t; improved = true; }
        }
      }
      return assign;
    }
    var rnd = seededRandom(7), best = null, bestScore = -1, tries = N === 1 ? 1 : 9000;
    for (var n = 0; n < tries; n++) {
      var rects = [];
      randomPartition(0, 0, S.cols, S.rows, N, rnd, rects);
      var as = assignTo(rects), sc = coverage(rects, as);
      if (sc > bestScore) { bestScore = sc; best = { rects: rects, assign: as }; }
    }
    if (N === S.cols * S.rows) {            // a plain grid is one of the options too
      var plain = [];
      for (var yy = 0; yy < S.rows; yy++) for (var xx = 0; xx < S.cols; xx++) plain.push({ col: xx, row: yy, w: 1, h: 1 });
      var pa = assignTo(plain), ps = coverage(plain, pa);
      if (ps > bestScore) { bestScore = ps; best = { rects: plain, assign: pa }; }
    }
    pushHistory();
    best.rects.forEach(function (g, j) {
      var it = S.items[best.assign[j]];
      it.col = g.col; it.row = g.row; it.w = g.w; it.h = g.h; it.fit = 'contain'; it.fitSet = true;
    });
    render(); refreshInspector();
    var msg = 'Fitted ' + N + (N === 1 ? ' tile' : ' tiles') + ': ' + Math.round(before * 100) + '% of tile area showed media, now ' + Math.round(bestScore * 100) + '%.';
    if (S.items.some(function (i) { return i.pl; })) msg += ' Playlist tiles keep this shape, so later clips may still have bars.';
    if (unknown) msg += ' ' + unknown + (unknown === 1 ? ' tile was' : ' tiles were') + ' not loaded yet and counted as 16:9.';
    toast(msg);
  }
  $('#fitMediaBtn').addEventListener('click', fitToMedia);
  $('#playAll').addEventListener('click', function () {
    var vids = [];
    tileEls.forEach(function (el) { var v = el.querySelector('video'); if (v) vids.push(v); });
    var anyPlaying = vids.some(function (v) { return !v.paused; }) || (hasImagePlaylist() && !wallPaused);
    wallPaused = anyPlaying;
    vids.forEach(function (v) { if (anyPlaying) v.pause(); else v.play().catch(function () {}); });
    updateTransport();
  });
  $('#muteAll').addEventListener('click', function () {
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing; });
    var anyOn = vi.some(function (i) { return !i.muted; });
    vi.forEach(function (i) { i.muted = anyOn; });
    render(); refreshInspector();
  });
  $('#loopAll').addEventListener('click', function () {
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing && !i.pl; });
    var allOn = vi.length > 0 && vi.every(function (i) { return i.loop; });
    vi.forEach(function (i) { i.loop = !allOn; });
    render(); refreshInspector();
    if (!allOn) tileEls.forEach(function (el) { var v = el.querySelector('video'); if (v && v.ended) v.play().catch(function () {}); });
  });

  // Wall mode hides the controls and goes fullscreen on the chosen display. Leaving fullscreen by any route leaves wall mode.
  function setClean(on) {
    document.body.classList.toggle('clean', on);
    wake();
    api.setFullscreen(on, S.display);
  }
  api.onFullscreen(function (v) {
    isFs = v;
    if (!v) document.body.classList.remove('clean');
  });
  api.isFullscreen().then(function (v) { isFs = v; });
  // In wall mode the cursor and tile buttons disappear after a few idle seconds and come back on movement.
  var idleTimer = 0;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (document.body.classList.contains('clean')) idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3000);
  }
  document.addEventListener('mousemove', wake);
  document.addEventListener('mousedown', wake);
  $('#newWinBtn').addEventListener('click', function () {
    api.newWindow().then(function (r) { if (r && r.error) toast(r.error); });
  });
  $('#cleanBtn').addEventListener('click', function () { setClean(true); });
  $('#exitBtn').addEventListener('click', function () { setClean(false); });

  document.addEventListener('keydown', function (e) {
    var t = e.target, inField = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (e.key === 'F11') { e.preventDefault(); setClean(!document.body.classList.contains('clean')); return; }
    if (e.key === 'Escape') {
      if (document.body.classList.contains('clean')) setClean(false);
      else if (isFs) api.setFullscreen(false, null);
      closePops();
      select(null);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !inField) {
      var k = String(e.key).toLowerCase();
      if (k === 'b') { e.preventDefault(); $('#panelBtn').click(); return; }
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }
    var it = selected();
    if (!it || inField) return;
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (S.mode === 'free') { nudgeFree(it, d, e); return; }
    var g = { col: it.col, row: it.row, w: it.w, h: it.h };
    if (e.shiftKey) { g.w = clamp(g.w + d[0], 1, S.cols); g.h = clamp(g.h + d[1], 1, S.rows); }
    else { g.col += d[0]; g.row += d[1]; }
    var res = resolve(it.id, g);
    if (res) { pushHistory(); applyGeo(res); render(); refreshInspector(); }
  });
  $('#clearBtn').addEventListener('click', function () {
    var b = this;
    if (!clearArmed) {
      clearArmed = true; b.textContent = 'Click again to clear'; b.classList.add('warn');
      setTimeout(function () { clearArmed = false; b.textContent = 'Clear wall'; b.classList.remove('warn'); }, 3000);
      return;
    }
    clearArmed = false; b.textContent = 'Clear wall'; b.classList.remove('warn');
    pushHistory();
    S.items = []; S.sel = null; S.presetName = null; S.playlists = {}; S.fillPl = null; render(); refreshInspector();
  });

  /* ---------- popovers ---------- */
  function closePops() {
    $('#pop').hidden = true; $('#popL').hidden = true; $('#popP').hidden = true; $('#popF').hidden = true;
    $('#folderBtn').setAttribute('aria-expanded', 'false');
    $('#presetBtn').setAttribute('aria-expanded', 'false'); $('#layoutBtn').setAttribute('aria-expanded', 'false'); $('#playlistBtn').setAttribute('aria-expanded', 'false');
  }
  // Popovers are positioned from their button and clamped to the window, so they never run off an edge.
  function placePop(pop, btn) {
    var vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
    var w = Math.min(380, vw - 2 * m);
    var r = btn.getBoundingClientRect();
    pop.style.width = w + 'px';
    pop.style.left = clamp(r.right - w, m, Math.max(m, vw - w - m)) + 'px';
    var below = vh - r.bottom - 8 - m;
    if (below >= 260 || below >= r.top - 8 - m) {
      pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 8) + 'px';
      pop.style.maxHeight = Math.max(160, below) + 'px';
    } else {
      pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + 8) + 'px';
      pop.style.maxHeight = Math.max(160, r.top - 8 - m) + 'px';
    }
  }
  function placeOpen() {
    if (!$('#pop').hidden) placePop($('#pop'), $('#presetBtn'));
    if (!$('#popL').hidden) placePop($('#popL'), $('#layoutBtn'));
    if (!$('#popP').hidden) placePop($('#popP'), $('#playlistBtn'));
    if (!$('#popF').hidden) placePop($('#popF'), $('#folderBtn'));
  }
  window.addEventListener('resize', placeOpen);
  window.addEventListener('scroll', placeOpen);
  function openPop(which) {
    closePops();
    if (which === 'presets') {
      $('#pop').hidden = false; $('#presetBtn').setAttribute('aria-expanded', 'true');
      $('#presetName').value = S.presetName || '';
      refreshPresetList();
    } else if (which === 'layouts') {
      $('#popL').hidden = false; $('#layoutBtn').setAttribute('aria-expanded', 'true');
      renderLayouts();
      api.storeGet('layouts').then(function (l) {
        userLayoutsCache = (Array.isArray(l) ? l : []).filter(function (L) { return L && typeof L.name === 'string' && validFrames(L); });
        if (!$('#popL').hidden) renderLayouts();
      });
    } else if (which === 'playlist') {
      $('#popP').hidden = false; $('#playlistBtn').setAttribute('aria-expanded', 'true');
      refreshPlaylistStatus();
    } else {
      $('#popF').hidden = false; $('#folderBtn').setAttribute('aria-expanded', 'true');
    }
    placeOpen();
  }
  $('#presetBtn').addEventListener('click', function (e) { e.stopPropagation(); if ($('#pop').hidden) openPop('presets'); else closePops(); });
  $('#layoutBtn').addEventListener('click', function (e) { e.stopPropagation(); if ($('#popL').hidden) openPop('layouts'); else closePops(); });
  $('#playlistBtn').addEventListener('click', function (e) { e.stopPropagation(); if ($('#popP').hidden) openPop('playlist'); else closePops(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.popwrap')) closePops(); });

  /* ---------- wall presets: grid, placement, settings and the path of each file ---------- */
  function cleanRecord(r, needName) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.items)) return null;
    var name = typeof r.name === 'string' ? r.name.trim().slice(0, 48) : '';
    if (needName && !name) return null;
    var items = r.items.filter(function (i) {
      return i && typeof i.path === 'string' && i.path && typeof i.name === 'string' && (i.kind === 'video' || i.kind === 'image') &&
        isFinite(i.col) && isFinite(i.row) && i.w >= 1 && i.h >= 1;
    }).map(function (i) {
      return {
        path: i.path, name: i.name, kind: i.kind, col: i.col | 0, row: i.row | 0, w: i.w | 0, h: i.h | 0,
        fit: i.fit === 'contain' ? 'contain' : 'cover', muted: i.muted !== false, loop: i.loop !== false,
        pl: typeof i.pl === 'string' ? i.pl : null, pinned: i.pinned === true, fitSet: i.fitSet === true,
        fx: isFinite(i.fx) && i.fx !== null ? +i.fx : undefined, fy: isFinite(i.fy) && i.fy !== null ? +i.fy : undefined, fw: isFinite(i.fw) && i.fw !== null ? +i.fw : undefined, fh: isFinite(i.fh) && i.fh !== null ? +i.fh : undefined
      };
    });
    return {
      name: name, savedAt: +r.savedAt || Date.now(),
      cols: clamp((r.cols | 0) || 4, 1, 12), rows: clamp((r.rows | 0) || 3, 1, 12), gap: clamp(r.gap | 0, 0, 24),
      aspect: ASPECTS.indexOf(r.aspect) > -1 ? r.aspect : 'fill', fit: r.fit === 'contain' ? 'contain' : 'cover',
      presetName: typeof r.presetName === 'string' ? r.presetName : null, items: items, mode: r.mode === 'free' ? 'free' : 'grid', playlists: cleanPlaylists(r.playlists), fillPl: typeof r.fillPl === 'string' ? r.fillPl : null
    };
  }
  function currentRecord(name) {
    return {
      name: name, savedAt: Date.now(), cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, presetName: S.presetName, mode: S.mode, playlists: usedPlaylists(), fillPl: (S.fillPl && S.playlists[S.fillPl]) ? S.fillPl : null,
      items: S.items.filter(function (i) { return !i.sample && i.path; }).map(function (i) {
        return { path: i.path, name: i.name, kind: i.kind, col: i.col, row: i.row, w: i.w, h: i.h, fit: i.fit, muted: i.muted, loop: i.loop, pl: i.pl || null, pinned: !!i.pinned, fitSet: !!i.fitSet, fx: i.fx, fy: i.fy, fw: i.fw, fh: i.fh };
      })
    };
  }
  async function applyRecord(rec, label) {
    var items = rec.items.map(function (i) {
      return { id: S.nid++, name: i.name, path: i.path, kind: i.kind, url: null, col: i.col, row: i.row, w: i.w, h: i.h, fit: i.fit, muted: i.muted, loop: i.loop, sample: false, missing: false, pl: (i.pl && rec.playlists && rec.playlists[i.pl]) ? i.pl : null, pinned: !!i.pinned, fitSet: !!i.fitSet, fx: i.fx, fy: i.fy, fw: i.fw, fh: i.fh, shown: 0 };
    });
    var ex = items.length ? await api.exists(items.map(function (i) { return i.path; })) : [];
    var missing = 0;
    items.forEach(function (it, n) { if (ex[n]) it.url = api.fileUrl(it.path); else { it.missing = true; missing++; } });
    S.items = items; S.sel = null; S.presetName = label || null; S.mode = rec.mode === 'free' ? 'free' : 'grid'; S.playlists = rec.playlists || {}; S.fillPl = (rec.fillPl && S.playlists[rec.fillPl]) ? rec.fillPl : null;
    S.cols = rec.cols; S.rows = rec.rows; S.gap = rec.gap; S.aspect = rec.aspect; S.fit = rec.fit;
    if (S.mode === 'free') toFree(true);
    else if (!validLayout()) {
      var plan = arrange(S.cols, S.rows);
      while (!plan && S.rows < 12) { S.rows++; plan = arrange(S.cols, S.rows); }
      if (plan) applyGeo(plan);
    }
    undoStack = []; redoStack = [];
    savePrefs(); render(); refreshInspector();
    return missing;
  }
  function listPresets() {
    return api.storeGet('presets').then(function (list) {
      var out = [];
      (Array.isArray(list) ? list : []).forEach(function (r) { var c = cleanRecord(r, true); if (c) out.push(c); });
      return out.sort(function (a, b) { return b.savedAt - a.savedAt; });
    });
  }
  function refreshPresetList() {
    var box = $('#plist');
    api.storeInfo().then(function (info) {
      $('#storeNote').textContent = 'Stored in ' + info.dir;
    });
    listPresets().then(function (list) {
      if (!list.length) { box.innerHTML = '<p class="note">No presets yet. Arrange a wall, name it above and press Save.</p>'; return; }
      box.innerHTML = list.map(function (p) {
        var n = p.items.length;
        return '<div class="prow" data-name="' + esc(p.name) + '"><div class="pinfo"><div class="pname">' + esc(p.name) + '</div>' +
          '<div class="pmeta">' + p.cols + ' × ' + p.rows + ' · ' + n + (n === 1 ? ' item' : ' items') + '</div></div>' +
          '<button class="btn" data-pa="load">Load</button><button class="btn" data-pa="del" aria-label="Delete preset ' + esc(p.name) + '">Delete</button></div>';
      }).join('');
    });
  }
  $('#saveForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#presetName').value.trim().slice(0, 48);
    if (!name) { toast('Give the preset a name first.'); $('#presetName').focus(); return; }
    var rec = currentRecord(name);
    if (!rec.items.length) { toast('Add some of your own media first. Sample tiles are not saved.'); return; }
    var btn = $('#saveBtn'); btn.disabled = true;
    listPresets().then(function (list) {
      var existed = list.some(function (p) { return p.name === name; });
      var next = list.filter(function (p) { return p.name !== name; });
      next.unshift(rec);
      return api.storeSet('presets', next).then(function (ok) {
        if (!ok) { toast('Could not save the preset. The data folder is not writable.'); return; }
        S.presetName = name; render();
        toast((existed ? 'Updated "' : 'Saved "') + name + '".');
        refreshPresetList();
      });
    }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; toast('Could not save the preset.'); });
  });
  $('#plist').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pa]');
    if (!b) return;
    var name = b.closest('.prow').dataset.name;
    if (b.dataset.pa === 'load') {
      b.disabled = true; b.textContent = 'Loading…';
      listPresets().then(function (list) {
        var rec = list.filter(function (p) { return p.name === name; })[0];
        if (!rec) { toast('That preset no longer exists.'); refreshPresetList(); return; }
        return applyRecord(rec, name).then(function (missing) {
          closePops();
          toast(missing
            ? 'Loaded "' + name + '". ' + missing + (missing === 1 ? ' file was' : ' files were') + ' not found. Use Locate file on a tile.'
            : 'Loaded "' + name + '".');
        });
      }).then(null, function () { toast('Could not load that preset.'); refreshPresetList(); });
    } else {
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = 'Sure?'; b.classList.add('warn');
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; b.classList.remove('warn'); } }, 3000);
        return;
      }
      listPresets().then(function (list) {
        return api.storeSet('presets', list.filter(function (p) { return p.name !== name; }));
      }).then(function () {
        if (S.presetName === name) { S.presetName = null; render(); }
        refreshPresetList();
      });
    }
  });
  $('#revealBtn').addEventListener('click', function () { api.revealStore(); });
  $('#exportBtn').addEventListener('click', function () {
    listPresets().then(function (list) {
      var text = JSON.stringify({ app: 'media-wall', version: 1, presets: list, layouts: userLayoutsCache }, null, 2);
      return api.exportData(text);
    }).then(function (file) { if (file) toast('Exported to ' + file); });
  });
  $('#importBtn').addEventListener('click', function () {
    api.importData().then(function (res) {
      if (!res) return;
      if (res.error) { toast(res.error); return; }
      var d = res.data;
      if (!d || d.app !== 'media-wall') { toast('That file is not a Media Wall export.'); return; }
      return listPresets().then(function (list) {
        var added = 0;
        (Array.isArray(d.presets) ? d.presets : []).forEach(function (r) {
          var c = cleanRecord(r, true);
          if (!c) return;
          list = list.filter(function (p) { return p.name !== c.name; });
          list.unshift(c); added++;
        });
        var addedL = 0, mine = userLayoutsCache.slice();
        (Array.isArray(d.layouts) ? d.layouts : []).forEach(function (L) {
          if (!L || typeof L.name !== 'string' || !validFrames(L)) return;
          mine = mine.filter(function (x) { return x.name !== L.name; });
          mine.unshift({ name: L.name.slice(0, 40), cols: L.cols, rows: L.rows, f: L.f }); addedL++;
        });
        return Promise.all([api.storeSet('presets', list), api.storeSet('layouts', mine.slice(0, 40))]).then(function () {
          userLayoutsCache = mine.slice(0, 40);
          refreshPresetList();
          toast('Imported ' + added + (added === 1 ? ' preset' : ' presets') + ' and ' + addedL + (addedL === 1 ? ' layout.' : ' layouts.'));
        });
      });
    });
  });

  /* ---------- layouts: frames only, no media. Applying one moves the current tiles into the frames. ---------- */
  function gridFrames(c, r) { var f = []; for (var y = 0; y < r; y++) for (var x = 0; x < c; x++) f.push([x, y, 1, 1]); return f; }
  var LAYOUTS = [
    { name: 'Single', cols: 1, rows: 1, f: gridFrames(1, 1) },
    { name: 'Side by side', cols: 2, rows: 1, f: gridFrames(2, 1) },
    { name: 'Stacked', cols: 1, rows: 2, f: gridFrames(1, 2) },
    { name: 'Quad', cols: 2, rows: 2, f: gridFrames(2, 2) },
    { name: '3 × 3', cols: 3, rows: 3, f: gridFrames(3, 3) },
    { name: '4 × 3', cols: 4, rows: 3, f: gridFrames(4, 3) },
    { name: 'Hero left', cols: 3, rows: 3, f: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]] },
    { name: 'Hero + column', cols: 4, rows: 3, f: [[0, 0, 3, 3], [3, 0, 1, 1], [3, 1, 1, 1], [3, 2, 1, 1]] },
    { name: 'Hero + strip', cols: 4, rows: 3, f: [[0, 0, 4, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1]] },
    { name: 'Two big', cols: 4, rows: 3, f: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1]] },
    { name: 'Banner + row', cols: 3, rows: 2, f: [[0, 0, 3, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] },
    { name: 'Mosaic', cols: 4, rows: 4, f: [[0, 0, 2, 2], [2, 0, 2, 1], [2, 1, 1, 1], [3, 1, 1, 1], [0, 2, 1, 2], [1, 2, 2, 1], [3, 2, 1, 2], [1, 3, 2, 1]] }
  ];
  function validFrames(L) {
    if (!L || !(L.cols >= 1 && L.cols <= 12 && L.rows >= 1 && L.rows <= 12) || !Array.isArray(L.f) || !L.f.length) return false;
    var boxes = L.f.map(function (f) { return { col: f[0], row: f[1], w: f[2], h: f[3] }; });
    for (var a = 0; a < boxes.length; a++) {
      var b = boxes[a];
      if (!(b.col >= 0 && b.row >= 0 && b.w >= 1 && b.h >= 1) || b.col + b.w > L.cols || b.row + b.h > L.rows) return false;
      for (var c = a + 1; c < boxes.length; c++) if (overlap(b, boxes[c])) return false;
    }
    return true;
  }
  function storeUserLayouts(a) {
    userLayoutsCache = a;
    return api.storeSet('layouts', a).then(function (ok) { if (!ok) toast('Could not save the layout. The data folder is not writable.'); return ok; });
  }
  function layoutThumb(L) {
    var cells = L.f.map(function (f) { return '<i style="grid-column:' + (f[0] + 1) + ' / span ' + f[2] + ';grid-row:' + (f[1] + 1) + ' / span ' + f[3] + '"></i>'; }).join('');
    return '<span class="lthumb" style="grid-template-columns:repeat(' + L.cols + ',1fr);grid-template-rows:repeat(' + L.rows + ',1fr)">' + cells + '</span>';
  }
  function applyLayout(L) {
    var frames = L.f.map(function (f) { return { col: f[0], row: f[1], w: f[2], h: f[3] }; });
    var m = [];
    for (var r = 0; r < L.rows; r++) m.push(new Array(L.cols).fill(false));
    frames.forEach(function (g) { mark(m, g, g.w, g.h); });
    var free = [];
    for (var y = 0; y < L.rows; y++) for (var x = 0; x < L.cols; x++) if (!m[y][x]) free.push({ col: x, row: y, w: 1, h: 1 });
    var capacity = frames.length + free.length;
    if (S.items.length > capacity) {
      toast('This layout has ' + capacity + ' cells but the wall has ' + S.items.length + ' tiles. Remove some tiles or pick a bigger layout.');
      return false;
    }
    pushHistory();
    var slots = frames.concat(free);
    S.items.slice().sort(readingOrder).forEach(function (it, i) { var g = slots[i]; it.col = g.col; it.row = g.row; it.w = g.w; it.h = g.h; });
    S.cols = L.cols; S.rows = L.rows;
    savePrefs(); render(); refreshInspector();
    return true;
  }
  function renderLayouts() {
    $('#lgrid').innerHTML = LAYOUTS.map(function (L, i) {
      return '<button class="lbtn" data-i="' + i + '" aria-label="Apply layout ' + esc(L.name) + '">' + layoutThumb(L) + '<span class="lname">' + esc(L.name) + '</span></button>';
    }).join('');
    var mine = userLayoutsCache;
    $('#ulist').innerHTML = mine.length ? mine.map(function (L, i) {
      return '<div class="prow" data-i="' + i + '">' + layoutThumb(L) + '<div class="pinfo"><div class="pname">' + esc(L.name) + '</div><div class="pmeta">' + L.cols + ' × ' + L.rows + ' · ' + L.f.length + ' frames</div></div>' +
        '<button class="btn" data-la="apply">Apply</button><button class="btn" data-la="del" aria-label="Delete layout ' + esc(L.name) + '">Delete</button></div>';
    }).join('') : '<p class="note">None yet. Arrange the wall the way you like, name it below and press Save current.</p>';
  }
  $('#lgrid').addEventListener('click', function (e) {
    var b = e.target.closest('.lbtn');
    if (b && applyLayout(LAYOUTS[+b.dataset.i])) closePops();
  });
  $('#ulist').addEventListener('click', function (e) {
    var b = e.target.closest('[data-la]');
    if (!b) return;
    var idx = +b.closest('.prow').dataset.i, L = userLayoutsCache[idx];
    if (!L) return;
    if (b.dataset.la === 'apply') { if (applyLayout(L)) closePops(); return; }
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = 'Sure?'; b.classList.add('warn');
      setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; b.classList.remove('warn'); } }, 3000);
      return;
    }
    var next = userLayoutsCache.slice(); next.splice(idx, 1);
    storeUserLayouts(next).then(renderLayouts);
  });
  $('#layoutForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#layoutName').value.trim().slice(0, 40);
    if (!name) { toast('Give the layout a name first.'); $('#layoutName').focus(); return; }
    if (!S.items.length) { toast('Place some tiles first. A layout is made from the current frames.'); return; }
    var L = { name: name, cols: S.cols, rows: S.rows, f: S.items.slice().sort(readingOrder).map(function (i) { return [i.col, i.row, i.w, i.h]; }) };
    var mine = userLayoutsCache.filter(function (x) { return x.name !== name; });
    mine.unshift(L);
    storeUserLayouts(mine.slice(0, 40)).then(function (ok) {
      if (!ok) return;
      $('#layoutName').value = ''; renderLayouts(); toast('Saved layout "' + name + '".');
    });
  });

  /* ---------- keeping the wall between runs ---------- */
  var sessionTimer = 0;
  function sessionRecord() { return currentRecord(''); }
  function sessionWorthSaving() { return !(S.items.length && S.items.every(function (i) { return i.sample; })); }
  function scheduleSession() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(function () { if (sessionWorthSaving()) api.storeSet('session', sessionRecord()); }, 700);
  }
  window.addEventListener('beforeunload', function () {
    clearTimeout(sessionTimer);
    if (sessionWorthSaving()) api.storeSetSync('session', sessionRecord());
  });

  /* ---------- sample test cards (shown on the very first start, until real media is added) ---------- */
  function sampleCard(n) {
    var c = document.createElement('canvas'); c.width = 960; c.height = 540;
    var x = c.getContext('2d'), W = 960, H = 540, i;
    if (n === 0) {
      var bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'], bw = W / 7;
      bars.forEach(function (col, k) { x.fillStyle = col; x.fillRect(k * bw, 0, bw + 1, 360); });
      ['#0000c8', '#101010', '#c800c8', '#101010', '#00c8c8', '#101010', '#c8c8c8'].forEach(function (col, k) { x.fillStyle = col; x.fillRect(k * bw, 360, bw + 1, 45); });
      var g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
      x.fillStyle = g; x.fillRect(0, 405, W, 135);
    } else if (n === 1) {
      x.fillStyle = '#1b2430'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#3a4a60'; x.lineWidth = 1;
      for (i = 0; i <= W; i += 60) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, H); x.stroke(); }
      for (i = 0; i <= H; i += 60) { x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(W, i + 0.5); x.stroke(); }
      x.strokeStyle = '#e6edf7'; x.lineWidth = 3;
      x.beginPath(); x.arc(W / 2, H / 2, 240, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(0, 0); x.lineTo(W, H); x.moveTo(W, 0); x.lineTo(0, H); x.stroke();
    } else if (n === 2) {
      for (i = 0; i < 11; i++) {
        var v = Math.round(i * 25.5); x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(i * (W / 11), 0, W / 11 + 1, H);
        x.fillStyle = v > 127 ? '#000' : '#fff'; x.font = '500 26px monospace'; x.fillText(String(i * 10), i * (W / 11) + 12, 60);
      }
    } else {
      var cols = ['#e29a24', '#2b6fb5', '#d9d9d9', '#1c1f26'];
      for (var yy = 0; yy < 9; yy++) for (var xx = 0; xx < 16; xx++) { x.fillStyle = cols[(xx + yy * 2) % 4]; x.fillRect(xx * 60, yy * 60, 60, 60); }
    }
    x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(16, H - 56, 340, 40);
    x.fillStyle = '#fff'; x.font = '500 22px monospace'; x.fillText('SAMPLE ' + (n + 1) + ' · 960 × 540', 28, H - 28);
    return c.toDataURL('image/png');
  }
  function addSamples() {
    [
      { name: 'Color bars', col: 0, row: 0, w: 2, h: 2 },
      { name: 'Crosshair grid', col: 2, row: 0, w: 2, h: 1 },
      { name: 'Gray ramp', col: 2, row: 1, w: 1, h: 1 },
      { name: 'Checker', col: 3, row: 1, w: 1, h: 1 }
    ].forEach(function (s, n) {
      S.items.push({ id: S.nid++, name: s.name, path: '', kind: 'image', url: sampleCard(n), col: s.col, row: s.row, w: s.w, h: s.h, fit: S.fit, muted: true, loop: true, sample: true, missing: false });
    });
  }

  /* ---------- start ---------- */
  async function boot() {
    var got = await Promise.all([api.storeGet('prefs'), api.storeGet('session'), api.storeGet('layouts'), api.displays(), api.windowInfo()]);
    winId = (got[4] && got[4].id) || 1;
    if (winId > 1) document.title = 'Media Wall · Wall ' + winId;
    render();
    applyPrefs(got[0]);
    applyPanel();
    userLayoutsCache = (Array.isArray(got[2]) ? got[2] : []).filter(function (L) { return L && typeof L.name === 'string' && validFrames(L); });
    var displays = Array.isArray(got[3]) ? got[3] : [];
    var sel = $('#display');
    displays.forEach(function (d) {
      var o = document.createElement('option'); o.value = String(d.id); o.textContent = d.label; sel.appendChild(o);
    });
    if (S.display != null && !displays.some(function (d) { return d.id === S.display; })) S.display = null;
    var rec = got[1] ? cleanRecord(got[1], false) : null;
    if (rec && (rec.items.length || (got[1] && Array.isArray(got[1].items)))) {
      var missing = await applyRecord(rec, rec.presetName);
      if (missing) toast(missing + (missing === 1 ? ' file from your last wall was' : ' files from your last wall were') + ' not found. Use Locate file on a tile.');
    } else {
      if (S.cols >= 4 && S.rows >= 2) addSamples();
      render(); refreshInspector();
    }
  }
  render();
  refreshInspector();
  boot();
})();
