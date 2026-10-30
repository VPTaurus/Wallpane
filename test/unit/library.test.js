'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLibrary } = require('../../lib/library');

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));
const DAY = 86400000, T = 1790000000000;
// A library in a fresh folder. The media paths are made up: the library never opens media files.
function make(o) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-lib-'));
  const file = path.join(dir, 'library.json');
  return { file, root: path.join(dir, 'media'), lib: createLibrary(Object.assign({ file, delay: 1e6, maxWait: 1e6 }, o)) };
}
// One file as a scan reports it.
function f(p, size, mtime) { return { path: p, size: size || 1000, mtime: mtime || T }; }
function namesOf(lib) { return (q) => lib.query(q).items.map((i) => i.name); }

test('a scan brings in media only, and everything comes back after a restart', () => {
  const { lib, file, root } = make();
  const clips = path.join(root, 'Clips');
  assert.deepEqual(lib.load(), { files: 0, folders: 0 });
  assert.equal(lib.addFolder(clips).status, 'added');
  const r = lib.sync(clips, [
    f(path.join(clips, 'a.mp4'), 10), f(path.join(clips, 'loop.gif'), 20), f(path.join(clips, 'sub', 'photo.JPG'), 30),
    f(path.join(clips, 'old.avi'), 40), f(path.join(clips, 'notes.txt')), f(path.join(clips, 'pic.heic')), f(path.join(root, 'Other', 'b.mp4'))
  ]);
  assert.equal(r.added.length, 4, 'not the text file, the HEIC picture, or a file outside the folder');
  assert.deepEqual(lib.query().items.map((i) => [i.name, i.kind]), [['a.mp4', 'video'], ['loop.gif', 'gif'], ['old.avi', 'video'], ['photo.JPG', 'image']]);
  assert.deepEqual(lib.folders().map((x) => [x.path, x.files]), [[clips, 4]]);

  const id = lib.find(path.join(clips, 'A.MP4')).id;
  assert.ok(lib.setInfo(id, { w: 1920, h: 1080, dur: 12.5, v: 'h264', play: 'none', junk: 1, fps: 'fast' }));
  assert.ok(lib.flush());
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 1);
  assert.deepEqual(Object.keys(saved.files[id]).sort(), ['added', 'dur', 'h', 'kind', 'mtime', 'path', 'play', 'size', 'v', 'w']);

  const again = createLibrary({ file });
  assert.deepEqual(again.load(), { files: 4, folders: 1 });
  assert.deepEqual(again.get(id), lib.get(id));
  assert.deepEqual(again.query().items, lib.query().items);
  assert.equal(again.flush(), false, 'nothing changed, so nothing to save');
});

test('a folder inside a library folder is part of it already; one around library folders takes them in', () => {
  const { lib, root } = make();
  const a = path.join(root, 'Alpha'), b = path.join(root, 'Beta');
  lib.addFolder(a); lib.addFolder(b);
  lib.sync(a, [f(path.join(a, 'x.mp4'))]); lib.sync(b, [f(path.join(b, 'y.mp4'))]);
  const x = lib.find(path.join(a, 'x.mp4')).id;
  assert.deepEqual(lib.addFolder(path.join(a, 'deeper')), { status: 'inside', path: a });

  const r = lib.addFolder(root);
  assert.equal(r.status, 'added');
  assert.deepEqual(r.took, [a, b]);
  assert.deepEqual(lib.folders().map((i) => [i.path, i.files]), [[root, 2]]);
  assert.equal(lib.find(path.join(a, 'x.mp4')).id, x, 'the files came along, ids and all');
  assert.deepEqual(namesOf(lib)({ text: 'alpha' }), ['x.mp4'], 'the old library folder is now a subfolder, and its name still finds the file');

  assert.equal(lib.removeFolder(root), 2);
  assert.equal(lib.removeFolder(root), -1);
  assert.equal(lib.query().total, 0);
});

test('a rescan: changed files are probed again, gone files leave, a new letter case is followed', () => {
  const { lib, root } = make();
  lib.addFolder(root);
  const p1 = path.join(root, 'one.mp4'), p2 = path.join(root, 'two.mp4');
  lib.sync(root, [f(p1, 100), f(p2, 200)]);
  const id1 = lib.find(p1).id, id2 = lib.find(p2).id;
  lib.setInfo(id1, { w: 640, h: 360 }); lib.setInfo(id2, { w: 640, h: 360 });
  assert.deepEqual(lib.needingInfo(), []);

  assert.deepEqual(lib.sync(root, [f(p1, 150), f(path.join(root, 'TWO.mp4'), 200)]), { added: [], changed: [id1], moved: [], removed: [] });
  assert.equal(lib.get(id1).w, undefined, 'what probing told about the old file is forgotten');
  assert.deepEqual(lib.needingInfo().map((n) => n.id), [id1]);
  assert.equal(lib.get(id2).name, 'TWO.mp4');
  assert.deepEqual(lib.sync(root, [f(p1, 150)]).removed, [id2]);
  assert.deepEqual(lib.sync(root, [f(p1, 150)]), { added: [], changed: [], moved: [], removed: [] });
  assert.equal(lib.sync(path.join(root, 'elsewhere'), []), null, 'only library folders are synced');
});

