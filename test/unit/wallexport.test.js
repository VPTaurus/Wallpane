'use strict';
// Save the wall as a video: the video's size, checking the request, where the media sits in a tile, each tile's run of
// pieces (with made-up file details), FFmpeg's arguments, and a real video of a small wall (skipped without
// vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const V = require('../../renderer/lib/view');
const WV = require('../../renderer/lib/wallvideo');
const X = require('../../lib/wallexport');

const near = (a, b, d) => assert.ok(Math.abs(a - b) <= (d || 1e-6), a + ' is not ' + b);

test('the video takes the wall\'s shape: the short side as chosen, even sizes, the long side at most 4096', () => {
  assert.deepEqual(WV.outSize(1600, 900, 1080), { w: 1920, h: 1080 });
  assert.deepEqual(WV.outSize(900, 1600, 1080), { w: 1080, h: 1920 });
  assert.deepEqual(WV.outSize(1000, 1000, 720), { w: 720, h: 720 });
  assert.deepEqual(WV.outSize(1601, 901, 720), { w: 1280, h: 720 });
  const wide = WV.outSize(3200, 900, 2160);   // 32:9 at 4K would be 7680 wide
  assert.equal(wide.w, 4096);
  assert.equal(wide.h % 2, 0);
});

test('clean: sizes and lengths from the lists, tiles checked, music and hints kept in range', () => {
  const r = WV.clean({
    size: 999, secs: 7, wall: { w: 800, h: 450, bg: '#0E1218' },
    tiles: [{ file: 'a.mp4', kind: 'video', x: 0, y: 0, w: 400, h: 450, vol: 2, speed: 9, zoom: 0, mx: 3, at: -1, loopB: 4 }, { file: '', x: 0, y: 0, w: 1, h: 1 }, { file: 'b.png', x: 1, y: 1, w: 0, h: 5 }],
    music: { tracks: ['m.mp3', 3], at: 12, vol: 0.5 }, hints: { gain: { 'a.mp4': 0.5, 'b.mp4': 7 }, open: { 'a.mp4': { black: 1.5 } } }
  });
  assert.equal(r.size, 1080);
  assert.equal(r.secs, 30);
  assert.equal(r.wall.bg, '#0e1218');
  assert.equal(r.tiles.length, 1);
  assert.deepEqual([r.tiles[0].vol, r.tiles[0].speed, r.tiles[0].zoom, r.tiles[0].mx, r.tiles[0].at, r.tiles[0].loopA, r.tiles[0].loopB], [1, 4, 1, 1, 0, null, 4]);
  assert.deepEqual(r.music, { tracks: ['m.mp3'], at: 12, vol: 0.5 });
  assert.deepEqual(r.hints.gain, { 'a.mp4': 0.5 });
  assert.deepEqual(r.hints.open['a.mp4'], { black: 1.5, silence: 0 });
  assert.equal(WV.clean({ wall: { w: 800, h: 450 }, tiles: [] }), null);
});

test('placed: a filled tile shows the middle of a wider video over all of it; a whole frame sits between bars', () => {
  const cover = V.placed(400, 400, 16 / 9, 'cover', { mx: 0.5, my: 0.5, zoom: 1 });
  near(cover.crop.w, 9 / 16); near(cover.crop.x, (1 - 9 / 16) / 2); near(cover.crop.h, 1);
  assert.deepEqual(cover.dest, { x: 0, y: 0, w: 400, h: 400 });
  const whole = V.placed(400, 400, 16 / 9, 'contain', { mx: 0.5, my: 0.5, zoom: 1 });
  assert.deepEqual(whole.crop, { x: 0, y: 0, w: 1, h: 1 });
  near(whole.dest.y, 87.5); near(whole.dest.h, 225); near(whole.dest.w, 400);
  // Zoomed 2x on its left edge: the left half of the frame fills the tile.
  const zoomed = V.placed(400, 225, 16 / 9, 'cover', { mx: 0, my: 0.5, zoom: 2 });
  near(zoomed.crop.x, 0); near(zoomed.crop.w, 0.5); near(zoomed.crop.y, 0.25); near(zoomed.crop.h, 0.5);
  assert.deepEqual(zoomed.dest, { x: 0, y: 0, w: 400, h: 225 });
});

