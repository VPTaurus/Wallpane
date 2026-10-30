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

  function copy(b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }
  // Every tile inside the wall, at least MIN, and no two overlapping.
  function valid(geo, d) {
    var ks = Object.keys(geo);
    for (var a = 0; a < ks.length; a++) {
      var g = geo[ks[a]];
      if (g.w < MIN - 0.01 || g.h < MIN - 0.01 || !inside(g, d)) return false;
      for (var b = a + 1; b < ks.length; b++) if (ovl(g, geo[ks[b]])) return false;
    }
    return true;
  }

  // Put one tile where it is wanted. Tiles in the way slide aside (the way that needs the least movement); tiles they
  // touch slide too. Always computed from `base` (the layout at the start of the gesture), so dragging back puts tiles back.
  // opts.shrink: a tile pushed against the wall may get smaller (down to MIN) rather than block the move.
  // opts.keepSide: a tile only moves further to the side of the pushing tile it is on (by their centres), never over it
  // to the other side; when it cannot, there is no result (a drag then offers to swap).
  function resolve(ids, id, g, base, d, opts) {
    var shrink = !!(opts && opts.shrink), keepSide = !!(opts && opts.keepSide);
    if (g.w < MIN - 0.01 || g.h < MIN - 0.01 || !inside(g, d)) return null;
    var geo = {};
    ids.forEach(function (k) { if (base[k]) geo[k] = base[k]; });
    geo[id] = copy(g);
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
      // Each try with the side it puts the tile on: right of, left of, below or above the tile pushing it.
      var tries = [[{ x: f.x + f.w, y: v.y, w: v.w, h: v.h }, 'r'], [{ x: f.x - v.w, y: v.y, w: v.w, h: v.h }, 'l'],
        [{ x: v.x, y: f.y + f.h, w: v.w, h: v.h }, 'b'], [{ x: v.x, y: f.y - v.h, w: v.w, h: v.h }, 't']];
      if (shrink) {
        var x = f.x + f.w, y = f.y + f.h, x0 = Math.max(0, f.x - v.w), y0 = Math.max(0, f.y - v.h);
        tries.push([{ x: x, y: v.y, w: Math.min(v.w, d.W - x), h: v.h }, 'r'], [{ x: x0, y: v.y, w: f.x - x0, h: v.h }, 'l'],
          [{ x: v.x, y: y, w: v.w, h: Math.min(v.h, d.H - y) }, 'b'], [{ x: v.x, y: y0, w: v.w, h: f.y - y0 }, 't']);
      }
      var cx = v.x + v.w / 2 - (f.x + f.w / 2), cy = v.y + v.h / 2 - (f.y + f.h / 2);
      var onSide = { r: cx >= 0, l: cx <= 0, b: cy >= 0, t: cy <= 0 };
      tries.forEach(function (tr) {
        var box = tr[0];
        if (keepSide && !onSide[tr[1]]) return;
        if (box.w < MIN - 0.01 || box.h < MIN - 0.01 || !inside(box, d)) return;
        for (var k = 0; k < fixed.length; k++) if (ovl(box, geo[fixed[k]])) return;
        // Moving is preferred to shrinking.
        var cost = Math.abs(box.x - v.x) + Math.abs(box.y - v.y) + 3 * (v.w - box.w + v.h - box.h);
        if (cost < bd) { bd = cost; best = box; }
      });
      if (!best) return null;
      geo[victim] = best; isFixed[victim] = true; fixed.push(victim);
    }
    return null;
  }

  /* ---------- resizing pushes the tiles in the way ---------- */
  // The work is done for one direction only, pushing towards +x; the other three directions are turned into that one.
  function norm(b, axis, s, d) {
    var r = axis === 'x' ? copy(b) : { x: b.y, y: b.x, w: b.h, h: b.w };
    if (s < 0) r.x = (axis === 'x' ? d.W : d.H) - r.x - r.w;
    return r;
  }
  function denorm(r, axis, s, d) {
    var x = s < 0 ? (axis === 'x' ? d.W : d.H) - r.x - r.w : r.x;
    return axis === 'x' ? { x: x, y: r.y, w: r.w, h: r.h } : { x: r.y, y: x, w: r.h, h: r.w };
  }
  // One side of tile `id` moved out towards +x (after norm). Tiles that start beyond its old side and are in the way
  // move along; at the wall they are squeezed, the far ones first, down to MIN. If that is still not enough room, the
  // tile's side stops short. Changes geo; false when the tile would end up smaller than MIN.
  function pushAxis(geo, base, ids, id, g0, d, axis, s) {
    var L = axis === 'x' ? d.W : d.H;
    var A = norm(geo[id], axis, s, d), edge0 = norm(g0, axis, s, d);
    edge0 = edge0.x + edge0.w;
    function across(a, b) { return a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5; }
    var chain = ids.filter(function (k) { return String(k) !== String(id) && geo[k] && base[k] && norm(base[k], axis, s, d).x >= edge0 - 0.5; })
      .map(function (k) { return { k: k, b: norm(base[k], axis, s, d).x, t: norm(geo[k], axis, s, d) }; })
      .sort(function (p, q) { return p.b - q.b; });
    var i, j, c;
    for (i = 0; i < chain.length; i++) {                  // push forward
      c = chain[i];
      var req = across(A, c.t) ? A.x + A.w : -Infinity;
      for (j = 0; j < i; j++) if (chain[j].b < c.b && across(chain[j].t, c.t)) req = Math.max(req, chain[j].t.x + chain[j].t.w);
      if (c.t.x < req) c.t.x = req;
    }
    for (i = chain.length - 1; i >= 0; i--) {             // squeeze back from the wall
      c = chain[i];
      var lim = L;
      for (j = i + 1; j < chain.length; j++) if (chain[j].b > c.b && across(chain[j].t, c.t)) lim = Math.min(lim, chain[j].t.x);
      if (c.t.x + c.t.w > lim) {
        c.t.w = lim - c.t.x;
        if (c.t.w < MIN) { c.t.w = MIN; c.t.x = lim - MIN; }
      }
    }
    var limA = L;
    chain.forEach(function (c2) { if (across(A, c2.t)) limA = Math.min(limA, c2.t.x); });
    if (A.x + A.w > limA) A.w = limA - A.x;
    if (A.w < MIN - 0.01) return false;
    chain.forEach(function (c2) { geo[c2.k] = denorm(c2.t, axis, s, d); });
    geo[id] = denorm(A, axis, s, d);
    return true;
  }
  // The same move, with the tiles beyond the side shrinking evenly instead: the tiles in line with this tile (and the
  // ones in line with those) first slide into any free space before the wall, then they and the gaps between them
  // shrink in proportion, like panes behind a splitter. False when one of them would get smaller than MIN.
  function evenAxis(geo, base, ids, id, g0, d, axis, s) {
    var L = axis === 'x' ? d.W : d.H;
    var A = norm(geo[id], axis, s, d), e0 = norm(g0, axis, s, d);
    e0 = e0.x + e0.w;
    var E = A.x + A.w;
    if (E > L + 0.5) return false;
    function across(a, b) { return a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5; }
    // Beyond the side by where they were at the start; their place now (a corner drag has done the other axis).
    var cand = ids.filter(function (k) { return String(k) !== String(id) && geo[k] && base[k] && norm(base[k], axis, s, d).x >= e0 - 0.5; })
      .map(function (k) { return { k: k, t: norm(geo[k], axis, s, d) }; });
    var set = cand.filter(function (c) { return across(A, c.t); }), grew = true;
    while (grew) {
      grew = false;
      cand.forEach(function (c) {
        if (set.indexOf(c) < 0 && set.some(function (m) { return across(m.t, c.t); })) { set.push(c); grew = true; }
      });
    }
    var need = E - e0;
    if (!set.length || need <= 0) { geo[id] = denorm(A, axis, s, d); return true; }
    var maxR = Math.max.apply(null, set.map(function (c) { return c.t.x + c.t.w; }));
    var shift = Math.max(0, Math.min(need, L - maxR)), from = e0 + shift, k = (L - E) / (L - from);
    for (var i = 0; i < set.length; i++) {
      var t = set[i].t, x = t.x + shift;
      set[i].t = { x: E + (x - from) * k, y: t.y, w: t.w * k, h: t.h };
      if (set[i].t.w < MIN - 0.01) return false;
    }
    set.forEach(function (c) { geo[c.k] = denorm(c.t, axis, s, d); });
    geo[id] = denorm(A, axis, s, d);
    return true;
  }
  // Resize tile `id` from g0 (where the gesture started) towards g. The sides that move out push the tiles in their
  // way. mode 'even': those tiles shrink evenly (evenAxis); otherwise tiles that reach the wall get squeezed, the far
  // ones first (pushAxis). Returns the new layout by id (the tile may end up smaller than g when everything is
  // squeezed), or null.
  function pushResize(ids, id, g0, g, base, d, mode) {
    if (g.w < MIN - 0.01 || g.h < MIN - 0.01 || !inside(g, d)) return null;
    var geo = {};
    ids.forEach(function (k) { if (base[k]) geo[k] = copy(base[k]); });
    geo[id] = copy(g);
    var dirs = [];
    if (g.x + g.w > g0.x + g0.w + 0.01) dirs.push(['x', 1]);
    if (g.x < g0.x - 0.01) dirs.push(['x', -1]);
    if (g.y + g.h > g0.y + g0.h + 0.01) dirs.push(['y', 1]);
    if (g.y < g0.y - 0.01) dirs.push(['y', -1]);
    var push = mode === 'even' ? evenAxis : pushAxis;
    for (var i = 0; i < dirs.length; i++) if (!push(geo, base, ids, id, g0, d, dirs[i][0], dirs[i][1])) return null;
    if (valid(geo, d)) return geo;
    // An arrangement the pushes did not untangle (tiles beside, not in line): the general rule has a go.
    return resolve(ids, id, geo[id], geo, d, { shrink: true });
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

  /* ---------- exact shapes ---------- */
  // The tile shrunk to the shape of its media (ratio a = width / height), so the media fills it with no bars and
  // nothing cropped. It stays inside its old box, anchored at the top left. `gap` is the space drawn around each tile.
  function fitBox(g, a, gap) {
    gap = gap || 0;
    var vw = Math.max(1, g.w - gap), vh = Math.max(1, g.h - gap);
    if (vw / vh > a) vw = vh * a; else vh = vw / a;
    return { x: g.x, y: g.y, w: Math.max(MIN, vw + gap), h: Math.max(MIN, vh + gap) };
  }
  // Shift while resizing: the box the pointer asks for (g), reshaped to keep the proportions the tile had at the start
  // (g0). On a corner the side that moved more leads; on an edge the other side follows. The opposite sides stay put.
  function keepRatio(g0, g, edge, gap) {
    gap = gap || 0;
    var r = Math.max(1, g0.w - gap) / Math.max(1, g0.h - gap);
    var horiz = /[ew]/.test(edge), vert = /[ns]/.test(edge), w, h;
    if (horiz && (!vert || Math.abs(g.w / g0.w - 1) >= Math.abs(g.h / g0.h - 1))) { w = g.w; h = (w - gap) / r + gap; }
    else { h = g.h; w = (h - gap) * r + gap; }
    return { x: edge.indexOf('w') > -1 ? g0.x + g0.w - w : g0.x, y: edge.indexOf('n') > -1 ? g0.y + g0.h - h : g0.y, w: w, h: h };
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
    MIN: MIN, SNAP: SNAP, hasFree: hasFree, pxMap: pxMap, setPx: setPx, applyPx: applyPx, ovl: ovl, inside: inside, valid: valid, resolve: resolve, pushResize: pushResize,
    snapLines: snapLines, snapAxis: snapAxis, snapPos: snapPos, fitBox: fitBox, keepRatio: keepRatio, findGap: findGap, pitch: pitch, toFree: toFree, toGrid: toGrid
  };
});
