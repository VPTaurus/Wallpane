// Grid geometry. A tile covers cells: { col, row, w, h }. Everything here takes plain data and returns plain data.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).geo = factory();
})(this, function () {
  'use strict';

  function overlap(a, b) { return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h; }
  function emptyGrid(cols, rows) {
    var m = [];
    for (var r = 0; r < rows; r++) m.push(new Array(cols).fill(false));
    return m;
  }
  function mark(m, s, w, h) {
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (m[s.row + y] && m[s.row + y][s.col + x] !== undefined) m[s.row + y][s.col + x] = true;
  }
  function occupancy(items, cols, rows) {
    var m = emptyGrid(cols, rows);
    items.forEach(function (i) { mark(m, i, i.w, i.h); });
    return m;
  }
  // First spot (in reading order, starting at cell index `start` and wrapping) where a w by h block is free.
  function freeSpot(m, w, h, start, cols, rows) {
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
  // True when every tile (with the changes in `over`, keyed by id) is inside the grid and none overlap.
  function validLayout(items, cols, rows, over) {
    over = over || {};
    var boxes = items.map(function (i) { return over[i.id] || i; });
    for (var a = 0; a < boxes.length; a++) {
      var b = boxes[a];
      if (b.col < 0 || b.row < 0 || b.w < 1 || b.h < 1 || b.col + b.w > cols || b.row + b.h > rows) return false;
      for (var c = a + 1; c < boxes.length; c++) if (overlap(b, boxes[c])) return false;
    }
    return true;
  }
  // Packs all tiles from the top left in reading order. Tiles that do not fit at their size become one cell.
  function arrange(items, cols, rows) {
    var m = emptyGrid(cols, rows), out = {};
    var order = items.slice().sort(function (a, b) { return a.row - b.row || a.col - b.col; });
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
  function itemAt(items, col, row, skipId) {
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      if (t.id !== skipId && col >= t.col && col < t.col + t.w && row >= t.row && row < t.row + t.h) return t;
    }
    return null;
  }
  function geoMap(items) {
    var m = {};
    items.forEach(function (i) { m[i.id] = { col: i.col, row: i.row, w: i.w, h: i.h }; });
    return m;
  }
  function applyGeo(items, geo) {
    items.forEach(function (i) { var g = geo[i.id]; if (g) { i.col = g.col; i.row = g.row; i.w = g.w; i.h = g.h; } });
  }
  function nearestSpot(v, blockers, cols, rows) {
    var best = null, bd = 1e9;
    for (var r = 0; r + v.h <= rows; r++) for (var c = 0; c + v.w <= cols; c++) {
      var box = { col: c, row: r, w: v.w, h: v.h }, ok = true;
      for (var k = 0; k < blockers.length; k++) if (overlap(box, blockers[k])) { ok = false; break; }
      if (!ok) continue;
      var d = Math.abs(c - v.col) + Math.abs(r - v.row);
      if (d < bd) { bd = d; best = box; }
    }
    return best;
  }
  /* Push-aside placement: put one tile where it is wanted, and every tile it lands on makes room by moving
     to the nearest free spot (or, if the wall is packed, by bumping another tile, or shrinking to one cell).
     `base` is the layout to start from (by id); returns the new layout by id, or null when there is no room.
     noShrink: tiles in the way may move but not shrink. */
  function resolve(items, id, g, base, cols, rows, noShrink) {
    if (g.col < 0 || g.row < 0 || g.w < 1 || g.h < 1 || g.col + g.w > cols || g.row + g.h > rows) return null;
    var geo = {}, src = base || geoMap(items);
    Object.keys(src).forEach(function (k) { geo[k] = src[k]; });
    geo[id] = { col: g.col, row: g.row, w: g.w, h: g.h };
    var fixed = {}; fixed[id] = true;
    for (var guard = 0; guard < 400; guard++) {
      var victim = null, fixedIds = Object.keys(fixed);
      for (var i = 0; i < items.length && !victim; i++) {
        var t = items[i];
        if (fixed[t.id]) continue;
        for (var f = 0; f < fixedIds.length; f++) if (overlap(geo[t.id], geo[fixedIds[f]])) { victim = t; break; }
      }
      if (!victim) return geo;
      var v = geo[victim.id];
      var everyone = items.filter(function (x) { return x.id !== victim.id; }).map(function (x) { return geo[x.id]; });
      var fixedBoxes = fixedIds.map(function (k) { return geo[k]; });
      var one = { col: v.col, row: v.row, w: 1, h: 1 };
      var spot = nearestSpot(v, everyone, cols, rows) || nearestSpot(v, fixedBoxes, cols, rows) ||
        (noShrink ? null : nearestSpot(one, everyone, cols, rows) || nearestSpot(one, fixedBoxes, cols, rows));
      if (!spot) return null;
      geo[victim.id] = spot; fixed[victim.id] = true;
    }
    return null;
  }
  // Like resolve, but empty tiles (kind 'empty') give way when there is no other room: a tile may take their cells,
  // and the empty tiles it covers go. In order: tiles move aside; else empty tiles give way; only then do tiles in
  // the way shrink. Returns { geo, removed: [ids of empty tiles that go] } or null.
  function resolveYield(items, id, g, base, cols, rows) {
    var solid = items.filter(function (i) { return i.kind !== 'empty' || i.id === id; });
    var tries = [[items, true], [solid, true], [items, false], [solid, false]];
    var geo = null, used = null;
    for (var t = 0; t < tries.length && !geo; t++) {
      if (t % 2 && solid.length === items.length) continue;   // no empty tiles: nothing to give way
      geo = resolve(tries[t][0], id, g, base, cols, rows, tries[t][1]);
      used = tries[t][0];
    }
    if (!geo) return null;
    if (used === items) return { geo: geo, removed: [] };
    var src = base || geoMap(items), removed = [];
    items.forEach(function (i) {
      if (i.kind !== 'empty' || i.id === id) return;
      var box = src[i.id];
      if (solid.some(function (s) { return overlap(geo[s.id], box); })) removed.push(i.id);
      else geo[i.id] = box;
    });
    return { geo: geo, removed: removed };
  }
  // A new grid size: tiles that still fit stay where they are; the others move to the first free spot
  // (as one cell if needed). Tiles with no room at all are listed in `dropped`.
  function shrinkTo(items, cols, rows) {
    var geo = {}, dropped = [], mm = emptyGrid(cols, rows), outside = [];
    items.forEach(function (i) {
      if (i.col + i.w <= cols && i.row + i.h <= rows) { geo[i.id] = { col: i.col, row: i.row, w: i.w, h: i.h }; mark(mm, i, i.w, i.h); }
      else outside.push(i);
    });
    outside.sort(function (a, b) { return a.row - b.row || a.col - b.col; }).forEach(function (i) {
      var w = Math.min(i.w, cols), h = Math.min(i.h, rows);
      var sp = freeSpot(mm, w, h, 0, cols, rows);
      if (!sp) { w = 1; h = 1; sp = freeSpot(mm, 1, 1, 0, cols, rows); }
      if (!sp) { dropped.push(i.id); return; }
      mark(mm, sp, w, h);
      geo[i.id] = { col: sp.col, row: sp.row, w: w, h: h };
    });
    return { geo: geo, dropped: dropped };
  }

  /* ---------- layouts: frames only ([col, row, w, h] each), no media ---------- */
  function gridFrames(c, r) { var f = []; for (var y = 0; y < r; y++) for (var x = 0; x < c; x++) f.push([x, y, 1, 1]); return f; }
  function validFrames(L) {
    if (!L || !(Number.isInteger(L.cols) && Number.isInteger(L.rows) && L.cols >= 1 && L.cols <= 12 && L.rows >= 1 && L.rows <= 12) || !Array.isArray(L.f) || !L.f.length) return false;
    if (!L.f.every(function (f) { return Array.isArray(f) && f.length === 4 && f.every(Number.isInteger); })) return false;
    var boxes = L.f.map(function (f) { return { col: f[0], row: f[1], w: f[2], h: f[3] }; });
    for (var a = 0; a < boxes.length; a++) {
      var b = boxes[a];
      if (!(b.col >= 0 && b.row >= 0 && b.w >= 1 && b.h >= 1) || b.col + b.w > L.cols || b.row + b.h > L.rows) return false;
      for (var c = a + 1; c < boxes.length; c++) if (overlap(b, boxes[c])) return false;
    }
    return true;
  }
  // Every place a tile can go in a layout: its frames first, then any cells the frames leave empty.
  function layoutSlots(L) {
    var frames = L.f.map(function (f) { return { col: f[0], row: f[1], w: f[2], h: f[3] }; });
    var m = emptyGrid(L.cols, L.rows);
    frames.forEach(function (g) { mark(m, g, g.w, g.h); });
    for (var y = 0; y < L.rows; y++) for (var x = 0; x < L.cols; x++) if (!m[y][x]) frames.push({ col: x, row: y, w: 1, h: 1 });
    return frames;
  }

  /* ---------- rows (or columns) with their own number of tiles ---------- */
  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }
  // counts: tiles in each line, e.g. [3, 4] is 3 tiles in the first row and 4 in the second; dir 'rows' or 'cols'.
  // On a grid the lines need a common number of cells (the least common multiple: 12 for 3 and 4), at most 12.
  // Returns { grid, cols, rows, frames: [{ col, row, w, h }], boxes: [{ fx, fy, fw, fh }] }: frames for the grid,
  // boxes (fractions of the wall) for Free layout, both in reading order.
  function linesLayout(counts, dir) {
    var n = counts.length, m = counts.reduce(lcm, 1), byRows = dir !== 'cols';
    var out = { grid: m <= 12 && n <= 12, cols: byRows ? m : n, rows: byRows ? n : m, frames: [], boxes: [] };
    counts.forEach(function (k, i) {
      var span = m / k;
      for (var j = 0; j < k; j++) {
        if (byRows) { out.frames.push({ col: j * span, row: i, w: span, h: 1 }); out.boxes.push({ fx: j / k, fy: i / n, fw: 1 / k, fh: 1 / n }); }
        else { out.frames.push({ col: i, row: j * span, w: 1, h: span }); out.boxes.push({ fx: i / n, fy: j / k, fw: 1 / n, fh: 1 / k }); }
      }
    });
    if (!byRows) {                                       // reading order: top to bottom, then left to right
      var order = out.frames.map(function (f, i) { return i; }).sort(function (a, b) {
        return out.boxes[a].fy - out.boxes[b].fy || out.boxes[a].fx - out.boxes[b].fx;
      });
      out.frames = order.map(function (i) { return out.frames[i]; });
      out.boxes = order.map(function (i) { return out.boxes[i]; });
    }
    return out;
  }

  return {
    linesLayout: linesLayout, lcm: lcm,
    overlap: overlap, emptyGrid: emptyGrid, mark: mark, occupancy: occupancy, freeSpot: freeSpot, validLayout: validLayout,
    arrange: arrange, itemAt: itemAt, geoMap: geoMap, applyGeo: applyGeo, nearestSpot: nearestSpot, resolve: resolve, resolveYield: resolveYield, shrinkTo: shrinkTo,
    gridFrames: gridFrames, validFrames: validFrames, layoutSlots: layoutSlots
  };
});