// Made-up files: name -> details.
const FILES = {
  'loop.mp4': { type: 'video', w: 1920, h: 1080, dur: 20, audio: true },
  'long.mp4': { type: 'video', w: 1280, h: 720, dur: 100, audio: true },
  'quiet.mp4': { type: 'video', w: 640, h: 360, dur: 8, audio: false },
  'pic.jpg': { type: 'image', w: 800, h: 600, dur: 0, audio: false },
  'spin.gif': { type: 'gif', w: 200, h: 200, dur: 1.5, audio: false },
  'song.mp3': { type: 'audio', w: 0, h: 0, dur: 4, audio: true }
};
const info = async (f) => FILES[f] || null;
function req(tiles, more) {
  return WV.clean(Object.assign({ size: 720, secs: 10, wall: { w: 1280, h: 720 }, tiles: tiles.map((t) => Object.assign({ x: 0, y: 0, w: 640, h: 360, kind: 'video' }, t)) }, more));
}
const frames = (run) => run.pieces.reduce((s, p) => s + p.frames, 0);

test('a looped part: from where the video is to the part\'s end, then the part again and again, 300 frames in all', async () => {
  const pl = await X.plan(req([{ file: 'loop.mp4', at: 5, loopA: 4, loopB: 6, vol: 0.5 }]), info);
  assert.deepEqual(pl.size, { w: 1280, h: 720 });
  const t = pl.tiles[0];
  assert.deepEqual(t.box, { x: 0, y: 0, w: 640, h: 360 });
  assert.equal(t.sound, true);
  assert.deepEqual([t.pieces[0].a, t.pieces[0].b, t.pieces[0].frames], [5, 6, 30]);
  assert.deepEqual([t.pieces[1].a, t.pieces[1].b, t.pieces[1].frames], [4, 6, 60]);
  assert.equal(frames(t), 300);
  assert.equal(t.pieces.length, 6);
  assert.equal(t.pieces[5].frames, 30);
  near(t.pieces[5].b, 5);   // the last part cut to the video's end
  assert.equal(t.pieces[0].vol, 0.5);
});

test('Repeat starts again after a black opening; played once, the last frame stays; speed shortens the parts', async () => {
  const rep = await X.plan(req([{ file: 'quiet.mp4', at: 7 }], { hints: { open: { 'quiet.mp4': { black: 1 } } } }), info);
  const p = rep.tiles[0].pieces;
  assert.deepEqual([p[0].a, p[0].b, p[0].frames], [7, 8, 30]);
  assert.deepEqual([p[1].a, p[1].b, p[1].frames], [1, 8, 210]);
  assert.equal(rep.tiles[0].sound, false);   // a video with no sound is not heard
  const once = await X.plan(req([{ file: 'quiet.mp4', at: 6, repeat: false }]), info);
  assert.deepEqual([once.tiles[0].pieces.length, once.tiles[0].pieces[0].a, once.tiles[0].pieces[0].b, once.tiles[0].pieces[0].frames], [1, 6, 8, 300]);
  const fast = await X.plan(req([{ file: 'long.mp4', at: 0, speed: 2 }]), info);
  assert.deepEqual([fast.tiles[0].pieces[0].a, fast.tiles[0].pieces[0].b, fast.tiles[0].pieces[0].frames], [0, 20, 300]);
});

