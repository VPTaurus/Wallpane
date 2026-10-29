'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../../renderer/lib/hotkey');
const C = require('../../renderer/lib/clock');

const press = (code, mods = {}) => Object.assign({ key: 'x', code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, mods);

test('hotkey: a key press becomes an accelerator, checked for keys other programs need', () => {
  assert.deepEqual(K.fromEvent(press('KeyH', { ctrlKey: true, shiftKey: true })), { accel: 'Ctrl+Shift+H' });
  assert.deepEqual(K.fromEvent(press('F9')), { accel: 'F9' });
  assert.equal(K.fromEvent(press('ShiftLeft', { key: 'Shift', shiftKey: true })), null, 'only a modifier so far');
  assert.ok(K.fromEvent(press('KeyH', { ctrlKey: true })).error, 'Ctrl+H alone would take a key from every editor');
  assert.ok(K.fromEvent(press('KeyH', { shiftKey: true, altKey: false })).error);
  assert.ok(K.fromEvent(press('F11')).error, 'F11 is wall mode');
  assert.ok(K.fromEvent(press('F4', { altKey: true })).error);
  assert.ok(K.fromEvent(press('IntlBackslash', { ctrlKey: true, shiftKey: true })).error);
});

test('hotkey: accelerators are written one way, compared and shown', () => {
  assert.equal(K.normalize('shift+control+h'), 'Ctrl+Shift+H');
  assert.equal(K.normalize('CmdOrCtrl+Alt+f5'), 'Ctrl+Alt+F5');
  assert.equal(K.normalize('Ctrl+Ctrl+H'), null);
  assert.equal(K.normalize('Ctrl+Hyper+H'), null);
  assert.equal(K.normalize(''), null);
  assert.equal(K.label('Ctrl+Super+Space'), 'Ctrl + Win + Space');
  assert.ok(K.matches(press('KeyH', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+H'));
  assert.ok(!K.matches(press('KeyH', { ctrlKey: true, shiftKey: true, altKey: true }), 'Ctrl+Shift+H'));
  assert.equal(K.problem('Ctrl+Shift+H'), '');
});

test('hotkey: Scroll Lock and media keys work alone, with readable names', () => {
  assert.deepEqual(K.fromEvent(press('ScrollLock', { key: 'ScrollLock' })), { accel: 'Scrolllock' });
  assert.deepEqual(K.fromEvent(press('AudioVolumeMute', { key: 'AudioVolumeMute' })), { accel: 'VolumeMute' });
  assert.equal(K.normalize('scrolllock'), 'Scrolllock');
  assert.equal(K.normalize('mediaplaypause'), 'MediaPlayPause');
  assert.equal(K.problem('MediaPlayPause'), '');
  assert.ok(K.problem('Space'), 'Space alone would take it from every program');
  assert.equal(K.label('VolumeMute'), 'Mute key');
  assert.equal(K.label('Scrolllock'), 'Scroll Lock');
  assert.ok(K.matches(press('ScrollLock', { key: 'ScrollLock' }), 'Scrolllock'));
});

test('clock: stopwatch runs, pauses, laps and resets', () => {
  const w = C.watch();
  C.start(w, 1000);
  assert.equal(C.elapsed(w, 3500), 2500);
  C.lap(w, 3500);
  C.pause(w, 4000);
  assert.equal(C.elapsed(w, 9000), 3000, 'paused time does not count');
  C.start(w, 10000);
  C.lap(w, 10500);
  assert.deepEqual(w.laps, [3500, 2500], 'newest lap first');
  C.reset(w);
  assert.equal(C.elapsed(w, 20000), 0);
  assert.ok(!C.running(w));
});

test('clock: countdown, times written and read', () => {
  const t = C.watch(5 * 60000);
  C.start(t, 0);
  assert.equal(C.fmtLeft(C.left(t, 400)), '5:00', 'rounds up');
  assert.equal(C.fmtLeft(C.left(t, 61000)), '3:59');
  assert.equal(C.left(t, 400000), 0);
  assert.equal(C.fmt(83456, true), '1:23.4');
  assert.equal(C.fmt(3723000, false), '1:02:03');
  assert.equal(C.parseTimer('5'), 300000);
  assert.equal(C.parseTimer('1,5'), 90000);
  assert.equal(C.parseTimer('1:30'), 90000);
  assert.equal(C.parseTimer('1:00:00'), 3600000);
  assert.equal(C.parseTimer('0'), null);
  assert.equal(C.parseTimer('soon'), null);
  assert.equal(C.parseTimer('25:00:00'), null, 'a day at most');
  const d = new Date(2026, 9, 29, 14, 5, 9);
  assert.equal(C.fmtClock(d, true, false), '14:05');
  assert.equal(C.fmtClock(d, false, true), '2:05:09 PM');
  assert.equal(C.fmtClock(new Date(2026, 0, 1, 0, 7), false, false), '12:07 AM');
});
