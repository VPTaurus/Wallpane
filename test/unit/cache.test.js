'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCache } = require('../../lib/cache');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wp-cache-')); }

test('a made file is named by the original, and a changed original gets a new one', (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = createCache(path.join(dir, 'cache')), orig = path.join(dir, 'clip.avi');
  fs.writeFileSync(orig, 'one');
  const p = c.pathFor('converted', orig, 'mp4');
  assert.equal(path.dirname(p), path.join(dir, 'cache', 'converted'));
  assert.equal(c.find('converted', orig, 'mp4'), null, 'not made yet');
  fs.writeFileSync(p, 'made');
  assert.equal(c.find('converted', orig, 'mp4'), p);
  fs.writeFileSync(orig, 'changed, and longer');
  assert.equal(c.find('converted', orig, 'mp4'), null, 'the original changed');
  assert.throws(() => c.pathFor('nonsense', orig, 'x'), /Unknown cache kind/);
});

test('info adds up each kind; clean removes the files used longest ago; clear empties it', (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = createCache(path.join(dir, 'cache'));
  const make = (kind, name, bytes, usedSecsAgo) => {
    const f = path.join(dir, name); fs.writeFileSync(f, name);
    const p = c.pathFor(kind, f, 'bin'); fs.writeFileSync(p, Buffer.alloc(bytes));
    const when = new Date(Date.now() - usedSecsAgo * 1000); fs.utimesSync(p, when, when);
    return p;
  };
  const old = make('converted', 'a', 3000, 300), mid = make('thumbs', 'b', 2000, 200), fresh = make('previews', 'c', 1000, 10);
  const i = c.info();
  assert.equal(i.total, 6000);
  assert.deepEqual(i.byKind, { converted: 3000, thumbs: 2000, previews: 1000, proxies: 0 });
  assert.equal(c.clean(3500), 3000, 'the oldest one went');
  assert.ok(!fs.existsSync(old) && fs.existsSync(mid) && fs.existsSync(fresh));
  assert.equal(c.clean(10000), 0, 'already under the limit');
  assert.equal(c.clear(), 3000);
  assert.equal(c.info().total, 0);
});
