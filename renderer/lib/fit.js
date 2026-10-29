// Fit to media: choose tile shapes, and which media goes in which tile, so the media covers as much of the wall
// as possible (as few bars as possible). It tries many random ways to cut the grid into tiles and keeps the best.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).fit = factory();
})(this, function () {
  'use strict';

  // Share of a tile with shape ratio r that media with ratio a covers when shown whole.
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
  // Random guillotine partition of a w by h block of cells into exactly k rectangles (k must not exceed w * h).
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
  function shapeRatio(g, px, py, gap) { return Math.max(1, g.w * px - gap) / Math.max(1, g.h * py - gap); }
  // Share of the tile area that shows media; rects[j] holds media assign[j] (identity when assign is left out).
  function coverage(rects, assign, asp, px, py, gap) {
    var sum = 0, area = 0;
    rects.forEach(function (g, j) { sum += g.w * g.h * fitFrac(shapeRatio(g, px, py, gap), asp[assign ? assign[j] : j]); area += g.w * g.h; });
    return area ? sum / area : 0;
  }

  /* o: { cols, rows, asp: [ratio of each media], px, py (cell pitch in pixels), gap, tries, budgetMs, now, seed }.
     Stops after `tries` layouts or once `budgetMs` has passed, whichever comes first, so a big wall never freezes the page.
     Returns { rects, assign, score, tried }: media assign[j] goes into rects[j]. */
  function plan(o) {
    var asp = o.asp, N = asp.length, gap = o.gap || 0, px = o.px, py = o.py;
    var now = o.now || Date.now, budget = o.budgetMs === undefined ? 250 : o.budgetMs;
    function ratio(g) { return shapeRatio(g, px, py, gap); }
    var order = asp.map(function (a, n) { return n; }).sort(function (x, y) { return asp[x] - asp[y]; });
    // Widest media to widest tile, then swap pairs while that helps.
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
    var rnd = seededRandom(o.seed || 7), best = null, bestScore = -1, tries = N === 1 ? 1 : (o.tries || 9000), t0 = now(), n;
    for (n = 0; n < tries; n++) {
      if (n > 0 && now() - t0 > budget) break;
      var rects = [];
      randomPartition(0, 0, o.cols, o.rows, N, rnd, rects);
      var as = assignTo(rects), sc = coverage(rects, as, asp, px, py, gap);
      if (sc > bestScore) { bestScore = sc; best = { rects: rects, assign: as }; }
    }
    if (N === o.cols * o.rows) {            // a plain grid is one of the options too
      var plain = [];
      for (var yy = 0; yy < o.rows; yy++) for (var xx = 0; xx < o.cols; xx++) plain.push({ col: xx, row: yy, w: 1, h: 1 });
      var pa = assignTo(plain), ps = coverage(plain, pa, asp, px, py, gap);
      if (ps > bestScore) { bestScore = ps; best = { rects: plain, assign: pa }; }
    }
    return { rects: best.rects, assign: best.assign, score: bestScore, tried: n };
  }

  return { fitFrac: fitFrac, seededRandom: seededRandom, randomPartition: randomPartition, coverage: coverage, plan: plan };
});
