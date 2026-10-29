'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../renderer/lib/freegeo');
const G = require('../../renderer/lib/geometry');
const V = require('../../renderer/lib/view');

const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const d = { W: 600, H: 200 };
// A | B | C side by side, filling a 600 px wide row.
const row = () => ({ A: { x: 0, y: 0, w: 200, h: 200 }, B: { x: 200, y: 0, w: 200, h: 200 }, C: { x: 400, y: 0, w: 200, h: 200 } });

test('resizing pushes the next tiles, then squeezes them against the wall', () => {
  const base = row(), ids = ['A', 'B', 'C'];
  const r1 = F.pushResize(ids, 'A', base.A, { x: 0, y: 0, w: 260, h: 200 }, base, d);
  assert.deepEqual([r1.A.w, r1.B.x, r1.B.w, r1.C.x, r1.C.w], [260, 260, 200, 460, 140], 'B moves, C is squeezed at the wall');
  assert.ok(F.valid(r1, d));
  const r2 = F.pushResize(ids, 'A', base.A, { x: 0, y: 0, w: 580, h: 200 }, base, d);
  assert.ok(F.valid(r2, d));
  assert.equal(r2.C.w, F.MIN);
  assert.equal(r2.B.w, F.MIN);
  assert.equal(r2.A.w, 600 - 2 * F.MIN, 'the tile stops once everything else is as small as it gets');
});

test('resizing to the left and downwards pushes the same way', () => {
  const base = row(), ids = ['A', 'B', 'C'];
  const left = F.pushResize(ids, 'C', base.C, { x: 300, y: 0, w: 300, h: 200 }, base, d);
  assert.deepEqual([left.B.x, left.B.w, left.A.x, left.A.w], [100, 200, 0, 100]);
  const tall = { W: 200, H: 600 }, col = { A: { x: 0, y: 0, w: 200, h: 300 }, B: { x: 0, y: 300, w: 200, h: 300 } };
  const down = F.pushResize(['A', 'B'], 'A', col.A, { x: 0, y: 0, w: 200, h: 450 }, col, tall);
  assert.deepEqual([down.B.y, down.B.h], [450, 150]);
});

test('tiles that are not in the way stay put', () => {
  const base = { A: { x: 0, y: 0, w: 200, h: 100 }, B: { x: 200, y: 0, w: 200, h: 100 }, D: { x: 200, y: 100, w: 200, h: 100 } };
  const r = F.pushResize(['A', 'B', 'D'], 'A', base.A, { x: 0, y: 0, w: 300, h: 100 }, base, d);
  assert.deepEqual(r.D, base.D);
  assert.equal(r.B.x, 300);
});

test('moving with shrink allowed squeezes a tile against the wall instead of failing', () => {
  const base = { A: { x: 0, y: 0, w: 100, h: 200 }, B: { x: 300, y: 0, w: 300, h: 200 } };
  const want = { x: 250, y: 0, w: 100, h: 200 };
  assert.equal(F.resolve(['A', 'B'], 'A', want, base, d), null, 'B fits neither left nor right at its size');
  const r = F.resolve(['A', 'B'], 'A', want, base, d, { shrink: true });
  assert.ok(r && F.valid(r, d));
  assert.deepEqual([r.B.x, r.B.w], [350, 250]);
});

test('rows with their own number of tiles', () => {
  const g = G.linesLayout([3, 4], 'rows');
  assert.equal(g.grid, true);
  assert.deepEqual([g.cols, g.rows, g.frames.length], [12, 2, 7]);
  assert.deepEqual(g.frames[0], { col: 0, row: 0, w: 4, h: 1 });
  assert.deepEqual(g.frames[3], { col: 0, row: 1, w: 3, h: 1 });
  assert.equal(G.validLayout(g.frames.map((f, i) => Object.assign({ id: i }, f)), g.cols, g.rows), true);
  const odd = G.linesLayout([5, 3], 'rows');
  assert.equal(odd.grid, false, '5 and 3 do not share a grid of 12 or fewer columns');
  assert.ok(near(odd.boxes[5].fw, 1 / 3));
  const cols = G.linesLayout([2, 1], 'cols');
  assert.deepEqual([cols.cols, cols.rows], [2, 2]);
  assert.deepEqual(cols.frames, [{ col: 0, row: 0, w: 1, h: 1 }, { col: 1, row: 0, w: 1, h: 2 }, { col: 0, row: 1, w: 1, h: 1 }], 'reading order');
});

test('zooming keeps the point under the pointer still', () => {
  const W = 400, H = 300, c = V.content(W, H, 16 / 9, 'cover');
  assert.ok(near(c.w, 533.33) && near(c.h, 300));
  const v0 = { mx: 0.5, my: 0.5, zoom: 1 }, px = 100, py = 80;
  const u = (px - v0.mx * W) / v0.zoom + v0.mx * c.w, w = (py - v0.my * H) / v0.zoom + v0.my * c.h;
  const v1 = V.zoomAt(v0, W, H, c, 2, px, py);
  assert.equal(v1.zoom, 2);
  assert.ok(near(V.screenAt(v1.mx, 2, W, c.w, u), px));
  assert.ok(near(V.screenAt(v1.my, 2, H, c.h, w), py));
  assert.equal(V.zoomAt(v0, W, H, c, 20, px, py).zoom, V.MAXZ);
  assert.deepEqual(V.zoomAt(v1, W, H, c, 0.5, px, py), { mx: v1.mx, my: v1.my, zoom: 1 }, 'never below 1');
});

test('panning moves the media with the pointer, and stops at its edges', () => {
  const W = 400, H = 300, c = V.content(W, H, 16 / 9, 'cover');
  const v = { mx: 0.5, my: 0.5, zoom: 1 };
  const moved = V.pan(v, W, H, c, 40, 30);
  assert.ok(near(V.screenAt(moved.mx, 1, W, c.w, 266.67) - V.screenAt(0.5, 1, W, c.w, 266.67), 40, 0.05), 'the grabbed point follows');
  assert.equal(moved.my, 0.5, 'nothing to reveal vertically at zoom 1');
  assert.equal(V.pan(v, W, H, c, 5000, 0).mx, 0, 'stops at the edge');
  assert.deepEqual(V.css({ mx: 0.25, my: 0.5, zoom: 2 }), { objectPosition: '25.00% 50.00%', transformOrigin: '25.00% 50.00%', transform: 'scale(2.0000)' });
  assert.equal(V.isDefault({}), true);
});