test('a renamed or moved file keeps its id, and what probing told; files that left are remembered for 30 days', () => {
  let t = T;
  const { lib, file, root } = make({ now: () => t });
  const a = path.join(root, 'A'), b = path.join(root, 'B');
  lib.addFolder(a); lib.addFolder(b);
  lib.sync(a, [f(path.join(a, 'clip.mp4'), 500), f(path.join(a, 'keep.mp4'), 600)]);
  const id = lib.find(path.join(a, 'clip.mp4')).id;
  lib.setInfo(id, { w: 1280, h: 720 });

  let r = lib.sync(a, [f(path.join(a, 'clip renamed.mp4'), 500), f(path.join(a, 'keep.mp4'), 600)]);
  assert.deepEqual([r.moved, r.added, r.removed], [[id], [], [id]]);
  assert.equal(lib.get(id).w, 1280);

  // Moved to the other library folder; the folder it left is scanned first.
  lib.sync(a, [f(path.join(a, 'keep.mp4'), 600)]);
  assert.equal(lib.get(id), null);
  t += 5 * DAY;
  r = lib.sync(b, [f(path.join(b, 'clip renamed.mp4'), 500)]);
  assert.deepEqual(r.moved, [id]);
  assert.equal(lib.get(id).folder, b);

  // It leaves again; back within 30 days it is the same file, later it is a new one. Across a restart too.
  lib.sync(b, []);
  lib.flush();
  const soon = createLibrary({ file, now: () => t + 29 * DAY });
  soon.load();
  assert.deepEqual(soon.sync(b, [f(path.join(b, 'clip renamed.mp4'), 500)]).moved, [id]);
  const late = createLibrary({ file, now: () => t + 31 * DAY });
  late.load();
  const r2 = late.sync(b, [f(path.join(b, 'clip renamed.mp4'), 500)]);
  assert.equal(r2.added.length, 1);
  assert.notEqual(r2.added[0], id);
});

test('a moved file found in its new place first takes over in collections; an unclear rename is a new file', () => {
  const { lib, file, root } = make();
  const a = path.join(root, 'A'), b = path.join(root, 'B');
  lib.addFolder(a); lib.addFolder(b);
  lib.sync(a, [f(path.join(a, 'song.mp4'), 700)]);
  const old = lib.find(path.join(a, 'song.mp4')).id;
  lib.flush();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.collections = [{ id: 'c1', name: 'Evening', files: [old] }];
  fs.writeFileSync(file, JSON.stringify(data));

  const lib2 = createLibrary({ file });
  lib2.load();
  const moved = lib2.sync(b, [f(path.join(b, 'song.mp4'), 700)]).added[0];
  lib2.sync(a, []);
  lib2.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).collections[0].files, [moved]);
  assert.equal(lib2.get(moved).added, lib.get(old).added, 'it keeps the date it first came in');

  // Two files of the same size and time leave, and one with a new name comes: which one it was is unclear.
  const song = f(path.join(b, 'song.mp4'), 700);
  lib2.sync(b, [song, f(path.join(b, 'p1.mp4'), 900), f(path.join(b, 'p2.mp4'), 900)]);
  const gone = [lib2.find(path.join(b, 'p1.mp4')).id, lib2.find(path.join(b, 'p2.mp4')).id];
  const r = lib2.sync(b, [song, f(path.join(b, 'q.mp4'), 900)]);
  assert.equal(r.added.length, 1);
  assert.ok(!gone.includes(r.added[0]));
});

test('facts from probing: only known ones of the right type, and none about a file that changed since', () => {
  const { lib, root } = make();
  lib.addFolder(root);
  lib.sync(root, [f(path.join(root, 'v.mp4'), 100)]);
  const id = lib.find(path.join(root, 'v.mp4')).id;
  assert.equal(lib.setInfo(id, { w: 'wide', nope: 1 }), false);
  assert.equal(lib.setInfo(id, { w: 1080, h: 1920, rot: -90 }), true);
  assert.equal(lib.get(id).rot, 270);
  assert.equal(lib.setInfo(id, { w: 1080 }), false, 'nothing new');
  assert.equal(lib.setInfo(id, { dur: 9 }, { size: 99, mtime: T }), false, 'probed before the file changed');
  assert.equal(lib.setInfo(id, { dur: 9 }, { size: 100, mtime: T }), true);
  assert.equal(lib.setInfo('nope', { dur: 9 }), false);

  lib.sync(root, [f(path.join(root, 'v.mp4'), 100), f(path.join(root, 'bad.mp4'), 5)]);
  const bad = lib.find(path.join(root, 'bad.mp4')).id;
  assert.deepEqual(lib.needingInfo().map((n) => n.id), [bad]);
  lib.setInfo(bad, { err: 'Invalid data found when processing input' });
  assert.deepEqual(lib.needingInfo(), [], 'a file that cannot be read is not probed again and again');
});

