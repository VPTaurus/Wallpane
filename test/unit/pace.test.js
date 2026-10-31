'use strict';
// Drawing pace: what Automatic draws at for some screens, and the rate for what app.json holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { autoPace, paceHzOf } = require('../../lib/pace');

test('Automatic: the slowest screen when it is below the main display; otherwise the main display\'s own pace', () => {
  assert.equal(autoPace([165, 60], 165), 60, 'a 1440p at 165 Hz as main, a Full HD at 60 Hz beside it');
  assert.equal(autoPace([120, 60], 120), 60, 'an even multiple does not help (measured on such a PC)');
  assert.equal(autoPace([60, 165], 60), 0, 'the slow one is the main display: Windows already paces by it');
  assert.equal(autoPace([60, 59.94], 60), 0, 'alike');
  assert.equal(autoPace([144], 144), 0, 'one screen');
  assert.equal(autoPace([144, 75, 60], 144), 60, 'three screens: the slowest');
  assert.equal(autoPace([0, 60], 144), 0, 'a screen that does not say is left out');
  assert.equal(autoPace([], 0), 0);
});

test('the rate for app.json: chosen, worked out last time, or the main display\'s', () => {
  assert.equal(paceHzOf({ pace: '60' }), 60);
  assert.equal(paceHzOf({ pace: 'main', paceHz: 60 }), 0);
  assert.equal(paceHzOf({ pace: 'auto', paceHz: 60 }), 60);
  assert.equal(paceHzOf({ paceHz: 75.2 }), 75, 'Automatic is the default');
  assert.equal(paceHzOf({ pace: 'auto', paceHz: 5 }), 0, 'nonsense is ignored');
  assert.equal(paceHzOf(null), 0);
});
