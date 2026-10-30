'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../renderer/lib/collage');
const F = require('../../renderer/lib/freegeo');

const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
// The boxes cover the wall exactly: all inside, none overlapping, areas adding up to the wall.
function coversWall(boxes, W, H) {
  const geo = {};
  boxes.forEach((b, i) => { geo[i] = b; });
  const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
  return F.valid(geo, { W, H }) && near(area, W * H, 1);
}

test('four 16:9 videos on a 16:9 wall: two rows of two, nothing cropped', () => {
  const plan = C.fill([16 / 9, 16 / 9, 16 / 9, 16 / 9], 1600, 900, 0);
  assert.equal(plan.rows, 2);
  assert.equal(plan.cols, false);
  assert.ok(plan.crop < 0.001);
  assert.deepEqual(plan.boxes.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)), [[0, 0, 800, 450], [800, 0, 800, 450], [0, 450, 800, 450], [800, 450, 800, 450]]);
});

test('every tile keeps its shape within the row, with the gap counted', () => {
  const asp = [16 / 9, 9 / 16, 4 / 3, 1, 21 / 9], gap = 6;
  const plan = C.fill(asp, 1920, 1080, gap);
  assert.ok(coversWall(plan.boxes, 1920, 1080));
  // Each media area (box minus gap) is off its media's shape by no more than the crop the plan reports.
  plan.boxes.forEach((b, i) => {
    const shape = (b.w - gap) / (b.h - gap);
    assert.ok(Math.abs(Math.log(shape / asp[i])) < Math.abs(Math.log(1 - plan.crop)) + 0.02, 'tile ' + i + ' is off by more than the crop');
  });
});

test('any mix of shapes fills the wall exactly, in reading order', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let round = 0; round < 30; round++) {
    const n = 1 + Math.floor(rnd() * 14), asp = Array.from({ length: n }, () => [16 / 9, 9 / 16, 4 / 3, 1, 3 / 4, 2.4][Math.floor(rnd() * 6)]);
    const plan = C.fill(asp, 1600, 900, 4);
    assert.equal(plan.boxes.length, n);
    assert.ok(coversWall(plan.boxes, 1600, 900), 'round ' + round);
    assert.ok(plan.rows >= 1 && plan.rows <= C.MAX_ROWS);
  }
});

test('when reading order crops a lot, tiles regroup so the rows fit', () => {
  const asp = [16 / 9, 9 / 16, 4 / 3, 1, 2.4, 16 / 9, 3 / 4];
  const plan = C.fill(asp, 1250, 670, 6);
  assert.ok(coversWall(plan.boxes, 1250, 670));
  assert.ok(plan.crop < 0.04, 'crop ' + plan.crop.toFixed(3));
  assert.equal(plan.reordered, true);
  assert.deepEqual(C.fill(asp, 1250, 670, 6), plan, 'the same wall gives the same answer');
});

test('tall media on a wide wall may go in columns', () => {
  const plan = C.fill([9 / 16, 9 / 16, 9 / 16], 1600, 900, 0);
  assert.ok(coversWall(plan.boxes, 1600, 900));
  assert.equal(plan.rows, 1, 'one row of three portrait videos');
  assert.ok(plan.crop < 0.06);
});
