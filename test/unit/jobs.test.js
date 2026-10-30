'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createJobs } = require('../../lib/jobs');

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));
// Kinds whose jobs end when the test says so (finish(key) or fail(key)), or when cancelled.
function controllable() {
  const open = new Map(), started = [];
  function run(job, ctx) {
    started.push(job.key);
    return new Promise((res, rej) => {
      open.set(job.key, { res, rej, ctx });
      ctx.signal.addEventListener('abort', () => rej(Object.assign(new Error('stop'), { code: 'CANCELLED' })));
    });
  }
  return {
    kinds: { big: { heavy: true, run }, small: { heavy: false, run } },
    started, open,
    finish: (key, v) => open.get(key).res(v === undefined ? key + ' done' : v),
    fail: (key, msg) => open.get(key).rej(new Error(msg))
  };
}

test('one heavy and two light jobs at a time; the user goes first', async () => {
  const c = controllable(), q = createJobs({ kinds: c.kinds });
  q.add({ kind: 'big', key: 'b1' }); q.add({ kind: 'big', key: 'b2' }); q.add({ kind: 'big', key: 'b3', priority: 'user' });
  q.add({ kind: 'small', key: 's1' }); q.add({ kind: 'small', key: 's2' }); q.add({ kind: 'small', key: 's3' });
  await tick();
  assert.deepEqual(c.started, ['b1', 's1', 's2'], 'b1 was already running when the user asked for b3');
  c.finish('b1'); c.finish('s1');
  await tick();
  assert.deepEqual(c.started.slice(3), ['b3', 's3'], "then the user's job, before b2");
  c.finish('b3'); c.finish('s2'); c.finish('s3');
  await tick();
  c.finish('b2');
  await q.idle();
  assert.ok(q.list().every((j) => j.state === 'done'));
  assert.equal(q.list().find((j) => j.key === 'b1').result, 'b1 done');
});

test('the same key is one job; asking as the user lifts it to the front', async () => {
  const c = controllable(), q = createJobs({ kinds: c.kinds });
  q.add({ kind: 'big', key: 'busy' });
  const a = q.add({ kind: 'big', key: 'x' }), b = q.add({ kind: 'big', key: 'y' });
  assert.equal(q.add({ kind: 'big', key: 'y', priority: 'user' }), b);
  assert.equal(b.priority, 'user');
  await tick();
  c.finish('busy');
  await tick();
  assert.deepEqual(c.started, ['busy', 'y']);
  assert.equal(a.state, 'queued');
});

test('cancel a waiting or a running job; a failure is reported', async () => {
  const c = controllable(), q = createJobs({ kinds: c.kinds });
  const run = q.add({ kind: 'big', key: 'r' }), wait = q.add({ kind: 'big', key: 'w' }), bad = q.add({ kind: 'small', key: 'f' });
  await tick();
  assert.ok(q.cancel(wait.id));
  assert.ok(q.cancel(run.id));
  await assert.rejects(run.promise, (e) => e.code === 'CANCELLED');
  c.fail('f', 'broken file');
  await assert.rejects(bad.promise, /broken file/);
  await q.idle();
  assert.deepEqual(q.list().map((j) => [j.key, j.state]), [['r', 'cancelled'], ['w', 'cancelled'], ['f', 'failed']]);
  assert.equal(q.list().find((j) => j.key === 'f').error, 'broken file');
  q.clearFinished();
  assert.deepEqual(q.list(), []);
});

test('progress is reported a few times a second, not on every step', async () => {
  let reports = 0;
  const kinds = { k: { heavy: true, run: async (job, ctx) => { for (let i = 1; i <= 100; i++) { ctx.progress(i / 100); await tick(1); } } } };
  const q = createJobs({ kinds, notify: () => { reports++; } });
  q.add({ kind: 'k', key: 'p' });
  await q.idle();
  await tick(300);
  assert.ok(reports >= 3 && reports < 30, reports + ' reports for 100 steps');
  assert.equal(q.list()[0].progress, 1);
});

test('unfinished jobs are saved and start again', async () => {
  const c = controllable();
  let saved = [];
  const q = createJobs({ kinds: c.kinds, save: (p) => { saved = p; } });
  q.add({ kind: 'big', key: 'a', label: 'A', input: { file: 'D:\\a.avi' } });
  q.add({ kind: 'big', key: 'b', priority: 'user' });
  await tick();
  assert.deepEqual(saved.map((s) => [s.key, s.priority]), [['a', 'background'], ['b', 'user']]);
  const c2 = controllable(), q2 = createJobs({ kinds: c2.kinds, load: () => saved });
  await tick();
  assert.deepEqual(c2.started, ['b'], "the user's job first after a restart");
  assert.deepEqual(q2.list().find((j) => j.key === 'a').label, 'A');
});
