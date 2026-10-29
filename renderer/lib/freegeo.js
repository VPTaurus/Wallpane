// Free layout geometry, in pixels of the wall: { x, y, w, h }. Tiles store their place as fractions of the wall
// (fx, fy, fw, fh), so a free layout scales with the window. `d` is the wall size: { W, H }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geometry'));
  else (root.MW = root.MW || {}).free = factory(root.MW.geo);
})(this, function (G) {
  'use strict';
  var MIN = 24, SNAP = 6;

  function hasFree(i) { return i.fx !== undefined && i.fx !== null; }
  function pxMap(items, d) {
    var g = {};
    items.forEach(function (i) {
      if (!hasFree(i)) return;
      g[i.id] = { x: i.fx * d.W, y: i.fy * d.H, w: i.fw * d.W, h: i.fh * d.H };
    });
    return g;
  }
  function setPx(it, r, d) { it.fx = r.x / d.W; it.fy = r.y / d.H; it.fw = r.w / d.W; it.fh = r.h / d.H; }
  function applyPx(items, g, d) {
    if (!(d.W > 0 && d.H > 0)) return;
    items.forEach(function (i) { var r = g[i.id]; if (r) setPx(i, r, d); });
  }
  function ovl(a, b) { return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5; }
  function inside(box, d) { return !(box.x < -0.5 || box.y < -0.5 || box.x + box.w > d.W + 0.5 || box.y + box.h > d.H + 0.5); }

  // Put one tile where it is wanted. Tiles in the way slide aside (the way that needs the least movement); tiles they
  // touch slide too. Always computed from `base` (the layout at the start of the gesture), so dragging back puts tiles back.
  function resolve(ids, id, g, base, d) {
    if (g.w < MIN - 0.01 || g.h < MIN - 0.01 || !inside(g, d)) return null;
    var geo = {};
    ids.forEach(function (k) { if (base[k]) geo[k] = base[k]; });
    geo[id] = { x: g.x, y: g.y, w: g.w, h: g.h };
    var fixed = [id], isFixed = {};
    isFixed[id] = true;
    for (var guard = 0; guard < 400; guard++) {
      var victim = null, by = null;
      for (var a = 0; a < ids.length && victim === null; a++) {
        var t = ids[a];
        if (isFixed[t] || !geo[t]) continue;
        for (var b = 0; b < fixed.length; b++) if (ovl(geo[t], geo[fixed[b]])) { victim = t; by = fixed[b]; break; }
      }
      if (victim === null) return geo;
      var v = geo[victim], f = geo[by], best = null, bd = 1e12;
      [{ x: f.x + f.w, y: v.y }, { x: f.x - v.w, y: v.y }, { x: v.x, y: f.y + f.h }, { x: v.x, y: f.y - v.h }].forEach(function (c) {
        var box = { x: c.x, y: c.y, w: v.w, h: v.h };
        if (!inside(box, d)) return;
        for (var k = 0; k < fixed.length; k++) if (ovl(box, geo[fixed[k]])) return;
        var dist = Math.abs(c.x - v.x) + Math.abs(c.y - v.y);
        if (dist < bd) { bd = dist; best = box; }
      });
      if (!best) return null;
      geo[victim] = best; isFixed[victim] = true; fixed.push(victim);
    }
    return null;
  }

  /* ---------- snapping ---------- */
  function snapLines(base, skipId, d) {
    var X = [0, d.W], Y = [0, d.H];
    Object.keys(base).forEach(function (k) {
      if (String(k) === String(skipId)) return;
      var r = base[k];
      X.push(r.x, r.x + r.w); Y.push(r.y, r.y + r.h);
    });
    return { X: X, Y: Y };
  }
  // How far to move so that the near edge or the far edge lands on a line, if one is within a few pixels.
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

  // The first gap that fits a new tile (a third, a quarter or a sixth of the wall), or null.
  function findGap(geo, d) {
    var ids = Object.keys(geo), sizes = [[1 / 3, 1 / 3], [1 / 4, 1 / 4], [1 / 6, 1 / 6]];
    for (var si = 0; si < sizes.length; si++) {
      var w = d.W * sizes[si][0], h = d.H * sizes[si][1];
      for (var y = 0; y + h <= d.H + 0.5; y += Math.max(8, h / 6)) for (var x = 0; x + w <= d.W + 0.5; x += Math.max(8, w / 6)) {
        var box = { x: x, y: y, w: w, h: h }, free = true;
        for (var k = 0; k < ids.length; k++) if (ovl(box, geo[ids[k]])) { free = false; break; }
        if (free) return box;
      }
    }
    return null;
  }

  /* ---------- switching between grid and free ---------- */
  // Distance from one cell to the next, in pixels.
  function pitch(cols, rows, gap, d) {
    return { px: (d.W - 2 * gap - gap * (cols - 1)) / cols + gap, py: (d.H - 2 * gap - gap * (rows - 1)) / rows + gap };
  }
  // Grid to free keeps every tile exactly where it is on screen.
  function toFree(items, cols, rows, gap, d, onlyMissing) {
    if (!(d.W > 0 && d.H > 0)) return;
    var p = pitch(cols, rows, gap, d);
    items.forEach(function (i) {
      if (onlyMissing && hasFree(i)) return;
      i.fx = (gap + i.col * p.px - gap / 2) / d.W; i.fy = (gap + i.row * p.py - gap / 2) / d.H;
      i.fw = (i.w * p.px) / d.W; i.fh = (i.h * p.py) / d.H;
    });
  }
  // Free to grid snaps each tile to the nearest cells; tiles that would collide move to the nearest free spot.
  // Returns the ids of tiles that found no room at all (the caller removes them).
  function toGrid(items, cols, rows, gap, d) {
    var p = pitch(cols, rows, gap, d), mm = G.emptyGrid(cols, rows), dropped = [];
    function lim(v, a, b) { return Math.min(Math.max(v, a), b); }
    items.slice().sort(function (a, b) { return ((a.fy || 0) - (b.fy || 0)) || ((a.fx || 0) - (b.fx || 0)); }).forEach(function (it) {
      var w, h, col, row;
      if (hasFree(it)) {
        w = lim(Math.round(it.fw * d.W / p.px) || 1, 1, cols); h = lim(Math.round(it.fh * d.H / p.py) || 1, 1, rows);
        col = lim(Math.round((it.fx * d.W + gap / 2 - gap) / p.px) || 0, 0, cols - w);
        row = lim(Math.round((it.fy * d.H + gap / 2 - gap) / p.py) || 0, 0, rows - h);
      } else {                              // no free place stored: aim for the cells it had on the grid
        w = lim(it.w | 0 || 1, 1, cols); h = lim(it.h | 0 || 1, 1, rows);
        col = lim(it.col | 0, 0, cols - w); row = lim(it.row | 0, 0, rows - h);
      }
      var free = true, y, x;
      for (y = 0; y < h && free; y++) for (x = 0; x < w; x++) if (mm[row + y][col + x]) { free = false; break; }
      if (!free) {
        var sp = G.freeSpot(mm, w, h, row * cols + col, cols, rows);
        if (!sp) { w = 1; h = 1; sp = G.freeSpot(mm, 1, 1, row * cols + col, cols, rows); }
        if (!sp) { dropped.push(it.id); return; }
        col = sp.col; row = sp.row;
      }
      G.mark(mm, { col: col, row: row }, w, h);
      it.col = col; it.row = row; it.w = w; it.h = h;
    });
    return dropped;
  }

  return {
    MIN: MIN, SNAP: SNAP, hasFree: hasFree, pxMap: pxMap, setPx: setPx, applyPx: applyPx, ovl: ovl, inside: inside, resolve: resolve,
    snapLines: snapLines, snapAxis: snapAxis, snapPos: snapPos, findGap: findGap, pitch: pitch, toFree: toFree, toGrid: toGrid
  };
});
