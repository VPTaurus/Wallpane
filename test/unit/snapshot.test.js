'use strict';
// Save this frame: checking the request, the name offered, FFmpeg's arguments, and a real frame of a clip FFmpeg
// makes for the test (skipped without vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const S = require('../../lib/snapshot');

test('clean keeps a moment, refuses a broken one', () => {
  assert.deepEqual(S.clean({ file: 'C:\\v\\a.mp4', at: 2.5, extra: 1 }), { file: 'C:\\v\\a.mp4', at: 2.5 });
  assert.deepEqual(S.clean({ file: 'C:\\v\\a.mp4', at: 0 }), { file: 'C:\\v\\a.mp4', at: 0 });
  assert.equal(S.clean({ file: 'C:\\v\\a.mp4', at: -1 }), null);
  assert.equal(S.clean({ file: 'C:\\v\\a.mp4', at: NaN }), null);
  assert.equal(S.clean({ file: '', at: 1 }), null);
  assert.equal(S.clean(null), null);
});

test('the name offered says the moment; PNG unless the name ends in .jpg or .jpeg', () => {
  assert.equal(S.fileName('clip.mp4', 83.5, 'png'), 'clip 1m23.5s.png');
  assert.equal(S.fileName('clip.mp4', 2, 'jpg'), 'clip 2s.jpg');
  assert.equal(S.isJpeg('C:\\v\\a.JPG'), true);
  assert.equal(S.isJpeg('C:\\v\\a.jpeg'), true);
  assert.equal(S.isJpeg('C:\\v\\a.png'), false);
  const input = (f) => ['-i', f];
  const png = S.args({ file: 'C:\\v\\a.mp4', at: 2.5 }, 'C:\\v\\a.png.part', false, input);
  assert.deepEqual(png.slice(0, 7), ['-y', '-v', 'error', '-ss', '2.500', '-i', 'C:\\v\\a.mp4']);   // seek before reading
  assert.ok(png.join(' ').includes('-frames:v 1'));
  assert.ok(png.join(' ').includes('-f image2'));
  assert.ok(png.join(' ').includes('-c:v png'));
  assert.equal(png[png.length - 1], 'C:\\v\\a.png.part');
  assert.ok(S.args({ file: 'a.mp4', at: 0 }, 'a.jpg.part', true, input).join(' ').includes('-c:v mjpeg -q:v 2'));
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
test('a real frame: the whole picture at its own size, written whole or not at all', { skip: !ff.available() && 'FFmpeg is not in vendor/ffmpeg' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-snap-'));
  try {
    const clip = path.join(dir, 'clip.mp4');
    await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
    const kind = S.snapshotKind({ ffmpeg: ff }), ctx = { signal: new AbortController().signal, progress() {} };
    const out = path.join(dir, 'still.png');
    const r = await kind.run({ input: { file: clip, at: 1.2, out } }, ctx);
    assert.equal(r.path, out);
    const pic = fs.readFileSync(out);
    assert.equal(pic.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([pic.readUInt32BE(16), pic.readUInt32BE(20)], [320, 180]);
    assert.equal(fs.existsSync(out + '.part'), false);
    // Past the end there is no frame: it says so and leaves nothing behind.
    const late = path.join(dir, 'late.jpg');
    await assert.rejects(kind.run({ input: { file: clip, at: 30, out: late } }, ctx), /no picture at 30s/);
    assert.equal(fs.existsSync(late), false);
    assert.equal(fs.existsSync(late + '.part'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