test('search: every word, in any order, in file and folder names, without accents or case', () => {
  const { lib, root } = make();
  const c = path.join(root, 'Clips');
  lib.addFolder(c);
  lib.sync(c, [f(path.join(c, 'Beach', 'Sunset Žagata.mp4')), f(path.join(c, 'Beach', 'Morning.mp4')), f(path.join(c, 'Café night.webm'))]);
  const names = namesOf(lib);
  assert.deepEqual(names({ text: 'zagata sunset' }), ['Sunset Žagata.mp4']);
  assert.deepEqual(names({ text: 'BEACH' }), ['Morning.mp4', 'Sunset Žagata.mp4']);
  assert.deepEqual(names({ text: '  cafe ' }), ['Café night.webm']);
  assert.equal(names({ text: 'clips' }).length, 3, 'the library folder\'s own name counts too');
  assert.deepEqual(names({ text: 'beach night' }), []);
  assert.deepEqual(names({ folder: path.join(c, 'beach') }), ['Morning.mp4', 'Sunset Žagata.mp4']);
});

test('filters: kind, shape (turned videos too), length, resolution, and files that need a playable copy', () => {
  const { lib, root } = make();
  lib.addFolder(root);
  const info = {
    'land.mp4': { w: 1920, h: 1080, dur: 10, play: 'none' },
    'tall.mp4': { w: 1920, h: 1080, rot: 90, dur: 100, play: 'none' },
    'sq.gif': { w: 500, h: 500, dur: 3 },
    'photo.jpg': { w: 4000, h: 3000 },
    'old.avi': null,
    'mkv.mkv': { w: 1280, h: 720, dur: 400, play: 'audio' }
  };
  lib.sync(root, Object.keys(info).map((n) => f(path.join(root, n))));
  Object.keys(info).forEach((n) => { if (info[n]) lib.setInfo(lib.find(path.join(root, n)).id, info[n]); });
  const names = namesOf(lib);
  assert.deepEqual(names(), ['land.mp4', 'mkv.mkv', 'old.avi', 'photo.jpg', 'sq.gif', 'tall.mp4']);
  assert.deepEqual(names({ kinds: ['gif', 'image'] }), ['photo.jpg', 'sq.gif']);
  assert.deepEqual(names({ shape: 'landscape' }), ['land.mp4', 'mkv.mkv', 'photo.jpg']);
  assert.deepEqual(names({ shape: 'portrait' }), ['tall.mp4']);
  assert.deepEqual(names({ shape: 'square' }), ['sq.gif']);
  assert.deepEqual(names({ length: 'short' }), ['land.mp4', 'sq.gif']);
  assert.deepEqual(names({ length: 'medium' }), ['tall.mp4']);
  assert.deepEqual(names({ length: 'long' }), ['mkv.mkv']);
  assert.deepEqual(names({ res: 'sd' }), ['sq.gif']);
  assert.deepEqual(names({ res: 'hd' }), ['mkv.mkv']);
  assert.deepEqual(names({ res: 'fhd' }), ['land.mp4', 'tall.mp4']);
  assert.deepEqual(names({ res: '4k' }), ['photo.jpg']);
  assert.deepEqual(names({ needsCopy: true }), ['mkv.mkv', 'old.avi'], 'an AVI not probed yet surely needs one');
  assert.deepEqual(names({ kinds: ['video'], shape: 'landscape', length: 'short' }), ['land.mp4']);
  const tall = lib.query({ shape: 'portrait' }).items[0];
  assert.deepEqual([tall.w, tall.h, tall.dur], [1080, 1920, 100], 'the size as the picture shows');
});

