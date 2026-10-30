'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../../renderer/lib/justify');

const near = (a, b) => Math.abs(a - b) < 1e-6;

test('shapes: their own, kept between 1:3 and 3:1, or a usual one while unknown', () => {
  assert.equal(J.aspectOf({ w: 1920, h: 1080 }), 1920 / 1080);
  assert.equal(J.aspectOf({ w: 4000, h: 500 }), 3);
  assert.equal(J.aspectOf({ w: 100, h: 1000 }), 1 / 3);
  assert.equal(J.aspectOf({ kind: 'video' }), 16 / 9);
  assert.equal(J.aspectOf({ kind: 'image', w: 0, h: 0 }), 4 / 3);
});

test('even rows: every full row exactly as wide as the space, never taller than asked; the last one as asked', () => {
  const items = [{ w: 16, h: 9 }, { w: 9, h: 16 }, { w: 1, h: 1 }, { w: 4, h: 3 }, { w: 16, h: 9 }, { w: 3, h: 4 }, { w: 2, h: 1 }, { w: 1, h: 1 }];
  const L = J.layout(items, 600, 150, 4);
  assert.equal(L.boxes.length, items.length);
  assert.deepEqual(L.rows.map((r) => r.end - r.start), [4, 3, 1]);
  L.rows.forEach((r, n) => {
    const first = L.boxes[r.start], lastBox = L.boxes[r.end - 1];
    assert.equal(first.x, 0);
    if (n < L.rows.length - 1) {
      assert.ok(near(lastBox.x + lastBox.w, 600), 'row ' + n + ' fills the width');
      assert.ok(r.h <= 150);
    } else {
      assert.equal(r.h, 150);
      assert.ok(lastBox.x + lastBox.w < 600);
    }
    for (let i = r.start; i < r.end; i++) {
      assert.equal(L.boxes[i].y, r.y);
      assert.ok(near(L.boxes[i].w / L.boxes[i].h, J.aspectOf(items[i])), 'each keeps its shape');
      if (i > r.start) assert.ok(near(L.boxes[i].x, L.boxes[i - 1].x + L.boxes[i - 1].w + 4), 'with the gap between');
    }
    if (n) assert.ok(near(r.y, L.rows[n - 1].y + L.rows[n - 1].h + 4));
  });
  const end = L.rows[L.rows.length - 1];
  assert.ok(near(L.height, end.y + end.h));
  assert.deepEqual(J.layout([], 600, 150, 4), { rows: [], boxes: [], height: 0 });
  assert.deepEqual(J.layout(items, 0, 150, 4).rows, []);
});

test('one very wide picture in a narrow space fits by being lower', () => {
  const L = J.layout([{ w: 3000, h: 1000 }, { w: 1, h: 1 }], 300, 150, 4);
  assert.equal(L.rows[0].end, 1);
  assert.ok(near(L.rows[0].h, 100));
  assert.ok(near(L.boxes[0].w, 300));
});

test('which rows show in a scrolled window', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ y: i * 110, h: 100 }));
  assert.deepEqual(J.visible(rows, 0, 250), { first: 0, last: 2 });
  assert.deepEqual(J.visible(rows, 1050, 1300), { first: 9, last: 11 }, 'a row partly above the top shows');
  assert.deepEqual(J.visible(rows, 105, 108), null, 'only the gap between two rows');
  assert.deepEqual(J.visible(rows, 20000, 21000), null);
  assert.deepEqual(J.visible([], 0, 100), null);
});
