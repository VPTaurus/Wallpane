'use strict';
// Make playable: the FFmpeg arguments for each way, and the real thing on clips FFmpeg makes for the test (skipped
// without vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const MI = require('../../lib/mediainfo');
const { argsFor, playableKind } = require('../../lib/playable');
const { createCache } = require('../../lib/cache');

test('the arguments: copy, copy the picture, or convert, always into a .part file', () => {
  const x264 = FF.ENCODERS[FF.ENCODERS.length - 1];
  const remux = argsFor({ action: 'remux', target: 'mp4' }, 'D:\\a.avi', 'C:\\c\\x.mp4.part', null, FF.input);
  assert.deepEqual(remux.slice(remux.indexOf('-i'), remux.indexOf('-i') + 2), ['-i', 'D:\\a.avi']);
  assert.ok(remux.includes('-protocol_whitelist'), 'local files only');
  assert.deepEqual(remux.slice(remux.indexOf('-c'), remux.indexOf('-c') + 2), ['-c', 'copy']);
  assert.deepEqual(remux.slice(-6), ['-f', 'mp4', '-progress', 'pipe:1', '-nostats', 'C:\\c\\x.mp4.part']);
  const audio = argsFor({ action: 'audio', target: 'mp4' }, 'D:\\a.mkv', 'o', null, FF.input);
  assert.ok(audio.join(' ').includes('-c:v copy -c:a aac'));
  const conv = argsFor({ action: 'convert', target: 'mp4' }, 'D:\\a.wmv', 'o', x264, FF.input);
  assert.ok(conv.join(' ').includes('-c:v libx264'));
  assert.ok(conv.join(' ').includes('format=yuv420p'));
  const webm = argsFor({ action: 'remux', target: 'webm' }, 'D:\\a.mkv', 'o', null, FF.input);
  assert.ok(!webm.includes('+faststart') && webm.includes('webm'));
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-play-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function clip(name, vcodec, acodec, secs, extra) {
  const out = path.join(dir, name);
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=' + secs,
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=' + secs, '-c:v', vcodec, '-c:a', acodec].concat(extra || [], [out]), { timeoutMs: 60000 });
  return out;
}

test('each way makes a copy that plays, in the cache, and the original stays', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache')), kind = playableKind({ ffmpeg: ff, cache });
  const ctx = () => ({ signal: new AbortController().signal, progress: () => {} });
  const cases = [
    [await clip('a.avi', 'libx264', 'libmp3lame', 1, ['-pix_fmt', 'yuv420p']), 'remux'],
    [await clip('b.mkv', 'libx264', 'ac3', 1, ['-pix_fmt', 'yuv420p']), 'audio'],
    [await clip('c.avi', 'mpeg4', 'ac3', 1), 'convert']
  ];
  for (const [file, action] of cases) {
    const before = fs.statSync(file).mtimeMs;
    const r = await kind.run({ input: { file } }, ctx());
    assert.equal(r.action, action, path.basename(file));
    assert.equal(path.dirname(r.path), path.join(dir, 'cache', 'converted'));
    const made = MI.describe(await ff.probeRaw(r.path));
    assert.equal(MI.verdict(made).action, 'none', path.basename(file) + ' plays now');
    assert.ok(made.duration > 0.8, 'the whole clip');
    assert.equal(fs.statSync(file).mtimeMs, before, 'the original is untouched');
    assert.equal((await kind.run({ input: { file } }, ctx())).path, r.path, 'made once');
  }
  const ok = await clip('d.mp4', 'libx264', 'aac', 1, ['-pix_fmt', 'yuv420p']);
  assert.deepEqual(await kind.run({ input: { file: ok } }, ctx()), { path: ok, action: 'none' });
  assert.equal((await kind.run({ input: { file: ok, force: true } }, ctx())).action, 'convert', 'forced when it did not play');
});

test('cancelling leaves no half-made file', { skip }, async () => {
  const cache = createCache(path.join(dir, 'cache2')), kind = playableKind({ ffmpeg: ff, cache });
  const file = await clip('long.avi', 'mpeg4', 'ac3', 20, ['-s', '1280x720']);
  const ctl = new AbortController();
  const p = kind.run({ input: { file } }, { signal: ctl.signal, progress: (x) => { if (x > 0.05) ctl.abort(); } });
  await assert.rejects(p, (e) => e.code === 'CANCELLED');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'cache2', 'converted')), []);
});
