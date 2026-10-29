'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../renderer/lib/freegeo');
const FIT = require('../../renderer/lib/fit');
const G = require('../../renderer/lib/geometry');

const d = { W: 1000, H: 500 };

test('free resolve slides tiles aside and refuses places off the wall', () => {
  const base = { 1: { x: 0, y: 0, w: 200, h: 200 }, 2: { x: 300, y: 0, w: 200, h: 200 } };
  const geo = F.resolve(['1', '2'], '1', { x: 250, y: 0, w: 200, h: 200 }, base, d);
  assert.ok(geo);
  assert.equal(F.ovl(geo[1], geo[2]), false);
  assert.equal(F.inside(geo[2], d), true);
  assert.equal(F.resolve(['1', '2'], '1', { x: 900, y: 0, w: 200, h: 200 }, base, d), null, 'off the wall');
  assert.equal(F.resolve(['1', '2'], '1', { x: 0, y: 0, w: 10, h: 200 }, base, d), null, 'too small');
});

test('snapping pulls an edge onto a nearby line only', () => {
  assert.equal(F.snapAxis(103, 100, [100, 500]), -3);
  assert.equal(F.snapAxis(397, 100, [100, 500]), 3);
  assert.equal(F.snapAxis(150, 100, [100, 500]), 0);
  assert.equal(F.snapPos(498, [0, 500]), 500);
  assert.equal(F.snapPos(480, [0, 500]), 480);
});

test('fitBox shrinks a tile to its media shape inside its old box', () => {
  const ratio = (b, gap) => (b.w - gap) / (b.h - gap);
  const wide = F.fitBox({ x: 10, y: 20, w: 406, h: 406 }, 16 / 9, 6);
  assert.deepEqual([wide.x, wide.y, wide.w], [10, 20, 406]);
  assert.ok(Math.abs(ratio(wide, 6) - 16 / 9) < 1e-9);
  const tall = F.fitBox({ x: 0, y: 0, w: 406, h: 206 }, 9 / 16, 6);
  assert.equal(tall.h, 206);
  assert.ok(Math.abs(ratio(tall, 6) - 9 / 16) < 1e-9);
  assert.ok(tall.w < 406);
  assert.equal(F.fitBox({ x: 0, y: 0, w: 300, h: 30 }, 1 / 20, 0).w, F.MIN, 'never smaller than the minimum');
});

test('keepRatio holds the shape while resizing from an edge or a corner', () => {
  const g0 = { x: 100, y: 100, w: 206, h: 106 };   // 200 x 100 inside a 6 px gap
  const shape = (b) => (b.w - 6) / (b.h - 6);
  const e = F.keepRatio(g0, { x: 100, y: 100, w: 306, h: 106 }, 'e', 6);
  assert.deepEqual([e.x, e.y, e.w, e.h], [100, 100, 306, 156]);
  const n = F.keepRatio(g0, { x: 100, y: 50, w: 206, h: 156 }, 'n', 6);
  assert.equal(n.y + n.h, 206, 'the bottom stays put');
  assert.ok(Math.abs(shape(n) - 2) < 1e-9);
  const nw = F.keepRatio(g0, { x: 0, y: 90, w: 306, h: 116 }, 'nw', 6);
  assert.equal(nw.x + nw.w, 306, 'the right side stays put');
  assert.equal(nw.y + nw.h, 206, 'the bottom stays put');
  assert.ok(Math.abs(shape(nw) - 2) < 1e-9);
  assert.equal(nw.w, 306, 'the side that moved more leads');
});

test('findGap finds room for a new tile, or none on a full wall', () => {
  assert.deepEqual(F.findGap({}, d), { x: 0, y: 0, w: d.W / 3, h: d.H / 3 });
  assert.equal(F.findGap({ 1: { x: 0, y: 0, w: d.W, h: d.H } }, d), null);
});

test('grid to free and back keeps every tile on its cells', () => {
  const items = [{ id: 1, col: 0, row: 0, w: 2, h: 1 }, { id: 2, col: 2, row: 0, w: 1, h: 2 }, { id: 3, col: 0, row: 1, w: 1, h: 1 }];
  const before = JSON.stringify(G.geoMap(items));
  F.toFree(items, 3, 2, 6, d, false);
  assert.ok(items.every((i) => F.hasFree(i)));
  const dropped = F.toGrid(items, 3, 2, 6, d);
  assert.deepEqual(dropped, []);
  assert.equal(JSON.stringify(G.geoMap(items)), before);
});

test('toGrid copes with a tile that has no free place yet', () => {
  const items = [{ id: 1, col: 1, row: 0, w: 1, h: 1 }];
  assert.deepEqual(F.toGrid(items, 2, 1, 6, d), []);
  assert.deepEqual(G.geoMap(items)[1], { col: 1, row: 0, w: 1, h: 1 });
});

test('randomPartition cuts a grid into exactly k tiles that cover it', () => {
  const rnd = FIT.seededRandom(3);
  for (const k of [1, 2, 5, 12]) {
    const out = [];
    FIT.randomPartition(0, 0, 4, 3, k, rnd, out);
    assert.equal(out.length, k);
    assert.equal(G.validLayout(out.map((g, i) => Object.assign({ id: i }, g)), 4, 3), true);
    assert.equal(out.reduce((s, g) => s + g.w * g.h, 0), 12);
  }
});

test('Fit to media improves coverage and gives each media one tile', () => {
  const asp = [16 / 9, 9 / 16, 16 / 9, 9 / 16];
  const plain = [{ w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }];
  const before = FIT.coverage(plain, null, asp, 300, 300, 0);
  const r = FIT.plan({ cols: 4, rows: 3, asp, px: 300, py: 300, gap: 0 });
  assert.ok(r.score > before);
  assert.deepEqual(r.assign.slice().sort(), [0, 1, 2, 3]);
  assert.equal(r.rects.length, 4);
});

test('Fit to media stops when its time is up', () => {
  let t = 0;
  const now = () => (t += 10);           // every check takes 10 ms of fake time
  const r = FIT.plan({ cols: 12, rows: 12, asp: new Array(60).fill(4 / 3), px: 100, py: 60, gap: 6, budgetMs: 100, now });
  assert.ok(r.tried < 15, 'tried ' + r.tried);
  assert.equal(r.rects.length, 60);
});
