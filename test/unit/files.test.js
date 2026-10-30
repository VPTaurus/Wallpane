'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const files = require('../../lib/files');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mw-unit-')); }
function touch(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }

test('expand finds media in folders, reports formats that cannot play, and skips the rest', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const n of ['a.mp4', 'b.png', 'notes.txt', 'clip.avi', '.hidden.png', 'sub/c.jpg', 'sub/old.wmv']) touch(path.join(dir, n));

  const res = await files.expand([dir]);
  assert.deepEqual(res.entries.map((e) => path.relative(dir, e.path)), ['a.mp4', 'b.png', path.join('sub', 'c.jpg')]);
  assert.deepEqual(res.entries.map((e) => e.kind), ['video', 'image', 'image']);
  assert.deepEqual(res.unsupported, { avi: 1, wmv: 1 });
  assert.equal(res.skipped, 0, 'other files inside a folder are not counted');
  assert.deepEqual(res.dirs, [dir]);
  assert.equal(res.truncated, undefined);

  const picked = await files.expand([path.join(dir, 'notes.txt'), path.join(dir, 'clip.avi'), path.join(dir, 'b.png'), path.join(dir, 'b.png')]);
  assert.equal(picked.entries.length, 1, 'duplicates count once');
  assert.equal(picked.skipped, 1);
  assert.deepEqual(picked.unsupported, { avi: 1 });
  assert.deepEqual(picked.dirs, []);

  const cut = await files.expand([dir], { max: 2 });
  assert.equal(cut.entries.length, 2);
  assert.equal(cut.truncated, true);
  assert.equal(cut.limit, 2);

  const none = await files.expand([path.join(dir, 'missing'), 42, null]);
  assert.deepEqual(none.entries, []);
});

test('expand with audio finds the music in a folder for the background music, and nothing else', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const n of ['01 b.mp3', '02 a.flac', 'cover.jpg', 'clip.mp4', 'old.wma', 'disc 2/03 c.m4a']) touch(path.join(dir, n));
  const res = await files.expand([dir], { audio: true });
  assert.deepEqual(res.entries.map((e) => path.relative(dir, e.path)), ['01 b.mp3', '02 a.flac', path.join('disc 2', '03 c.m4a')]);
  assert.ok(res.entries.every((e) => e.kind === 'audio'));
  assert.deepEqual(res.unsupported, {}, 'no word about videos or pictures that cannot play');
});

// A minimal GIF with one frame per delay (in hundredths of a second).
function gif(delays) {
  const parts = [Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0, 0, 0])];
  for (const d of delays) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, d & 0xff, d >> 8, 0x00, 0x00]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

test('gifSeconds adds up the frame delays of an animated GIF', () => {
  assert.equal(files.gifSeconds(gif([50, 30])), 0.8);
  assert.equal(files.gifSeconds(gif([0, 1])), 0.2, 'tiny delays play as 0.1 s, like browsers do');
  assert.equal(files.gifSeconds(gif([50])), 0, 'a still GIF');
  assert.equal(files.gifSeconds(Buffer.from('not a gif at all')), 0);
  assert.equal(files.gifSeconds(gif([50, 30]).subarray(0, 30)), 0);
});

test('migrateData copies the old app folder\'s data once, and only into an empty new folder', (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const oldDir = path.join(dir, 'Media Wall'), newDir = path.join(dir, 'Wallpane');
  fs.mkdirSync(path.join(oldDir, 'Cache'), { recursive: true });
  for (const n of ['presets.json', 'session.json', 'session-2.json', 'prefs-2.json', 'window.json', 'layouts.json', 'Preferences', 'notes.json']) fs.writeFileSync(path.join(oldDir, n), n);
  assert.equal(files.migrateData(oldDir, newDir), 6);
  assert.deepEqual(fs.readdirSync(newDir).sort(), ['layouts.json', 'prefs-2.json', 'presets.json', 'session-2.json', 'session.json', 'window.json']);
  assert.ok(fs.existsSync(path.join(oldDir, 'presets.json')), 'the old folder stays as a backup');
  fs.writeFileSync(path.join(oldDir, 'presets.json'), 'changed later');
  assert.equal(files.migrateData(oldDir, newDir), 0, 'never twice: the new folder has data now');
  assert.equal(fs.readFileSync(path.join(newDir, 'presets.json'), 'utf8'), 'presets.json');
  assert.equal(files.migrateData(path.join(dir, 'missing'), newDir), 0);
  assert.equal(files.migrateData(newDir, newDir), 0);
});

test('writeJsonAtomic leaves a whole file and no temporary files, even with saves at the same time', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'deep', 'store.json');
  await Promise.all(Array.from({ length: 12 }, (_, i) => files.writeJsonAtomic(f, { i, pad: 'x'.repeat(5000) })));
  const got = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(typeof got.i, 'number');
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['store.json']);

  files.writeJsonAtomicSync(f, { sync: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { sync: true });
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['store.json']);
});