test('a picture holds; a GIF goes round from its start; the even-loudness gain applies to the volume', async () => {
  const pl = await X.plan(req([{ file: 'pic.jpg', kind: 'image' }, { file: 'spin.gif', kind: 'image', x: 640 }, { file: 'long.mp4', vol: 0.8, y: 360 }], { hints: { gain: { 'long.mp4': 0.5 } } }), info);
  assert.deepEqual(pl.tiles[0].pieces.map((p) => p.frames), [300]);
  assert.deepEqual(pl.tiles[1].pieces.slice(0, 2).map((p) => [p.a, p.b, p.frames]), [[0, 1.5, 45], [0, 1.5, 45]]);
  assert.equal(frames(pl.tiles[1]), 300);
  assert.equal(pl.tiles[1].box.x, 640);
  near(pl.tiles[2].pieces[0].vol, 0.4);
  // 800 x 600 in a 640 x 360 tile, filled: the middle of the picture, top and bottom cut.
  near(pl.tiles[0].pieces[0].crop.h, 0.75);
  near(pl.tiles[0].pieces[0].crop.y, 0.125);
});

test('two tiles sharing a playlist take its files in turn, each when its own turn ends', async () => {
  const playlist = { name: 'P', files: [{ path: 'quiet.mp4', name: 'quiet.mp4', kind: 'video' }, { path: 'pic.jpg', name: 'pic.jpg', kind: 'image' }, { path: 'spin.gif', name: 'spin.gif', kind: 'image' }, { path: 'long.mp4', name: 'long.mp4', kind: 'video' }],
    shuffle: false, secs: 3, maxClip: 5, order: [0, 1, 2, 3], pos: 2 };
  const pl = await X.plan(req([
    { file: 'quiet.mp4', at: 1, used: 1, pl: 'k' },               // 4 s of its 5 s clip left
    { file: 'pic.jpg', kind: 'image', used: 2, pl: 'k', x: 640 }  // 1 s of its 3 s left
  ], { playlists: { k: playlist } }), info);
  const a = pl.tiles[0].pieces, b = pl.tiles[1].pieces;
  assert.deepEqual([a[0].file, a[0].a, a[0].b, a[0].frames], ['quiet.mp4', 1, 5, 120]);
  assert.deepEqual([b[0].file, b[0].frames], ['pic.jpg', 30]);
  // The picture's tile is free first (at 1 s): the GIF, for 3 s (two rounds); then at 4 s the video's tile: long.mp4
  // for its 5 s clip; then at 4 s the GIF's tile: the next round, from quiet.mp4.
  assert.deepEqual(b.slice(1, 3).map((p) => [p.file, p.frames]), [['spin.gif', 45], ['spin.gif', 45]]);
  assert.deepEqual([a[1].file, a[1].a, a[1].b, a[1].frames], ['long.mp4', 0, 5, 150]);
  assert.deepEqual([b[3].file, b[3].a, b[3].b], ['quiet.mp4', 0, 5]);
  assert.equal(frames(pl.tiles[0]), 300);
  assert.equal(frames(pl.tiles[1]), 300);
});

test('the music: from where it is, then the next tracks, at its volume; none at volume 0', async () => {
  const pl = await X.plan(req([{ file: 'pic.jpg', kind: 'image' }], { music: { tracks: ['song.mp3', 'gone.mp3', 'song.mp3'], at: 3, vol: 0.6 } }), info);
  assert.deepEqual(pl.music.map((p) => [p.a, p.b, p.frames]), [[3, 4, 30], [0, 4, 120], [0, 4, 120], [0, 1, 30]]);
  assert.equal(pl.music[0].vol, 0.6);
  assert.equal((await X.plan(req([{ file: 'pic.jpg', kind: 'image' }], { music: { tracks: ['song.mp3'], at: 0, vol: 0 } }), info)).music, null);
});

