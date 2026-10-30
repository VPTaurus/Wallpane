'use strict';
// Library thumbnails: the FFmpeg arguments, and the real thing on media FFmpeg makes for the test (skipped without
// vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const files = require('../../lib/files');
const formats = require('../../renderer/lib/formats');
const { imageSize } = require('../../lib/imagesize');
const { createCache } = require('../../lib/cache');
const { createJobs } = require('../../lib/jobs');
const { createLibrary } = require('../../lib/library');
const { createLibraryFolders } = require('../../lib/libraryfolders');
const { createThumbs, thumbArgs } = require('../../lib/thumbs');

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-thumbs-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('the arguments: a quick look into the video, its most typical frame, never larger than the original, WebP', () => {
  const v = thumbArgs('video', 'D:\\clip.mp4', 'C:\\c\\t.webp.part', { at: 12.345 });
  assert.deepEqual(v.slice(v.indexOf('-ss'), v.indexOf('-ss') + 2), ['-ss', '12.35']);
  assert.ok(v.indexOf('-ss') < v.indexOf('-i'), 'the look comes before the input, which is quick');
  assert.ok(v.includes('-protocol_whitelist'), 'local files only');
  const vf = v[v.indexOf('-vf') + 1];
  assert.ok(vf.includes('thumbnail=n=40') && vf.includes('min(360,iw)') && vf.startsWith('scale=iw*sar:ih'));
  assert.deepEqual(v.slice(-3), ['-f', 'webp', 'C:\\c\\t.webp.part']);
  const i = thumbArgs('image', 'D:\\a.jpg', 'o');
  assert.ok(!i.includes('-ss') && !i[i.indexOf('-vf') + 1].includes('thumbnail'));
  assert.ok(!thumbArgs('video', 'D:\\a.mp4', 'o', { at: 0 }).includes('-ss'));
});

test('a thumbnail asked for while the background round is already making it still reaches the window', async () => {
  // An FFmpeg stand-in whose runs end when the test says so, writing a small file where the thumbnail goes.
  const open = [];
  const fake = {
    available: () => true,
    run: (tool, args) => new Promise((res) => { open.push(() => { fs.writeFileSync(args[args.length - 1], 'webp'); res({ code: 0 }); }); })
  };
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-thumbrace-')), media = path.join(d, 'media');
  const cache = createCache(path.join(d, 'cache'));
  const library = createLibrary({ file: path.join(d, 'library.json'), delay: 1e6, maxWait: 1e6 });
  library.addFolder(media);
  library.sync(media, [{ path: path.join(media, 'a.png'), size: 1, mtime: 1 }, { path: path.join(media, 'b.png'), size: 2, mtime: 2 }]);
  library.all().forEach((e) => library.setInfo(e.id, { w: 10, h: 10 }));
  const told = [];
  let th = null;
  const jobs = createJobs({ kinds: { libthumbs: { heavy: false, run: (j, ctx) => th.kind.run(j, ctx) } } });
  th = createThumbs({ library, cache, ffmpeg: fake, jobs, notify: (m) => told.push(m), notifyEvery: 5 });
  const a = library.find(path.join(media, 'a.png')).id;

  th.queue();                                   // the background round: a and b are being made
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(open.length, 2);
  assert.deepEqual(th.want([a]), {});           // a window asks for a meanwhile
  open[1]();                                    // b is done first, while a is still being made
  await new Promise((r) => setTimeout(r, 20));
  open[0]();
  await jobs.idle();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(Object.assign({}, ...told)[a], 'the window heard about a');
  assert.equal(Object.assign({}, ...told)[library.find(path.join(media, 'b.png')).id], undefined, 'and only what it asked for');
  fs.rmSync(d, { recursive: true, force: true });
});

async function make(out, args) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ff.run('ffmpeg', ['-y', '-v', 'error'].concat(args, [out]), { timeoutMs: 60000 });
  return out;
}
// How bright a picture is on average (0 to 255): FFmpeg shrinks it to one grey pixel.
async function brightness(p) {
  const raw = path.join(dir, 'pixel.raw');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-i', p, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', raw]);
  return fs.readFileSync(raw)[0];
}
async function sizeOf(p) {
  const s = (await ff.probeRaw(p)).streams[0];
  return [s.width, s.height];
}

