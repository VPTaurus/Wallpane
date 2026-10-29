'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const formats = require('../../renderer/lib/formats');
const U = require('../../renderer/lib/util');

test('kindOfName sorts files into video, image or nothing', () => {
  assert.equal(formats.kindOfName('C:\\a\\clip.MP4'), 'video');
  assert.equal(formats.kindOfName('photo.jpeg'), 'image');
  assert.equal(formats.kindOfName('anim.gif'), 'image');
  assert.equal(formats.kindOfName('notes.txt'), null);
  assert.equal(formats.kindOfName('C:\\folder.mp4\\noext'), null);
});

test('describeUnsupported names the formats and how to convert them', () => {
  assert.equal(formats.describeUnsupported({}), '');
  assert.equal(formats.describeUnsupported({ txt: 3 }), '');
  const one = formats.describeUnsupported({ avi: 1 });
  assert.match(one, /^1 AVI file cannot play here\. Convert videos to MP4/);
  assert.match(one, /add it again\.$/);
  const mixed = formats.describeUnsupported({ avi: 2, heic: 1, mpg: 1, mpeg: 2 });
  assert.match(mixed, /2 AVI files, 1 HEIC file and 3 MPEG files cannot play here/);
  assert.match(mixed, /videos to MP4 .* and images to JPEG or PNG/);
  assert.equal(formats.isUnplayable('x.WMV'), true);
  assert.equal(formats.isUnplayable('x.mp4'), false);
});

test('fileUrl encodes each part of a Windows path', () => {
  assert.equal(U.fileUrl('C:\\Videos\\my clip.mp4'), 'file:///C:/Videos/my%20clip.mp4');
  assert.equal(U.fileUrl('C:\\a#b\\100%?.png'), 'file:///C:/a%23b/100%25%3F.png');
  assert.equal(U.fileUrl('\\\\server\\share\\wall\\a.mp4'), 'file://server/share/wall/a.mp4');
  assert.equal(U.fileUrl('/home/me/a b.png'), 'file:///home/me/a%20b.png');
});

test('small helpers', () => {
  assert.equal(U.clamp(5, 0, 3), 3);
  assert.equal(U.clamp(-1, 0, 3), 0);
  assert.equal(U.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(U.dirOf('C:\\a\\b\\c.mp4'), 'C:\\a\\b');
  assert.equal(U.baseName('C:\\a\\Holiday\\'), 'Holiday');
  const sorted = U.sortEntries([{ path: 'b10.png' }, { path: 'b2.png' }, { path: 'A1.png' }]).map((e) => e.path);
  assert.deepEqual(sorted, ['A1.png', 'b2.png', 'b10.png']);
});