test('FFmpeg\'s arguments: the sound\'s speed in steps, a crop only when cropped, silence for a heard tile\'s quiet file', () => {
  assert.deepEqual(X.tempo(1), []);
  assert.deepEqual(X.tempo(0.25), ['atempo=0.5', 'atempo=0.5']);
  assert.deepEqual(X.tempo(4), ['atempo=2', 'atempo=2']);
  assert.deepEqual(X.tempo(1.5), ['atempo=1.5']);
  const input = (f) => ['-i', f];
  const whole = { x: 0, y: 0, w: 1, h: 1 }, box = { x: 0, y: 0, w: 640, h: 360 };
  const quiet = X.pieceArgs({ type: 'video', a: 2, b: 4, frames: 60, speed: 1, audio: false, vol: 0, crop: whole, dest: { x: 0, y: 0, w: 640, h: 360 } }, box, true, 'q.mp4', 'p0.mkv', input).join(' ');
  assert.ok(quiet.startsWith('-y -v error -ss 2.000 -t 2.000 -i q.mp4 -f lavfi -i anullsrc'));
  assert.ok(!quiet.includes('crop='));
  assert.ok(quiet.includes('-frames:v 60'));
  assert.ok(quiet.includes('[1:a]atrim=end=2.0000[a]'));
  const pic = X.pieceArgs({ type: 'image', a: 0, b: 0, frames: 90, speed: 1, audio: false, vol: 0, crop: { x: 0, y: 0.2, w: 1, h: 0.6 }, dest: { x: 0, y: 0, w: 640, h: 360 } }, box, false, 'p.jpg', 'p1.mkv', input).join(' ');
  assert.ok(pic.startsWith('-y -v error -i p.jpg -filter_complex'));
  assert.ok(pic.includes('crop=w=iw*1:h=ih*0.6:x=iw*0:y=ih*0.2'));
  assert.ok(pic.includes('loop=loop=-1:size=1'));
  assert.ok(pic.includes('-an'));
  assert.equal(X.listText(["p0.mkv", "it's.mkv"]), "ffconcat version 1.0\nfile 'p0.mkv'\nfile 'it'\\''s.mkv'\n");
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
test('a real video of a small wall: its size and length, sound, and nothing left behind', { skip: !ff.available() && 'FFmpeg is not in vendor/ffmpeg', timeout: 240000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-wallvideo-'));
  try {
    const make = (name, args) => ff.run('ffmpeg', ['-y', '-v', 'error'].concat(args, [path.join(dir, name)]), { timeoutMs: 60000 });
    await make('clip.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
    await make('pic.png', ['-f', 'lavfi', '-i', 'testsrc=size=300x200', '-frames:v', '1']);
    await make('song.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:a', 'aac']);
    const job = { input: { out: path.join(dir, 'wall.mp4'), req: {
      size: 720, secs: 10, wall: { w: 800, h: 450, bg: '#203040' },
      tiles: [
        { file: path.join(dir, 'clip.mp4'), kind: 'video', x: 10, y: 10, w: 385, h: 430, at: 1, loopA: 1, loopB: 3, vol: 1 },
        { file: path.join(dir, 'pic.png'), kind: 'image', x: 405, y: 10, w: 385, h: 430, fit: 'contain' }
      ],
      music: { tracks: [path.join(dir, 'song.m4a')], at: 1, vol: 0.5 }
    } } };
    let last = 0;
    const kind = X.wallVideoKind({ ffmpeg: ff, cache: null, tmp: path.join(dir, 'tmp') });
    const r = await kind.run(job, { signal: new AbortController().signal, progress(v) { last = v; } });
    assert.equal(r.tiles, 2);
    const probe = await ff.probeRaw(r.path);
    const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio');
    assert.deepEqual([v.codec_name, v.width, v.height], ['h264', 1280, 720]);
    assert.ok(a, 'it has sound');
    near(parseFloat(probe.format.duration), 10, 0.15);
    assert.ok(last > 0.9);
    assert.equal(fs.existsSync(path.join(dir, 'tmp')), false);
    assert.equal(fs.existsSync(path.join(dir, 'wall.part.mp4')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
