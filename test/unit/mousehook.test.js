'use strict';
// The emergency hide's mouse helper (lib/mousehook.js, tools/mousehook): it starts, says when its hook is in place,
// reports a press of its button, lets go when asked, and ends with its input. Skipped where the helper is not built
// (npm run build-mousehook) or not on Windows. The press is a real one through Windows (test/mouseinput.js): the
// Forward button, which the helper swallows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMouseHook } = require('../../lib/mousehook');
const { pressSide } = require('../mouseinput');

const exe = path.join(__dirname, '..', '..', 'vendor', 'mousehook', 'wallpane-mouse.exe');
const skip = process.platform === 'win32' && fs.existsSync(exe) ? false : 'The mouse helper is not built (npm run build-mousehook)';
const until = async (cond, ms) => { for (let t = 0; t < ms && !cond(); t += 20) await new Promise((r) => setTimeout(r, 20)); return cond(); };

test('without its helper, nothing runs and it does not work', () => {
  const h = createMouseHook({ exe: path.join(__dirname, 'no such.exe'), onPress() {} });
  h.start('back');
  assert.equal(h.ok(), false);
  h.stop();
});

test('the helper catches its button in every program, and lets go', { skip }, async () => {
  let presses = 0;
  const changes = [];
  const h = createMouseHook({ exe, onPress: () => { presses++; }, onChange: (ok) => changes.push(ok) });
  try {
    h.start('nonsense');
    assert.equal(h.ok(), false, 'an unknown button starts nothing');
    h.start('forward');
    assert.ok(await until(() => h.ok(), 30000), 'the hook is in place');
    h.start('forward');                                  // the same button again: still the same helper
    assert.equal(h.ok(), true);
    const sent = await pressSide(2);
    if (sent === 2) assert.ok(await until(() => presses === 1, 5000), 'one press');
    else test.diagnostic('Windows took no input here, so the press itself was not tried');
    h.stop();
    assert.equal(h.ok(), false);
    assert.deepEqual(changes, [true, false]);
  } finally { h.stop(); }
});

test('after the helper puts its hook in afresh (every 10 s), a press still counts, once', { skip, timeout: 60000 }, async () => {
  let presses = 0;
  const h = createMouseHook({ exe, onPress: () => { presses++; } });
  try {
    h.start('forward');
    assert.ok(await until(() => h.ok(), 30000), 'the hook is in place');
    await new Promise((r) => setTimeout(r, 11000));
    const sent = await pressSide(2);
    if (sent !== 2) { test.diagnostic('Windows took no input here, so the press itself was not tried'); return; }
    assert.ok(await until(() => presses >= 1, 5000), 'the press came through the fresh hook');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(presses, 1, 'and only once');
  } finally { h.stop(); }
});
