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

test('a playlist can play only some kinds of file', () => {
  const gif = { path: 'D:\\wall\\b.gif', name: 'b.gif', kind: 'image' }, vid = { path: 'D:\\wall\\c.mp4', name: 'c.mp4', kind: 'video' };
  const p = PL.make([file('a.png'), gif, vid], { types: ['gif', 'video'] }, 'D:\\wall');
  assert.deepEqual(p.types, ['video', 'gif'], 'kept in a fixed order');
  assert.equal(PL.playable(p), 2);
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(PL.nextFile(p).name);
  assert.deepEqual([...seen].sort(), ['b.gif', 'c.mp4']);
  assert.equal(PL.typesLabel(p), 'videos and GIFs');
  assert.equal(PL.typesLabel(PL.make([gif], { types: ['image'] })), 'images only');
  assert.deepEqual(PL.make([gif], { types: [] }).types, ['video', 'gif', 'image'], 'none ticked means all');
  assert.equal(PL.nextFile(PL.make([file('a.png')], { types: ['video'] })), null, 'nothing in the folder plays');
  assert.deepEqual(PL.clean({ x: PL.fields(p) }).x.types, ['video', 'gif']);
  assert.deepEqual(PL.clean({ x: { files: [gif] } }).x.types, ['video', 'gif', 'image'], 'older saved walls play everything');
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

test('playback settings in a saved wall are kept in range', () => {
  const rec = REC.cleanRecord({ items: [
    { path: 'D:\\a.mp4', name: 'a.mp4', kind: 'video', col: 0, row: 0, w: 1, h: 1, vol: 2, speed: 10, loopA: 3, loopB: 2 },
    { path: 'D:\\b.mp4', name: 'b.mp4', kind: 'video', col: 1, row: 0, w: 1, h: 1, vol: 0.4, speed: 1.5, loopA: 1, loopB: 4 },
    { path: 'D:\\c.mp4', name: 'c.mp4', kind: 'video', col: 2, row: 0, w: 1, h: 1 }
  ] }, false);
  assert.deepEqual([rec.items[0].vol, rec.items[0].speed, rec.items[0].loopA, rec.items[0].loopB], [1, 4, 3, null]);
  assert.deepEqual([rec.items[1].vol, rec.items[1].speed, rec.items[1].loopA, rec.items[1].loopB], [0.4, 1.5, 1, 4]);
  assert.deepEqual([rec.items[2].vol, rec.items[2].speed, rec.items[2].loopA, rec.items[2].loopB], [1, 1, null, null], 'older saved walls');
});

test('cleanLayout accepts whole-cell frames only', () => {
  assert.deepEqual(REC.cleanLayout({ name: ' Two ', cols: 2, rows: 1, f: [[0, 0, 1, 1], [1, 0, 1, 1]] }),
    { name: 'Two', cols: 2, rows: 1, f: [[0, 0, 1, 1], [1, 0, 1, 1]] });
  assert.equal(REC.cleanLayout({ name: 'x', cols: 2, rows: 1, f: [['1', 0, 1, 1]] }), null);
  assert.equal(REC.cleanLayout({ name: '', cols: 1, rows: 1, f: [[0, 0, 1, 1]] }), null);
});
