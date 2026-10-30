'use strict';
// Library folders: scanning, picture sizes from their first bytes, and keeping the library in step with real folders,
// with media FFmpeg makes for the test (those parts are skipped without vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const FF = require('../../lib/ffmpeg');
const files = require('../../lib/files');
const formats = require('../../renderer/lib/formats');
const { imageSize, orientation } = require('../../lib/imagesize');
const { createLibrary } = require('../../lib/library');
const { createLibraryFolders, infoFromProbe } = require('../../lib/libraryfolders');
const { createJobs } = require('../../lib/jobs');
const { createWatchers } = require('../../lib/watch');

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));
async function until(fn, ms) {
  const end = Date.now() + (ms || 5000);
  while (!fn()) { if (Date.now() > end) return false; await tick(50); }
  return true;
}
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-libf-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// A solid grey PNG of the given size, without FFmpeg.
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.alloc(1 + w, 128)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// The JPEG with an EXIF orientation tag (as a phone writes it), in Intel or Motorola byte order.
function withOrientation(jpg, o, le) {
  const t = Buffer.alloc(26), u16 = (v, at) => (le ? t.writeUInt16LE(v, at) : t.writeUInt16BE(v, at)), u32 = (v, at) => (le ? t.writeUInt32LE(v, at) : t.writeUInt32BE(v, at));
  t.write(le ? 'II' : 'MM', 0, 'latin1'); u16(42, 2); u32(8, 4);
  u16(1, 8); u16(0x0112, 10); u16(3, 12); u32(1, 14); u16(o, 18); u32(0, 22);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]), seg = Buffer.from([0xff, 0xe1, 0, 0]);
  seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), seg, body, jpg.subarray(2)]);
}
async function make(out, args) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ff.run('ffmpeg', ['-y', '-v', 'error'].concat(args, [out]), { timeoutMs: 60000 });
  return out;
}
const still = (size) => ['-f', 'lavfi', '-i', 'testsrc=size=' + size + ':rate=1:duration=1', '-frames:v', '1'];

test('picture sizes from the first bytes: PNG, GIF, JPEG (turned as its camera says), WebP, BMP', { skip }, async () => {
  const p = path.join(dir, 'sizes');
  assert.deepEqual(await imageSize(await make(path.join(p, 'a.png'), still('241x181'))), { w: 241, h: 181 });
  assert.deepEqual(await imageSize(await make(path.join(p, 'a.gif'), still('241x181'))), { w: 241, h: 181 });
  assert.deepEqual(await imageSize(await make(path.join(p, 'a.bmp'), still('241x181'))), { w: 241, h: 181 });
  // The kinds of WebP: lossy (VP8), lossless (VP8L), and the extended format (VP8X) of transparent or moving ones.
  const webp = async (name, args, chunk) => {
    const f = await make(path.join(p, name), args);
    assert.equal(fs.readFileSync(f).toString('latin1', 12, 16), chunk);
    assert.deepEqual(await imageSize(f), { w: 241, h: 181 }, name);
  };
  await webp('lossy.webp', still('241x181'), 'VP8 ');
  await webp('lossless.webp', still('241x181').concat(['-lossless', '1']), 'VP8L');
  await webp('alpha.webp', ['-f', 'lavfi', '-i', 'color=c=red@0.5:size=241x181:duration=1,format=rgba', '-frames:v', '1', '-pix_fmt', 'yuva420p'], 'VP8X');
  await webp('anim.webp', ['-f', 'lavfi', '-i', 'testsrc=size=241x181:rate=5:duration=1', '-c:v', 'libwebp_anim', '-loop', '0'], 'VP8X');
  const jpg = await make(path.join(p, 'a.jpg'), still('300x200'));
  assert.deepEqual(await imageSize(jpg), { w: 300, h: 200 });
  for (const le of [true, false]) {
    fs.writeFileSync(path.join(p, 'turned.jpg'), withOrientation(fs.readFileSync(jpg), 6, le));
    assert.deepEqual(await imageSize(path.join(p, 'turned.jpg')), { w: 200, h: 300 }, 'a portrait phone photo is taller than wide');
    fs.writeFileSync(path.join(p, 'upside.jpg'), withOrientation(fs.readFileSync(jpg), 3, le));
    assert.deepEqual(await imageSize(path.join(p, 'upside.jpg')), { w: 300, h: 200 }, 'upside down is still wide');
  }
  fs.writeFileSync(path.join(p, 'not.png'), 'just text');
  assert.equal(await imageSize(path.join(p, 'not.png')), null);
  assert.equal(orientation(Buffer.from('nothing here at all')), 0);
});

