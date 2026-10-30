'use strict';
// FFmpeg itself: these tests make their own clips with FFmpeg's built-in sources, then read and judge them. They
// need vendor/ffmpeg (npm run fetch-ffmpeg) and are skipped without it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const MI = require('../../lib/mediainfo');

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-ff-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// A short test clip: picture (and a tone) from FFmpeg's own sources, in the given container and codecs.
async function clip(name, vcodec, acodec, extra) {
  const out = path.join(dir, name);
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=1']
    .concat(acodec ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', acodec] : [])
    .concat(['-c:v', vcodec], extra || [], [out]);
  await ff.run('ffmpeg', args, { timeoutMs: 60000 });
  return out;
}

test('ffprobe reads what a clip holds', { skip }, async () => {
  const f = await clip('a.mp4', 'libx264', 'aac', ['-pix_fmt', 'yuv420p']);
  const info = MI.describe(await ff.probeRaw(f));
  assert.equal(info.video.codec, 'h264');
  assert.deepEqual([info.video.width, info.video.height, info.video.fps], [320, 240, 25]);
  assert.equal(info.audio.codec, 'aac');
  assert.ok(info.duration > 0.9 && info.duration < 1.2);
  assert.equal(MI.verdict(info).action, 'none');
});

test('the cheapest fix for each kind of unplayable file', { skip }, async () => {
  const judge = async (f) => MI.verdict(MI.describe(await ff.probeRaw(f))).action;
  assert.equal(await judge(await clip('b.avi', 'libx264', 'libmp3lame', ['-pix_fmt', 'yuv420p'])), 'remux', 'H.264 in AVI: only the container');
  assert.equal(await judge(await clip('c.mkv', 'libx264', 'ac3', ['-pix_fmt', 'yuv420p'])), 'audio', 'AC3 sound in MKV');
  assert.equal(await judge(await clip('d.avi', 'mpeg4', 'ac3')), 'convert', 'DivX-style MPEG-4 in AVI');
  assert.equal(await judge(await clip('e.webm', 'libvpx-vp9', 'libopus')), 'none');
});

test('progress, cancel, and no network addresses', { skip }, async () => {
  const seen = [];
  const ctl = new AbortController();
  const long = ff.run('ffmpeg', ['-v', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-t', '30', '-f', 'null', '-', '-progress', 'pipe:1'],
    { signal: ctl.signal, onProgress: (s) => { seen.push(s); if (s > 0.5) ctl.abort(); } });
  await assert.rejects(long, (e) => e.code === 'CANCELLED');
  assert.ok(seen.length > 0, 'progress was reported');
  await assert.rejects(ff.run('ffprobe', FF.input('https://example.com/a.mp4')), /not a local file/);
  await assert.rejects(ff.probeRaw(path.join(dir, 'missing.mp4')), (e) => e.code === 'FAILED');
});
