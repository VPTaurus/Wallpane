'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../renderer/lib/gifmake');
const V = require('../../renderer/lib/view');

const near = (a, b) => Object.keys(b).forEach((k) => assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k + ': ' + a[k] + ' is not ' + b[k]));
const input = (f) => ['-i', f];

test('what a tile shows: the whole frame, a filled tile cut at the sides, a zoomed and moved view', () => {
  // A 16:9 video shown whole in a square tile: all of it.
  near(V.shown(100, 100, 16 / 9, 'contain', { mx: 0.5, my: 0.5, zoom: 1 }), { x: 0, y: 0, w: 1, h: 1 });
  // A 2:1 video filling a square tile: the middle half of its width.
  near(V.shown(100, 100, 2, 'cover', { mx: 0.5, my: 0.5, zoom: 1 }), { x: 0.25, y: 0, w: 0.5, h: 1 });
  // Moved to its left edge: the left half.
  near(V.shown(100, 100, 2, 'cover', { mx: 0, my: 0.5, zoom: 1 }), { x: 0, y: 0, w: 0.5, h: 1 });
  // Zoomed 2x around the middle of a tile that fits it exactly: the middle quarter.
  near(V.shown(160, 90, 16 / 9, 'cover', { mx: 0.5, my: 0.5, zoom: 2 }), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  // Zoomed 2x at the bottom right corner.
  near(V.shown(160, 90, 16 / 9, 'cover', { mx: 1, my: 1, zoom: 2 }), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
});

test('clean keeps a sound request, refuses a broken one, and falls back to the defaults', () => {
  const g = GM.clean({ file: 'C:\\v.mp4', start: 1.5, end: 4, width: 640, fps: 20, speed: 2, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
  assert.deepEqual(g, { file: 'C:\\v.mp4', start: 1.5, end: 4, width: 640, fps: 20, speed: 2, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
  const d = GM.clean({ file: 'v.mp4', start: 0, end: 3, width: 9999, fps: 60, speed: 100, crop: { x: 0, y: 0, w: 1, h: 1 } });
  assert.equal(d.width, 480); assert.equal(d.fps, 15); assert.equal(d.speed, 1); assert.equal(d.crop, null);
  for (const bad of [null, {}, { file: 'v.mp4', start: 3, end: 3 }, { file: 'v.mp4', start: -1, end: 2 }, { file: 'v.mp4', start: 0, end: GM.MAX + 1 },
    { file: 'v.mp4', start: 0, end: 2, crop: { x: 0.8, y: 0, w: 0.5, h: 1 } }, { file: 'v.mp4', start: 0, end: 2, crop: { x: 0, y: 0, w: 0, h: 1 } }]) {
    assert.equal(GM.clean(bad), null, JSON.stringify(bad));
  }
});

test('the GIF is never wider than the part of the video it keeps', () => {
  assert.deepEqual(GM.outSize(1920, 1080, null, 480), { w: 480, h: 270 });
  assert.deepEqual(GM.outSize(1920, 1080, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 480), { w: 480, h: 270 });
  assert.deepEqual(GM.outSize(640, 360, { x: 0, y: 0, w: 0.25, h: 0.5 }, 480), { w: 160, h: 180 });
  assert.equal(GM.seconds({ start: 2, end: 8, speed: 2 }), 3);
  assert.ok(GM.estimate(10, 15, 480, 270) > GM.estimate(5, 15, 480, 270));
});

test('the file name says which part it is, without characters Windows refuses', () => {
  assert.equal(GM.fileName('clip.mp4', 83.5, 90), 'clip 1m23.5s-1m30s.gif');
  assert.equal(GM.fileName('a.b.mkv', 5, 12.25), 'a.b 5s-12.3s.gif');
  assert.equal(GM.fileName('x.mov', 60, 125), 'x 1m00s-2m05s.gif');
  assert.doesNotMatch(GM.fileName('clip.mp4', 3601, 3602), /[:<>|?*"]/);
});

test("FFmpeg's arguments: the part, the crop, the speed, the palette, looping forever", () => {
  const a = GM.args(GM.clean({ file: 'v.mp4', start: 2, end: 7.5, width: 320, fps: 10, speed: 2, crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.8 } }), 'out.gif.part', input);
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4), ['-ss', '2.000', '-t', '5.500']);
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'), 'seeks before reading');
  const vf = a[a.indexOf('-vf') + 1];
  assert.match(vf, /^crop=w=iw\*0\.5:h=ih\*0\.8:x=iw\*0\.25:y=ih\*0\.1,setpts=PTS\/2,fps=10,scale=w='min\(320,iw\)':h=-1:flags=lanczos,split\[a\]\[b\];\[a\]palettegen/);
  assert.match(vf, /paletteuse=dither=bayer/);
  assert.deepEqual(a.slice(a.indexOf('-loop'), a.indexOf('-loop') + 4), ['-loop', '0', '-f', 'gif']);
  assert.equal(a[a.length - 1], 'out.gif.part');
  // The whole frame at normal speed: neither crop nor setpts.
  const plain = GM.args(GM.clean({ file: 'v.mp4', start: 0, end: 2 }), 'o', input);
  assert.doesNotMatch(plain[plain.indexOf('-vf') + 1], /crop|setpts/);
});
