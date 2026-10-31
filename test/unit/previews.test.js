'use strict';
// Hover previews: where the parts come from, and real clips made from clips FFmpeg makes for the test (skipped without
// vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const MI = require('../../lib/mediainfo');
const { createPreviews, partsFor, SIZE } = require('../../lib/previews');
const { createCache } = require('../../lib/cache');

test('four parts from across a long video; a short one or one of unknown length from its start', () => {
  assert.deepEqual(partsFor(100).map((p) => p.at), [15, 35, 55, 75]);
  assert.ok(partsFor(100).every((p) => p.len === 1.5));
  assert.deepEqual(partsFor(5), [{ at: 0, len: 5 }]);
  assert.deepEqual(partsFor(0), [{ at: 0, len: 6 }]);
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-prev-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
// A library entry for a clip FFmpeg makes now.
async function entry(name, size, secs) {
  const file = path.join(dir, name);
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=' + size + ':rate=25:duration=' + secs,
    '-f', 'lavfi', '-i', 'sine=duration=' + secs, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file], { timeoutMs: 60000 });
  const st = fs.statSync(file);
  return { id: name, path: file, size: st.size, mtime: st.mtimeMs, kind: 'video', dur: secs };
}

test('a small, silent clip of about six seconds in the cache, made once; upright stays upright', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache')), pv = createPreviews({ cache, ffmpeg: ff });
  const cases = [[await entry('long.mp4', '1280x720', 30), [SIZE, 202], 6], [await entry('tall.mp4', '720x1280', 20), [202, SIZE], 6], [await entry('short.mp4', '320x180', 3), [320, 180], 3]];
  for (const [e, size, secs] of cases) {
    const p = await pv.get(e);
    assert.equal(path.dirname(p), path.join(dir, 'cache', 'previews'), e.id);
    const made = MI.describe(await ff.probeRaw(p));
    assert.equal(made.video.codec, 'h264');
    assert.deepEqual([made.video.width, made.video.height], size, e.id);
    assert.equal(made.audio, null, e.id + ' is silent');
    assert.ok(Math.abs(made.duration - secs) < 0.5, e.id + ': ' + made.duration + ' s');
    assert.equal(await pv.get(e), p, 'made once');
  }
});

test('one at a time: of those asked for meanwhile only the latest waits; a picture or a broken file has none', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache2')), pv = createPreviews({ cache, ffmpeg: ff });
  const [a, b, c] = [await entry('a.mp4', '640x360', 12), await entry('b.mp4', '640x360', 12), await entry('c.mp4', '640x360', 12)];
  const got = await Promise.all([pv.get(a), pv.get(b), pv.get(c)]);
  assert.ok(got[0] && got[2], 'the first (being made) and the latest');
  assert.equal(got[1], null, 'the one in between was passed over');
  assert.equal(await pv.get(Object.assign({}, a, { kind: 'image' })), null);
  const broken = path.join(dir, 'broken.mp4');
  fs.writeFileSync(broken, 'not a video');
  const st = fs.statSync(broken);
  assert.equal(await pv.get({ id: 'x', path: broken, size: st.size, mtime: st.mtimeMs, kind: 'video', dur: 20 }), null);
  assert.ok(!fs.readdirSync(path.join(dir, 'cache2', 'previews')).some((n) => n.endsWith('.part')), 'no half-made file');
});
