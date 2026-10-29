'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../../renderer/lib/playlist');
const REC = require('../../renderer/lib/records');

const file = (n) => ({ path: 'D:\\wall\\' + n, name: n, kind: 'image' });

test('nextFile goes through every file once per round', () => {
  const p = PL.make([file('a.png'), file('b.png'), file('c.png')], {}, 'D:\\wall');
  const seen = [PL.nextFile(p), PL.nextFile(p), PL.nextFile(p)].map((f) => f.name);
  assert.deepEqual(seen, ['a.png', 'b.png', 'c.png']);
  assert.equal(PL.nextFile(p).name, 'a.png');
  assert.equal(p.name, 'wall');
});

test('make keeps options in range', () => {
  const p = PL.make([file('a.png')], { secs: 9999, maxClip: -5, fade: 9, shuffle: 1 });
  assert.equal(p.secs, 300);
  assert.equal(p.maxClip, 0);
  assert.equal(p.fade, 5);
  assert.equal(p.shuffle, true);
  assert.equal(p.keepView, false, 'zoom and position start fresh for each file unless asked');
});

test('keeping zoom and position is saved with the playlist', () => {
  const p = PL.make([file('a.png')], { keepView: true });
  assert.equal(p.keepView, true);
  assert.equal(PL.fields(p).keepView, true);
  assert.equal(PL.clean({ x: PL.fields(p) }).x.keepView, true);
  assert.equal(PL.clean({ x: { files: [file('a.png')] } }).x.keepView, false, 'older saved walls');
});

test('refresh queues new files after the ones still to come and drops removed ones', () => {
  const p = PL.make([file('a.png'), file('b.png'), file('c.png')], {}, 'D:\\wall');
  PL.nextFile(p);                         // a has played
  const added = PL.refresh(p, [file('a.png'), file('c.png'), file('d.png')]);
  assert.equal(added, 1);
  const rest = [PL.nextFile(p), PL.nextFile(p)].map((f) => f.name);
  assert.deepEqual(rest, ['c.png', 'd.png']);
  assert.equal(PL.refresh(p, [file('a.png'), file('c.png'), file('d.png')]), 0, 'nothing new');
});

test('rootFor only trusts a folder that holds every file', () => {
  const files = [file('a.png'), { path: 'D:\\wall\\sub\\b.png' }];
  assert.equal(PL.rootFor({ root: 'D:\\wall' }, files), 'D:\\wall');
  assert.equal(PL.rootFor({ root: 'D:\\wal' }, files), null);
  assert.equal(PL.rootFor({ dirs: ['D:\\wall\\'] }, files), 'D:\\wall\\');
  assert.equal(PL.rootFor({ dirs: ['D:\\a', 'D:\\b'] }, files), null);
});

test('clean drops broken playlists and keeps values in range', () => {
  const out = PL.clean({
    good: { name: 'x', files: [file('a.png'), { path: 5 }], secs: 1, order: [0], pos: 7 },
    noFiles: { files: [] },
    junk: null
  });
  assert.deepEqual(Object.keys(out), ['good']);
  assert.equal(out.good.files.length, 1);
  assert.equal(out.good.secs, 2);
  assert.equal(out.good.pos, 1);
});

test('cleanRecord keeps good tiles and puts settings in range', () => {
  const rec = REC.cleanRecord({
    name: '  My wall  ', cols: 40, rows: 0, gap: 99, aspect: 'weird', mode: 'free',
    items: [
      { path: 'D:\\a.mp4', name: 'a.mp4', kind: 'video', col: 1.7, row: 0, w: 2, h: 1, fx: 0.1, fy: null },
      { path: '', name: 'b', kind: 'image', col: 0, row: 0, w: 1, h: 1 },
      { path: 'D:\\c.exe', name: 'c.exe', kind: 'program', col: 0, row: 0, w: 1, h: 1 }
    ]
  }, true);
  assert.equal(rec.name, 'My wall');
  assert.equal(rec.cols, 12);
  assert.equal(rec.rows, 3);
  assert.equal(rec.gap, 24);
  assert.equal(rec.aspect, 'fill');
  assert.equal(rec.mode, 'free');
  assert.equal(rec.items.length, 1);
  assert.equal(rec.items[0].col, 1);
  assert.equal(rec.items[0].fx, 0.1);
  assert.equal(rec.items[0].fy, undefined);
  assert.equal(REC.cleanRecord({ items: [] }, true), null, 'a preset needs a name');
  assert.equal(REC.cleanRecord('nope', false), null);
});

test('cleanLayout accepts whole-cell frames only', () => {
  assert.deepEqual(REC.cleanLayout({ name: ' Two ', cols: 2, rows: 1, f: [[0, 0, 1, 1], [1, 0, 1, 1]] }),
    { name: 'Two', cols: 2, rows: 1, f: [[0, 0, 1, 1], [1, 0, 1, 1]] });
  assert.equal(REC.cleanLayout({ name: 'x', cols: 2, rows: 1, f: [['1', 0, 1, 1]] }), null);
  assert.equal(REC.cleanLayout({ name: '', cols: 1, rows: 1, f: [[0, 0, 1, 1]] }), null);
});
