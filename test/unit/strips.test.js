'use strict';
// Timeline pictures: the layout, and real strips made from clips FFmpeg makes for the test (skipped without
// vendor/ffmpeg); also the one-at-a-time runner they share with hover previews.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const { createStrips, layoutFor, SIZE } = require('../../lib/strips');
const { createLatest } = require('../../lib/latest');
const { createCache } = require('../../lib/cache');

test('about a frame a second, at most 100, ten to a row', () => {
  assert.deepEqual(layoutFor(20), { count: 20, every: 1, cols: 10, rows: 2 });
  assert.deepEqual(layoutFor(3.5), { count: 4, every: 0.875, cols: 4, rows: 1 });
  const film = layoutFor(7200);
  assert.deepEqual([film.count, film.every, film.cols, film.rows], [100, 72, 10, 10]);
  assert.equal(layoutFor(0.2).count, 1);
});

test('the latest first: one at a time, the one asked for last waits, the same one asked twice is one', async () => {
  const open = [], made = [];
  const latest = createLatest((x) => new Promise((res) => { made.push(x); open.push(() => res(x + ' done')); }));
  const a = latest.get('a', 'a'), b = latest.get('b', 'b'), c = latest.get('c', 'c');
  assert.equal(latest.get('a', 'a'), a, 'a is being made: the same promise');
  assert.equal(latest.get('c', 'c'), c, 'c waits: the same promise');
  assert.equal(await b, null, 'b was passed over');
  await new Promise((r) => setTimeout(r, 5));
  open[0]();
  assert.equal(await a, 'a done');
  await new Promise((r) => setTimeout(r, 5));
  open[1]();
  assert.equal(await c, 'c done');
  assert.deepEqual(made, ['a', 'c']);
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-strip-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function clip(name, size, secs) {
  const file = path.join(dir, name);
  // A key frame every two seconds, as is common: the last one comes before the end.
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=' + size + ':rate=25:duration=' + secs,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '50', '-pix_fmt', 'yuv420p', file], { timeoutMs: 60000 });
  return file;
}
async function sizeOf(p) {
  const s = (await ff.probeRaw(p)).streams[0];
  return [s.width, s.height];
}
// How bright one cell of a strip is on average (0 to 255).
async function cellBrightness(p, x, y, w, h) {
  const raw = path.join(dir, 'cell.raw');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-i', p, '-vf', 'crop=' + w + ':' + h + ':' + x + ':' + y + ',scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', raw]);
  return fs.readFileSync(raw)[0];
}

test('a strip of small frames in the cache, ten to a row, made once; upright frames stay upright', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache')), st = createStrips({ cache, ffmpeg: ff });
  const wide = await clip('wide.mp4', '640x360', 20);
  const r = await st.get(wide, 20);
  assert.equal(path.dirname(r.path), path.join(dir, 'cache', 'previews'));
  assert.ok(r.path.endsWith('.strip20.webp'));
  assert.deepEqual([r.count, r.every, r.cols, r.rows], [20, 1, 10, 2]);
  assert.deepEqual(await sizeOf(r.path), [10 * SIZE, 2 * 90], 'ten frames of 160 × 90 to a row, two rows');
  assert.ok(await cellBrightness(r.path, 9 * SIZE, 90, SIZE, 90) > 40, 'the last cell is a picture, not black');
  assert.equal((await st.get(wide, 20)).path, r.path, 'made once');

  const tall = await clip('tall.mp4', '360x640', 3);
  const t = await st.get(tall, 3);
  assert.deepEqual([t.count, t.cols, t.rows], [3, 3, 1]);
  assert.deepEqual(await sizeOf(t.path), [3 * 90, SIZE]);
});

test('a broken or missing file, or no length, has none, and leaves no half-made file', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache2')), st = createStrips({ cache, ffmpeg: ff });
  const broken = path.join(dir, 'broken.mp4');
  fs.writeFileSync(broken, 'not a video');
  assert.equal(await st.get(broken, 20), null);
  assert.equal(await st.get(path.join(dir, 'gone.mp4'), 20), null);
  assert.equal(await st.get(await clip('ok.mp4', '320x180', 2), 0), null);
  assert.ok(!fs.readdirSync(path.join(dir, 'cache2', 'previews')).some((n) => n.endsWith('.part')));
});
