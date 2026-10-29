'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../renderer/lib/playback');

test('speed steps up and down, and stops at the ends', () => {
  assert.equal(P.stepSpeed(1, 1), 1.25);
  assert.equal(P.stepSpeed(1, -1), 0.75);
  assert.equal(P.stepSpeed(2, 1), 2);
  assert.equal(P.stepSpeed(0.25, -1), 0.25);
  assert.equal(P.stepSpeed(1.1, 1), 1.25, 'from an in-between speed');
});

test('times read and write as m:ss.s', () => {
  assert.equal(P.fmtTime(83.46), '1:23');
  assert.equal(P.fmtTime(83.46, true), '1:23.4');
  assert.equal(P.fmtTime(3723), '1:02:03');
  assert.equal(P.fmtTime(NaN), '0:00');
  assert.equal(P.parseTime('1:23.4'), 83.4);
  assert.equal(P.parseTime(' 83,5 '), 83.5);
  assert.equal(P.parseTime('1:02:03'), 3723);
  assert.ok(Number.isNaN(P.parseTime('abc')));
  assert.ok(Number.isNaN(P.parseTime('1:2:3:4')));
  assert.ok(Number.isNaN(P.parseTime('')));
});

test('a loop part is kept inside the video and in order', () => {
  assert.deepEqual(P.cleanLoop(2, 5, 10), { a: 2, b: 5 });
  assert.deepEqual(P.cleanLoop(2, 50, 10), { a: 2, b: 10 }, 'end trimmed to the video');
  assert.deepEqual(P.cleanLoop(3, null, 10), { a: 3, b: null }, 'from a point to the end');
  assert.equal(P.cleanLoop(5, 2, 10), null, 'end before start');
  assert.equal(P.cleanLoop(0, null, 10), null, 'the whole video is no part');
  assert.equal(P.cleanLoop(4, 4.05, 10), null, 'too short');
  assert.equal(P.hasLoop({ loopA: 0, loopB: null }), false);
  assert.equal(P.hasLoop({ loopA: 2, loopB: null }), true);
  assert.equal(P.loopTarget(4.9, 2, 5), null);
  assert.equal(P.loopTarget(5, 2, 5), 2);
  assert.equal(P.loopTarget(9, 2, null), null);
});
