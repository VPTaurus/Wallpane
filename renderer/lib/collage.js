// Fill the wall: every tile keeps its media's shape and together they fill the wall edge to edge, in rows (or
// columns), like a photo collage. Pure arithmetic in pixels. A box includes the gap, as in free layout: the media
// shows in the box minus the gap, so a box w x h fits media of shape a when (w - gap) / (h - gap) = a.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).collage = factory();
})(this, function () {
  'use strict';
  var MAX_ROWS = 12;

  // The height a row of tiles i..j-1 needs to fill the width W exactly, every tile keeping its shape.
  function rowHeight(pre, i, j, W, gap) {
    return gap + Math.max(1, W - (j - i) * gap) / (pre[j] - pre[i]);
  }
  // Split the shapes, in order, into r rows whose heights are as close as possible to H / r each.
  function partition(asp, r, W, H, gap) {
    var n = asp.length, target = H / r, pre = [0], i, j, k;
    for (i = 0; i < n; i++) pre.push(pre[i] + asp[i]);
    var best = [], from = [];
    for (k = 0; k <= r; k++) { best.push(new Array(n + 1).fill(Infinity)); from.push(new Array(n + 1).fill(-1)); }
    best[0][0] = 0;
    for (k = 1; k <= r; k++) {
      for (j = k; j <= n - (r - k); j++) {
        for (i = k - 1; i < j; i++) {
          if (best[k - 1][i] === Infinity) continue;
          var l = Math.log(rowHeight(pre, i, j, W, gap) / target), c = best[k - 1][i] + l * l;
          if (c < best[k][j]) { best[k][j] = c; from[k][j] = i; }
        }
      }
    }
    var cuts = [];
    for (k = r, j = n; k > 0; k--) { i = from[k][j]; cuts.unshift([i, j]); j = i; }
    return { cuts: cuts, pre: pre };
  }
  // How good a split into rows is: rowOf[i] is tile i's row. s is how much the rows must stretch together to fill the
  // height (1 = a perfect fit; otherwise every tile is cropped by the same amount); spread is how unequal the rows are.
  function judge(asp, rowOf, r, W, H, gap) {
    var sum = new Array(r).fill(0), cnt = new Array(r).fill(0), i;
    for (i = 0; i < asp.length; i++) { sum[rowOf[i]] += asp[i]; cnt[rowOf[i]]++; }
    var hs = [], total = 0;
    for (i = 0; i < r; i++) { if (!cnt[i]) return null; hs.push(gap + Math.max(1, W - cnt[i] * gap) / sum[i]); total += hs[i]; }
    var s = H / total, spread = 0;
    for (i = 0; i < r; i++) spread += Math.abs(Math.log(hs[i] * r / total));
    spread /= r;
    return { s: s, hs: hs, spread: spread, score: Math.abs(Math.log(s)) + 0.25 * spread };
  }
  // Better rows by moving single tiles to other rows and swapping pairs, keeping each change that helps. rnd is a
  // seeded generator, so the same wall always gets the same answer.
  function improve(asp, rowOf, r, W, H, gap, rnd) {
    var n = asp.length, best = judge(asp, rowOf, r, W, H, gap), cur = rowOf.slice();
    if (r < 2 || n < 3) return { rowOf: cur, j: best };
    for (var step = 0; step < 3000; step++) {
      var next = cur.slice(), i = Math.floor(rnd() * n);
      if (rnd() < 0.5) next[i] = (next[i] + 1 + Math.floor(rnd() * (r - 1))) % r;
      else { var k = Math.floor(rnd() * n), t = next[i]; next[i] = next[k]; next[k] = t; }
      var j = judge(asp, next, r, W, H, gap);
      if (j && j.score < best.score - 1e-12) { best = j; cur = next; }
    }
    return { rowOf: cur, j: best };
  }
  // Boxes for a split into rows. Rows go in the order of their first tile, tiles in each row in their own order, so
  // the reading order is kept as far as the split allows. Each row fills the width exactly, then all rows stretch
  // together to fill the height.
  function layout(asp, rowOf, r, j, W) {
    var rows = [], i;
    for (i = 0; i < r; i++) rows.push([]);
    for (i = 0; i < asp.length; i++) rows[rowOf[i]].push(i);
    var order = rows.map(function (m, k) { return k; }).sort(function (p, q) { return rows[p][0] - rows[q][0]; });
    var boxes = new Array(asp.length), y = 0, gap = j.gap;
    order.forEach(function (k) {
      var h = j.hs[k], x = 0, m = rows[k];
      m.forEach(function (idx, pos) {
        var w = pos === m.length - 1 ? W - x : asp[idx] * (h - gap) + gap;   // the last one closes the row exactly
        boxes[idx] = { x: x, y: y, w: w, h: h * j.s };
        x += w;
      });
      y += h * j.s;
    });
    return boxes;
  }
  // The best collage for these media shapes (width / height, in reading order) on a W x H wall: rows or columns, the
  // number that crops least, with rows of similar height. Reading order is kept unless regrouping the tiles crops
  // clearly less. Returns { boxes (by tile), rows, cols, crop (the share each tile loses, 0.03 = 3 %), reordered }.
  function fill(asp, W, H, gap) {
    var n = asp.length, inOrder = null, any = null, seed = 12345;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    if (!n) return { boxes: [], rows: 0, cols: false, crop: 0, reordered: false };
    [false, true].forEach(function (cols) {
      var a = cols ? asp.map(function (x) { return 1 / x; }) : asp, w = cols ? H : W, h = cols ? W : H;
      for (var r = 1; r <= Math.min(n, MAX_ROWS); r++) {
        var cuts = partition(a, r, w, h, gap).cuts, rowOf = new Array(n);
        cuts.forEach(function (c, k) { for (var i = c[0]; i < c[1]; i++) rowOf[i] = k; });
        var j0 = judge(a, rowOf, r, w, h, gap), better = improve(a, rowOf, r, w, h, gap, rnd);
        [[j0, rowOf, false], [better.j, better.rowOf, true]].forEach(function (c) {
          var cand = { j: c[0], rowOf: c[1], r: r, cols: cols, a: a, w: w, h: h };
          if (!c[2] && (!inOrder || cand.j.score < inOrder.j.score - 1e-9)) inOrder = cand;
          if (!any || cand.j.score < any.j.score - 1e-9) any = cand;
        });
      }
    });
    function crop(c) { return 1 - Math.min(c.j.s, 1 / c.j.s); }
    var pick = crop(inOrder) <= Math.max(0.02, crop(any) + 0.01) ? inOrder : any;
    pick.j.gap = gap;
    var boxes = layout(pick.a, pick.rowOf, pick.r, pick.j, pick.w);
    if (pick.cols) boxes = boxes.map(function (b) { return { x: b.y, y: b.x, w: b.h, h: b.w }; });
    return { boxes: boxes, rows: pick.r, cols: pick.cols, crop: crop(pick), reordered: pick !== inOrder };
  }

  return { MAX_ROWS: MAX_ROWS, fill: fill, partition: partition };
});
