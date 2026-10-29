'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createWatchers } = require('../../lib/watch');

function fakeWatch() {
  const made = [];
  const fn = (root, opts) => {
    if (root === 'X:\\gone') throw new Error('ENOENT');
    const w = new EventEmitter();
    Object.assign(w, { root, opts, closed: false, close() { w.closed = true; } });
    made.push(w);
    return w;
  };
  fn.made = made;
  return fn;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('one watcher per folder, shared by windows, closed when no window needs it', () => {
  const watch = fakeWatch();
  const w = createWatchers({ watch, notify() {}, delay: 5 });
  assert.equal(w.set(1, ['D:\\A', 'd:\\a', 'D:\\B', 'X:\\gone', 7]), 2);
  assert.equal(watch.made.length, 2);
  assert.deepEqual(watch.made[0].opts, { recursive: true, persistent: false });
  w.set(2, ['D:\\A']);
  assert.equal(watch.made.length, 2, 'the second window reuses the watcher');
  assert.deepEqual(w.watched().find((x) => x.root === 'D:\\A').owners, [1, 2]);

  w.dropOwner(1);
  assert.equal(watch.made[1].closed, true, 'B was only needed by window 1');
  assert.equal(watch.made[0].closed, false);
  w.set(2, []);
  assert.equal(watch.made[0].closed, true);
  assert.deepEqual(w.watched(), []);
});

test('a burst of changes becomes one notice per window', async () => {
  const watch = fakeWatch();
  const got = [];
  const w = createWatchers({ watch, notify: (owner, root) => got.push(owner + ' ' + root), delay: 10 });
  w.set(1, ['D:\\A']); w.set(2, ['D:\\A']);
  for (let i = 0; i < 5; i++) watch.made[0].emit('change', 'rename', 'f' + i);
  await sleep(40);
  assert.deepEqual(got.sort(), ['1 D:\\A', '2 D:\\A']);
  w.closeAll();
});

test('a watcher that fails is dropped', () => {
  const watch = fakeWatch();
  const w = createWatchers({ watch, notify() {}, delay: 5 });
  w.set(1, ['D:\\A']);
  watch.made[0].emit('error', new Error('drive removed'));
  assert.equal(watch.made[0].closed, true);
  assert.deepEqual(w.watched(), []);
  w.set(1, ['D:\\A']);
  assert.equal(watch.made.length, 2, 'asking again starts a new watcher');
});