test('sorting: names by their numbers, the rest biggest or newest first, files without a value last, random by seed', () => {
  const { lib, root } = make();
  lib.addFolder(root);
  lib.sync(root, [f(path.join(root, 'clip 10.mp4'), 300, T + 1), f(path.join(root, 'clip 2.mp4'), 100, T + 3), f(path.join(root, 'clip 1.mp4'), 200, T + 2), f(path.join(root, 'pic.png'), 50, T)]);
  lib.setInfo(lib.find(path.join(root, 'clip 10.mp4')).id, { dur: 5 });
  lib.setInfo(lib.find(path.join(root, 'clip 2.mp4')).id, { dur: 50 });
  const names = namesOf(lib);
  assert.deepEqual(names(), ['clip 1.mp4', 'clip 2.mp4', 'clip 10.mp4', 'pic.png']);
  assert.deepEqual(names({ reverse: true }), ['pic.png', 'clip 10.mp4', 'clip 2.mp4', 'clip 1.mp4']);
  assert.deepEqual(names({ sort: 'size' }), ['clip 10.mp4', 'clip 1.mp4', 'clip 2.mp4', 'pic.png']);
  assert.deepEqual(names({ sort: 'size', reverse: true }), ['pic.png', 'clip 2.mp4', 'clip 1.mp4', 'clip 10.mp4']);
  assert.deepEqual(names({ sort: 'changed' }), ['clip 2.mp4', 'clip 1.mp4', 'clip 10.mp4', 'pic.png']);
  assert.deepEqual(names({ sort: 'length' }), ['clip 2.mp4', 'clip 10.mp4', 'clip 1.mp4', 'pic.png']);
  assert.deepEqual(names({ sort: 'length', reverse: true }).slice(0, 2), ['clip 10.mp4', 'clip 2.mp4'], 'shortest first, and still nothing without a length before them');

  const r1 = names({ sort: 'random', seed: 1 });
  assert.deepEqual(names({ sort: 'random', seed: 1 }), r1, 'the same seed, the same order');
  assert.deepEqual(r1.slice().sort(), names().slice().sort());
  assert.ok([2, 3, 4, 5, 6, 7, 8, 9].some((s) => names({ sort: 'random', seed: s }).join() !== r1.join()), 'another seed, another order');
});

test('saving waits for a quiet moment, but never too long', async () => {
  const { lib, file, root } = make({ delay: 200, maxWait: 300 });
  lib.addFolder(root);
  await tick(30);
  assert.equal(fs.existsSync(file), false, 'not yet: more changes may follow');
  await tick(400);
  assert.ok(fs.existsSync(file), 'saved after a quiet moment');

  // A change every 30 ms never leaves a quiet moment, and it is saved anyway.
  fs.unlinkSync(file);
  const start = Date.now();
  for (let n = 0; Date.now() - start < 1500 && !fs.existsSync(file); n++) {
    lib.sync(root, [f(path.join(root, n + '.mp4'))]);
    await tick(30);
  }
  assert.ok(fs.existsSync(file));
  assert.ok(Date.now() - start < 1500);
});

test('a damaged library.json is kept aside; one from a newer Wallpane is never overwritten', () => {
  const { lib, file, root } = make();
  fs.writeFileSync(file, '{"version":1,"fold');
  assert.deepEqual(lib.load(), { files: 0, folders: 0, damaged: true });
  assert.equal(fs.readFileSync(file + '.bad', 'utf8'), '{"version":1,"fold');

  const newer = JSON.stringify({ version: 99, folders: [{ path: root, added: 1 }], files: {}, more: 'from the future' });
  fs.writeFileSync(file, newer);
  const lib2 = createLibrary({ file });
  assert.deepEqual(lib2.load(), { files: 0, folders: 1, readOnly: true });
  assert.ok(lib2.readOnly());
  lib2.removeFolder(root);
  assert.equal(lib2.flush(), false);
  assert.equal(fs.readFileSync(file, 'utf8'), newer);
});

test('the windows hear about a run of changes once', async () => {
  let calls = 0;
  const { lib, root } = make({ notify: () => calls++, notifyEvery: 30 });
  lib.addFolder(root);
  for (let i = 0; i < 10; i++) lib.sync(root, [f(path.join(root, i + '.mp4'))]);
  assert.equal(calls, 0);
  await tick(80);
  assert.equal(calls, 1);
});

test('50,000 files: the scan, a search and a sort stay quick', () => {
  const { lib, root } = make();
  lib.addFolder(root);
  const list = [];
  for (let i = 0; i < 50000; i++) list.push(f(path.join(root, 'folder ' + (i % 50), 'clip ' + i + '.mp4'), 1000 + i, T + i));
  let t0 = Date.now();
  lib.sync(root, list);
  const scan = Date.now() - t0;
  lib.query();   // the first search sorts every name once
  t0 = Date.now();
  const r = lib.query({ text: 'clip 4999' });
  const search = Date.now() - t0;
  t0 = Date.now();
  lib.query({ sort: 'size' });
  const sort = Date.now() - t0;
  assert.equal(r.count, list.filter((x) => path.basename(x.path).includes('4999')).length);
  assert.ok(scan < 3000, 'scan took ' + scan + ' ms');
  assert.ok(search < 300, 'search took ' + search + ' ms');
  assert.ok(sort < 600, 'sort took ' + sort + ' ms');
});