test('thumbnails of a whole library folder: asked-for ones arrive first, then the rest; broken files are not tried again', { skip }, async () => {
  const media = path.join(dir, 'media');
  // A video that starts with a black second: a tenth of the way in is still black, and the thumbnail is not.
  await make(path.join(media, 'dark start.mp4'), ['-filter_complex', 'color=c=black:s=640x360:d=1:r=25[b];testsrc=s=640x360:d=4:r=25[t];[b][t]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
  const plain = await make(path.join(dir, 'plain.mp4'), ['-f', 'lavfi', '-i', 'testsrc=size=480x270:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
  await make(path.join(media, 'phone.mp4'), ['-display_rotation', '90', '-i', plain, '-c', 'copy']);
  await make(path.join(media, 'big.png'), ['-f', 'lavfi', '-i', 'testsrc=size=2000x1000:rate=1:duration=1', '-frames:v', '1']);
  await make(path.join(media, 'small.png'), ['-f', 'lavfi', '-i', 'testsrc=size=100x50:rate=1:duration=1', '-frames:v', '1']);
  await make(path.join(media, 'anim.gif'), ['-f', 'lavfi', '-i', 'testsrc=size=200x150:rate=10:duration=1']);
  fs.writeFileSync(path.join(media, 'broken.mp4'), 'not a video');

  const cache = createCache(path.join(dir, 'cache'));
  const library = createLibrary({ file: path.join(dir, 'library.json'), delay: 1e6, maxWait: 1e6 });
  const told = [];
  let lf = null, th = null;
  const jobs = createJobs({ kinds: {
    libinfo: { heavy: false, run: (j, ctx) => lf.infoKind.run(j, ctx) },
    libthumbs: { heavy: false, run: (j, ctx) => th.kind.run(j, ctx) }
  } });
  th = createThumbs({ library, cache, ffmpeg: ff, jobs, notify: (m) => told.push(m), notifyEvery: 10 });
  lf = createLibraryFolders({
    library, jobs, watchers: { set: () => 0 }, onUpdated: th.queue,
    scan: (d) => files.scan(d, (p) => !!formats.kindOfName(p, true)),
    imageSize, probeRaw: ff.probeRaw, canProbe: ff.available
  });
  await lf.add(media);
  const id = (n) => library.find(path.join(media, n)).id;

  // Asked for before the background round: none is there yet, and they come through notify.
  assert.deepEqual(th.want([id('big.png'), id('anim.gif'), 'nonsense']), {});
  await jobs.idle(); await jobs.idle();
  const heard = Object.assign({}, ...told);
  assert.ok(heard[id('big.png')] && heard[id('anim.gif')], 'the windows heard about the ones they asked for');

  const all = th.want(library.all().map((e) => e.id));
  assert.equal(library.all().length, 6);
  assert.equal(Object.keys(all).length, 5, 'every file but the broken one has one now');
  assert.ok(all[id('big.png')].startsWith(path.join(dir, 'cache', 'thumbs')) && all[id('big.png')].endsWith('.webp'));
  assert.deepEqual(await sizeOf(all[id('big.png')]), [360, 180]);
  assert.deepEqual(await sizeOf(all[id('small.png')]), [100, 50], 'never larger than the original');
  assert.deepEqual(await sizeOf(all[id('anim.gif')]), [200, 150]);
  assert.deepEqual(await sizeOf(all[id('phone.mp4')]), [203, 360], 'a phone video is upright');
  assert.deepEqual(await sizeOf(all[id('dark start.mp4')]), [360, 203]);
  assert.ok(await brightness(all[id('dark start.mp4')]) > 40, 'not the black start');

  assert.ok(library.get(id('broken.mp4')).err, 'the broken file could not even be read');
  assert.equal(th.want([id('broken.mp4')])[id('broken.mp4')], undefined);
  assert.equal(jobs.list().filter((j) => j.state === 'queued' || j.state === 'running').length, 0, 'nothing is tried again');

  // A changed file gets a new thumbnail; the old one stays in the cache until it is cleaned.
  const before = all[id('small.png')];
  await make(path.join(media, 'small.png'), ['-f', 'lavfi', '-i', 'testsrc=size=60x80:rate=1:duration=1', '-frames:v', '1']);
  await lf.rescan(media);
  await jobs.idle(); await jobs.idle();
  const after = th.want([id('small.png')])[id('small.png')];
  assert.ok(after && after !== before);
  assert.deepEqual(await sizeOf(after), [60, 80]);
});

test('a file FFmpeg reads but cannot picture is marked and left alone; without FFmpeg there are no thumbnails', { skip }, async () => {
  const media = path.join(dir, 'odd');
  fs.mkdirSync(media, { recursive: true });
  // An MP4 with sound only: probing works (it says there is no picture), so it never gets as far as a thumbnail.
  await make(path.join(media, 'sound only.mp4'), ['-f', 'lavfi', '-i', 'sine=duration=1', '-c:a', 'aac']);
  const cache = createCache(path.join(dir, 'cache2'));
  const library = createLibrary({ file: path.join(dir, 'odd.json'), delay: 1e6, maxWait: 1e6 });
  let th = null;
  const jobs = createJobs({ kinds: { libthumbs: { heavy: false, run: (j, ctx) => th.kind.run(j, ctx) } } });
  th = createThumbs({ library, cache, ffmpeg: ff, jobs });
  library.addFolder(media);
  library.sync(media, (await files.scan(media, () => true)).entries);
  const sid = library.all()[0].id;
  th.want([sid]);
  await jobs.idle();
  assert.ok(library.get(sid).terr, 'why there is no thumbnail');
  th.want([sid]);
  assert.equal(jobs.list().filter((j) => j.state === 'queued' || j.state === 'running').length, 0);

  const none = createThumbs({ library, cache, ffmpeg: { available: () => false }, jobs });
  assert.deepEqual(none.want([sid]), {});
});