test('a folder scan finds media in every subfolder, with sizes and times; a missing folder is not there', async () => {
  const root = path.join(dir, 'scan');
  fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'one.png'), png(4, 3));
  fs.writeFileSync(path.join(root, 'a', 'b', 'two.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'a', 'old.avi'), 'x');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(root, '.hidden', 'secret.mp4'), 'x');
  const r = await files.scan(root, (p) => !!formats.kindOfName(p, true));
  assert.equal(r.ok, true);
  assert.deepEqual(r.entries.map((e) => path.relative(root, e.path)).sort(), [path.join('a', 'b', 'two.mp4'), path.join('a', 'old.avi'), 'one.png']);
  const one = r.entries.find((e) => e.path.endsWith('one.png'));
  assert.equal(one.size, fs.statSync(path.join(root, 'one.png')).size);
  assert.equal(one.mtime, Math.round(fs.statSync(path.join(root, 'one.png')).mtimeMs));
  assert.deepEqual(r.unread, []);
  assert.equal((await files.scan(root, (p) => !!formats.kindOfName(p, false))).entries.length, 2, 'without FFmpeg, no AVI');
  assert.equal((await files.scan(root, () => true, { max: 2 })).truncated, true);
  assert.deepEqual(await files.scan(path.join(root, 'gone'), () => true), { ok: false, entries: [], unread: [] });
});

test('what ffprobe says, as the library keeps it', () => {
  const d = { container: 'avi', duration: 12.345, video: { codec: 'mpeg4', width: 640, height: 480, rotation: 0, fps: 25 }, audio: { codec: 'mp3', channels: 2 } };
  assert.deepEqual(infoFromProbe(d, 'video'), { w: 640, h: 480, rot: 0, v: 'mpeg4', play: 'convert', dur: 12.35, fps: 25, a: 'mp3' });
  assert.deepEqual(infoFromProbe(d, 'image'), { w: 640, h: 480 });
  assert.deepEqual(infoFromProbe({ duration: 3, video: null, audio: { codec: 'aac' } }, 'video'), { err: 'No picture in this file' });
});

