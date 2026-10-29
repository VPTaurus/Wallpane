'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../renderer/lib/geometry');

const tile = (id, col, row, w = 1, h = 1) => ({ id, col, row, w, h });

test('freeSpot finds the first free block in reading order, wrapping from the start index', () => {
  const m = G.occupancy([tile(1, 0, 0, 2, 1)], 3, 2);
  assert.deepEqual(G.freeSpot(m, 1, 1, 0, 3, 2), { col: 2, row: 0, idx: 2 });
  assert.deepEqual(G.freeSpot(m, 2, 1, 0, 3, 2), { col: 0, row: 1, idx: 3 });
  assert.deepEqual(G.freeSpot(m, 1, 1, 5, 3, 2), { col: 2, row: 1, idx: 5 });
  assert.equal(G.freeSpot(m, 3, 2, 0, 3, 2), null);
});

test('validLayout rejects overlaps and tiles outside the grid', () => {
  const items = [tile(1, 0, 0), tile(2, 1, 0)];
  assert.equal(G.validLayout(items, 2, 1), true);
  assert.equal(G.validLayout(items, 2, 1, { 2: { col: 0, row: 0, w: 1, h: 1 } }), false);
  assert.equal(G.validLayout(items, 2, 1, { 2: { col: 1, row: 0, w: 2, h: 1 } }), false);
});

test('arrange packs tiles in reading order and shrinks those that do not fit', () => {
  const items = [tile(1, 2, 1), tile(2, 0, 0, 2, 2), tile(3, 1, 2)];
  const plan = G.arrange(items, 3, 2);
  assert.deepEqual(plan[2], { col: 0, row: 0, w: 2, h: 2 });
  assert.deepEqual(plan[1], { col: 2, row: 0, w: 1, h: 1 });
  assert.deepEqual(plan[3], { col: 2, row: 1, w: 1, h: 1 });
  assert.equal(G.arrange([tile(1, 0, 0), tile(2, 0, 0), tile(3, 0, 0)], 1, 2), null);
});

test('resolve moves tiles that are in the way to the nearest free spot', () => {
  const items = [tile(1, 0, 0), tile(2, 1, 0)];
  const geo = G.resolve(items, 1, { col: 1, row: 0, w: 1, h: 1 }, null, 3, 1);
  assert.deepEqual(geo[1], { col: 1, row: 0, w: 1, h: 1 });
  assert.equal(G.validLayout(items, 3, 1, geo), true);
  assert.notDeepEqual(geo[2], { col: 1, row: 0, w: 1, h: 1 });
  // No room anywhere: a full 2 x 1 grid cannot take a tile two cells wide plus another tile.
  assert.equal(G.resolve(items, 1, { col: 0, row: 0, w: 2, h: 1 }, null, 2, 1), null);
  // Outside the grid
  assert.equal(G.resolve(items, 1, { col: 2, row: 0, w: 2, h: 1 }, null, 3, 1), null);
});

test('resolve starts from the given base layout, so dragging back restores it', () => {
  const items = [tile(1, 0, 0), tile(2, 1, 0), tile(3, 2, 0)];
  const base = G.geoMap(items);
  const pushed = G.resolve(items, 1, { col: 1, row: 0, w: 1, h: 1 }, base, 3, 1);
  G.applyGeo(items, pushed);
  const back = G.resolve(items, 1, { col: 0, row: 0, w: 1, h: 1 }, base, 3, 1);
  assert.deepEqual(back, base);
});

test('on a full grid, empty tiles give way to a tile that grows', () => {
  // 3 x 2, every cell taken: five media tiles and one empty tile (id 6) at the end of the first row.
  const items = [tile(1, 0, 0), tile(2, 1, 0), tile(4, 0, 1), tile(5, 1, 1), tile(7, 2, 1), Object.assign(tile(6, 2, 0), { kind: 'empty' })];
  assert.equal(G.resolve(items, 2, { col: 1, row: 0, w: 2, h: 1 }, null, 3, 2), null, 'no room without giving way');
  const r = G.resolveYield(items, 2, { col: 1, row: 0, w: 2, h: 1 }, null, 3, 2);
  assert.deepEqual(r.removed, [6]);
  assert.deepEqual(r.geo[2], { col: 1, row: 0, w: 2, h: 1 });
  // Growing the first tile pushes the second into the empty tile's cell instead.
  const r2 = G.resolveYield(items, 1, { col: 0, row: 0, w: 2, h: 1 }, null, 3, 2);
  assert.deepEqual(r2.removed, [6]);
  assert.deepEqual(r2.geo[2], { col: 2, row: 0, w: 1, h: 1 });
  // With room to spare, nothing goes.
  assert.deepEqual(G.resolveYield(items, 1, { col: 0, row: 0, w: 1, h: 1 }, null, 3, 2).removed, []);
  // A tile in the way would rather lose an empty tile next to it than shrink to one cell.
  const row = [tile(1, 0, 0, 2, 1), Object.assign(tile(2, 2, 0, 2, 1), { kind: 'empty' }), tile(3, 4, 0, 2, 1)];
  const grow = G.resolveYield(row, 1, { col: 0, row: 0, w: 3, h: 1 }, null, 6, 1);
  assert.deepEqual(grow.removed, [2]);
  assert.deepEqual(grow.geo[3], { col: 4, row: 0, w: 2, h: 1 });
  // Media tiles never give way.
  const full = items.map((i) => Object.assign({}, i, { kind: 'image' }));
  assert.equal(G.resolveYield(full, 2, { col: 1, row: 0, w: 2, h: 1 }, null, 3, 2), null);
});

test('shrinkTo keeps tiles that fit and finds room for the rest', () => {
  const items = [tile(1, 0, 0), tile(2, 3, 0), tile(3, 3, 2)];
  const r = G.shrinkTo(items, 2, 2);
  assert.deepEqual(r.geo[1], { col: 0, row: 0, w: 1, h: 1 });
  assert.deepEqual(r.dropped, []);
  G.applyGeo(items, r.geo);
  assert.equal(G.validLayout(items, 2, 2), true);
  const crowd = [tile(1, 0, 0), tile(2, 1, 0), tile(3, 2, 0)];
  assert.deepEqual(G.shrinkTo(crowd, 1, 1).dropped, [2, 3]);
});

test('layouts: frames are checked, and empty cells become extra slots', () => {
  assert.equal(G.validFrames({ cols: 2, rows: 1, f: [[0, 0, 1, 1], [1, 0, 1, 1]] }), true);
  assert.equal(G.validFrames({ cols: 2, rows: 1, f: [[0, 0, 2, 1], [1, 0, 1, 1]] }), false, 'overlap');
  assert.equal(G.validFrames({ cols: 2, rows: 1, f: [[0.5, 0, 1, 1]] }), false, 'not whole cells');
  assert.equal(G.validFrames({ cols: 2, rows: 1, f: [['0', 0, 1, 1]] }), false, 'not numbers');
  assert.equal(G.validFrames({ cols: 13, rows: 1, f: [[0, 0, 1, 1]] }), false, 'grid too big');
  const slots = G.layoutSlots({ cols: 2, rows: 2, f: [[0, 0, 2, 1]] });
  assert.deepEqual(slots, [{ col: 0, row: 0, w: 2, h: 1 }, { col: 0, row: 1, w: 1, h: 1 }, { col: 1, row: 1, w: 1, h: 1 }]);
  assert.equal(G.gridFrames(3, 2).length, 6);
});
