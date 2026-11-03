'use strict';
// Save the part as MP4: checking the request, which kind of file it becomes, FFmpeg's arguments, and real cuts of
// clips FFmpeg makes for the test (skipped without vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const C = require('../../lib/cutpart');
const mediainfo = require('../../lib/mediainfo');

test('clean keeps a part, refuses a broken one', () => {
  assert.deepEqual(C.clean({ file: 'C:\\v\\a.mp4', start: 1.5, end: 4, extra: 1 }), { file: 'C:\\v\\a.mp4', start: 1.5, end: 4 });
  assert.equal(C.clean({ file: 'C:\\v\\a.mp4', start: 4, end: 4 }), null);
  assert.equal(C.clean({ file: 'C:\\v\\a.mp4', start: -1, end: 4 }), null);
  assert.equal(C.clean({ file: '', start: 0, end: 4 }), null);
  assert.equal(C.clean(null), null);
});

test('an MP4 when the picture and sound go into one, else the video\'s own kind of file', () => {
  const info = (v, a) => ({ video: v ? { codec: v } : null, audio: a ? { codec: a } : null });
  assert.equal(C.extFor(info('h264', 'aac'), 'C:\\v\\a.mkv'), 'mp4');
  assert.equal(C.extFor(info('vp9', 'opus'), 'C:\\v\\a.webm'), 'mp4');
  assert.equal(C.extFor(info('hevc', null), 'C:\\v\\a.mov'), 'mp4');
  assert.equal(C.extFor(info('vp8', 'vorbis'), 'C:\\v\\a.WEBM'), 'webm');
  assert.equal(C.extFor(info('wmv3', 'wmav2'), 'C:\\v\\a.wmv'), 'wmv');
  assert.equal(C.extFor(info('vp8', 'vorbis'), 'C:\\v\\noext'), 'mkv');
  assert.equal(C.partName('C:\\v\\clip 1m-2m.mp4'), 'C:\\v\\clip 1m-2m.part.mp4');
});

test("FFmpeg's arguments: seek to the part, copy, start at 0; an MP4 has its index first", () => {
  const a = C.args({ file: 'C:\\v\\a.mp4', start: 3.3, end: 6 }, 'C:\\o\\x.part.mp4', FF.input);
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4), ['-ss', '3.300', '-to', '6.000']);
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'), 'seeks before reading');
  assert.deepEqual(a.slice(a.indexOf('-c'), a.indexOf('-c') + 2), ['-c', 'copy']);
  assert.ok(a.includes('make_zero') && a.includes('+faststart'));
  assert.ok(!C.args({ file: 'a.webm', start: 0, end: 1 }, 'x.part.webm', FF.input).includes('+faststart'));
  const e = C.encodeArgs({ file: 'C:\\v\\a.mp4', start: 3.3, end: 6 }, 'C:\\o\\x.part.mp4', FF.input, FF.ENCODERS[FF.ENCODERS.length - 1]);
  assert.ok(e.includes('libx264') && e.includes('aac') && !e.includes('copy') && e.join(' ').includes('format=yuv420p'));
});

test('copied when the keyframe before the part is near, else re-encoded into an MP4', () => {
  const vp8 = { video: { codec: 'vp8' }, audio: { codec: 'vorbis' } };
  assert.deepEqual(C.plan(vp8, 'a.webm', 9.6, 10), { mode: 'copy', ext: 'webm', keyGap: 0.40000000000000036 });
  assert.deepEqual(C.plan(vp8, 'a.webm', 5, 10), { mode: 'encode', ext: 'mp4', keyGap: 5 });
  assert.deepEqual(C.plan(null, 'a.mp4', null, 10), { mode: 'copy', ext: 'mp4', keyGap: null }, 'keyframe not known');
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-cut-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
// A 6 s clip with a keyframe every 2 s, and sound.
async function clip(name, codecs) {
  const file = path.join(dir, name);
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6']
    .concat(codecs, ['-g', '50', '-shortest', file]), { timeoutMs: 60000 });
  return file;
}
const run = (input) => C.cutPartKind({ ffmpeg: ff }).run({ input }, { signal: new AbortController().signal, progress() {} });

let h264;
const h264Clip = () => (h264 = h264 || clip('h264.mkv', ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-keyint_min', '50', '-sc_threshold', '0', '-c:a', 'aac']));

test('the keyframe at or before a time', { skip }, async () => {
  const src = await h264Clip();
  assert.equal(await C.keyframeBefore(ff, src, 3.3), 2);
  assert.equal(await C.keyframeBefore(ff, src, 4), 4);
  assert.equal(await C.keyframeBefore(ff, src, 0), 0);
});

test('a part copied into an MP4 starts on the keyframe before it and ends where it ends', { skip }, async () => {
  const src = await h264Clip();
  assert.equal(C.extFor(mediainfo.describe(await ff.probeRaw(src)), src), 'mp4');
  const out = path.join(dir, 'part.mp4');
  const r = await run({ file: src, start: 3.3, end: 5, out, mode: 'copy' });
  assert.equal(r.path, out);
  assert.equal(r.early, 1.3, 'from the keyframe at 2 s');
  assert.equal(r.encoded, false);
  assert.ok(r.bytes > 0 && !fs.existsSync(C.partName(out)));
  const info = mediainfo.describe(await ff.probeRaw(out));
  assert.deepEqual([info.video.codec, info.audio.codec], ['h264', 'aac']);
  assert.ok(Math.abs(info.duration - 3) < 0.1, String(info.duration));
});

test('a part re-encoded starts and ends exactly on the part', { skip }, async () => {
  const out = path.join(dir, 'exact.mp4');
  const r = await run({ file: await h264Clip(), start: 3.3, end: 4.3, out, mode: 'encode', keyGap: 1.3 });
  assert.deepEqual([r.encoded, r.early, r.keyGap], [true, 0, 1.3]);
  const info = mediainfo.describe(await ff.probeRaw(out));
  assert.deepEqual([info.video.codec, info.audio.codec], ['h264', 'aac']);
  assert.ok(Math.abs(info.duration - 1) < 0.1, String(info.duration));
  assert.ok(!fs.existsSync(C.partName(out)));
});

test("an older WebM (VP8, Vorbis) stays a WebM, still copied; a failed cut leaves nothing", { skip }, async () => {
  const src = await clip('old.webm', ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis']);
  assert.equal(C.extFor(mediainfo.describe(await ff.probeRaw(src)), src), 'webm');
  const r = await run({ file: src, start: 2, end: 4, out: path.join(dir, 'part.webm') });
  assert.equal(r.early, 0, 'on a keyframe');
  assert.deepEqual(mediainfo.describe(await ff.probeRaw(r.path)).video.codec, 'vp8');
  const bad = path.join(dir, 'bad.mp4');
  await assert.rejects(run({ file: src, start: 2, end: 4, out: bad }));
  assert.ok(!fs.existsSync(bad) && !fs.existsSync(C.partName(bad)));
});
