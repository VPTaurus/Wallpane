'use strict';
// Recording the wall live: Settings › Recording checked, the size and bit rate they give, and the main process
// writing the recorder's pieces as they come and tidying the file at the end (with FFmpeg when it is there).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const WV = require('../../renderer/lib/wallvideo');
const { createRecordings } = require('../../lib/recfile');

test('Settings › Recording: kept in range, 1080p, 30 frames, high quality and sound by default', () => {
  assert.deepEqual(WV.cleanRec(null), { size: 1080, fps: 30, quality: 'high', sound: true, dir: null });
  assert.deepEqual(WV.cleanRec({ size: 0, fps: 60, quality: 'best', sound: false, dir: 'D:\\Rec' }), { size: 0, fps: 60, quality: 'best', sound: false, dir: 'D:\\Rec' });
  assert.deepEqual(WV.cleanRec({ size: 999, fps: 24, quality: 'huge', dir: '' }), { size: 1080, fps: 30, quality: 'high', sound: true, dir: null });
});

test('the size: as on screen in screen pixels, or the short side chosen in the wall\'s shape; the bit rate by quality', () => {
  assert.deepEqual(WV.recSize(1600, 900, 1.5, 0), { w: 2400, h: 1350 });
  assert.deepEqual(WV.recSize(1601, 901, 1, 0), { w: 1602, h: 902 });
  assert.deepEqual(WV.recSize(3000, 1000, 2, 0), { w: 4096, h: 1366 });   // at most 4096 on the long side
  assert.deepEqual(WV.recSize(1600, 900, 2, 720), { w: 1280, h: 720 });
  assert.equal(WV.recBitrate(1920, 1080, 30, 'high'), Math.round(1920 * 1080 * 30 * 0.12));
  assert.ok(WV.recBitrate(1920, 1080, 30, 'standard') < WV.recBitrate(1920, 1080, 30, 'best'));
  assert.equal(WV.recBitrate(320, 180, 30, 'standard'), 1e6);
  assert.equal(WV.recBitrate(4096, 2304, 60, 'best'), 8e7);
});

test('the pieces are written in turn to a .part file, renamed at the end without FFmpeg; nothing written leaves nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-rec-'));
  try {
    const recs = createRecordings({ ffmpeg: null }), out = path.join(dir, 'Wallpane 1.mp4');
    await recs.start(7, out);
    assert.equal(recs.recording(7), true);
    assert.ok(fs.existsSync(path.join(dir, 'Wallpane 1.part.mp4')));
    const a = recs.write(7, Buffer.from('abc')), b = recs.write(7, Buffer.from('def'));
    assert.deepEqual(await b, { bytes: 6 });
    assert.deepEqual(await a, { bytes: 3 });   // each answers once its own piece is written
    const r = await recs.stop(7);
    assert.deepEqual(r, { status: 'saved', path: out, bytes: 6, error: null });
    assert.equal(fs.readFileSync(out, 'utf8'), 'abcdef');
    assert.equal(fs.existsSync(path.join(dir, 'Wallpane 1.part.mp4')), false);
    assert.equal(recs.recording(7), false);
    assert.equal(await recs.stop(7), null);
    assert.deepEqual(await recs.write(7, Buffer.from('x')), { error: 'Nothing is being recorded.' });
    await recs.start(8, path.join(dir, 'Wallpane 2.mp4'));
    assert.deepEqual(await recs.stop(8), { status: 'empty' });
    assert.deepEqual(fs.readdirSync(dir), ['Wallpane 1.mp4']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
test('with FFmpeg, a fragmented MP4 like the recorder\'s becomes an ordinary one with its length, unchanged inside', { skip: !ff.available() && 'FFmpeg is not in vendor/ffmpeg' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-rec-'));
  try {
    const frag = path.join(dir, 'frag.mp4');
    await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=duration=3',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', frag], { timeoutMs: 60000 });
    const recs = createRecordings({ ffmpeg: ff }), out = path.join(dir, 'Wallpane.mp4'), bytes = fs.readFileSync(frag);
    await recs.start(1, out);
    for (let i = 0; i < bytes.length; i += 4096) recs.write(1, bytes.subarray(i, i + 4096));
    const r = await recs.stop(1);
    assert.equal(r.status, 'saved');
    const info = await ff.probeRaw(out);
    assert.deepEqual(info.streams.map((s) => s.codec_name).sort(), ['aac', 'h264']);
    assert.ok(Math.abs(parseFloat(info.format.duration) - 3) < 0.2);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['Wallpane.mp4', 'frag.mp4']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