test('library folders: added, read in the background, watched, and kept while their drive is away', { skip }, async () => {
  const media = path.join(dir, 'Library media');
  await make(path.join(media, 'clip.mp4'), ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=1', '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
  await make(path.join(media, 'old', 'old.avi'), ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=1', '-c:v', 'mpeg4']);
  await make(path.join(media, 'anim.gif'), ['-f', 'lavfi', '-i', 'testsrc=size=120x90:rate=10:duration=2']);
  const jpg = await make(path.join(media, 'photo.jpg'), still('300x200'));
  fs.writeFileSync(path.join(media, 'phone.jpg'), withOrientation(fs.readFileSync(jpg), 6, true));
  fs.writeFileSync(path.join(media, 'broken.png'), 'not a picture');

  const library = createLibrary({ file: path.join(dir, 'library.json'), delay: 1e6, maxWait: 1e6 });
  let lf = null, told = 0;
  const watchers = createWatchers({ notify: (_owner, root) => lf.onChanged(root), delay: 100 });
  const jobs = createJobs({ kinds: { libinfo: { heavy: false, run: (j, ctx) => lf.infoKind.run(j, ctx) } } });
  lf = createLibraryFolders({
    library, watchers, jobs, notify: () => told++,
    scan: (d) => files.scan(d, (p) => !!formats.kindOfName(p, true)),
    imageSize, gifSeconds: async (p) => files.gifSeconds(fs.readFileSync(p)),
    probeRaw: ff.probeRaw, canProbe: ff.available
  });
  try {
    const r = await lf.add(media);
    assert.equal(r.status, 'added');
    let [f] = lf.folders();
    assert.deepEqual([f.files, f.available, f.scanning], [6, true, false]);
    assert.ok(told >= 2, 'the windows heard that the scan started and ended');

    await jobs.idle();
    const info = (n) => library.find(path.join(media, n));
    assert.deepEqual([info('clip.mp4').w, info('clip.mp4').h, info('clip.mp4').v, info('clip.mp4').a, info('clip.mp4').play], [320, 240, 'h264', 'aac', 'none']);
    assert.ok(Math.abs(info('clip.mp4').dur - 1) < 0.2);
    assert.equal(info(path.join('old', 'old.avi')).play, 'convert');
    assert.deepEqual([info('anim.gif').w, info('anim.gif').h], [120, 90]);
    assert.ok(Math.abs(info('anim.gif').dur - 2) < 0.2, 'a GIF knows its length');
    assert.deepEqual([info('phone.jpg').w, info('phone.jpg').h], [200, 300]);
    assert.ok(info('broken.png').err, 'a file that cannot be read says why, and is not read again');
    assert.equal(lf.folders()[0].pending, 0);
    assert.deepEqual(library.query({ shape: 'portrait' }).items.map((i) => i.name), ['phone.jpg']);

    // A new file is noticed by the watcher.
    fs.writeFileSync(path.join(media, 'new.png'), png(30, 20));
    assert.ok(await until(() => info('new.png')), 'the new picture came in by itself');
    await until(() => info('new.png').w);
    await jobs.idle();
    assert.deepEqual([info('new.png').w, info('new.png').h], [30, 20]);

    // The drive goes away (here: the folder is renamed, with watching stopped, as Windows will not rename a watched
    // folder): the files stay, and come back with the folder.
    lf.stop();
    fs.renameSync(media, media + ' away');
    await lf.rescan(media);
    [f] = lf.folders();
    assert.deepEqual([f.available, f.files], [false, 7]);
    fs.renameSync(media + ' away', media);
    await lf.rescan(media);
    [f] = lf.folders();
    assert.deepEqual([f.available, f.files], [true, 7]);

    assert.equal(lf.remove(media), 7);
    assert.deepEqual(lf.folders(), []);
  } finally {
    lf.stop();
    watchers.closeAll();
  }
});

test('without FFmpeg, pictures still get their sizes; videos wait', async () => {
  const media = path.join(dir, 'No FFmpeg');
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, 'pic.png'), png(40, 30));
  fs.writeFileSync(path.join(media, 'clip.mp4'), 'x');
  const library = createLibrary({ file: path.join(dir, 'lite.json'), convertible: false, delay: 1e6, maxWait: 1e6 });
  let lf = null;
  const jobs = createJobs({ kinds: { libinfo: { heavy: false, run: (j, ctx) => lf.infoKind.run(j, ctx) } } });
  lf = createLibraryFolders({
    library, jobs, watchers: { set: () => 0 },
    scan: (d) => files.scan(d, (p) => !!formats.kindOfName(p, false)),
    imageSize, probeRaw: () => { throw new Error('no FFmpeg here'); }, canProbe: () => false
  });
  await lf.add(media);
  await jobs.idle();
  assert.deepEqual([library.find(path.join(media, 'pic.png')).w, library.find(path.join(media, 'pic.png')).h], [40, 30]);
  assert.equal(library.find(path.join(media, 'clip.mp4')).w, undefined);
  assert.equal(lf.folders()[0].pending, 1);
});
