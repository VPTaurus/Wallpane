'use strict';
// The size of a picture from the first bytes of its file, without decoding it: PNG, GIF, JPEG, WebP and BMP. A JPEG
// that its camera marked as turned (EXIF orientation) is measured the way Chromium shows it, so a portrait phone photo
// is taller than wide. Quick enough for a library of thousands of photos, where starting ffprobe for each would take
// minutes. Other formats (AVIF, SVG, …) return null and are left to ffprobe.
const fsp = require('fs').promises;

// -> { w, h } as the picture shows, or null.
async function imageSize(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(64);
    const b = head.subarray(0, (await fh.read(head, 0, 64, 0)).bytesRead);
    const at = (s, e) => b.toString('latin1', s, e);
    if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && at(12, 16) === 'IHDR') return sized(b.readUInt32BE(16), b.readUInt32BE(20));
    if (b.length >= 10 && at(0, 3) === 'GIF') return sized(b.readUInt16LE(6), b.readUInt16LE(8));
    if (b.length >= 26 && at(0, 2) === 'BM') {
      return b.readUInt32LE(14) === 12 ? sized(b.readUInt16LE(18), b.readUInt16LE(20)) : sized(Math.abs(b.readInt32LE(18)), Math.abs(b.readInt32LE(22)));
    }
    if (b.length >= 30 && at(0, 4) === 'RIFF' && at(8, 12) === 'WEBP') {
      const chunk = at(12, 16);
      if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return sized(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      if (chunk === 'VP8L' && b[20] === 0x2f) { const v = b.readUInt32LE(21); return sized((v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1); }
      if (chunk === 'VP8X') return sized(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
      return null;
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return await jpeg(fh);
    return null;
  } finally { await fh.close(); }
}
function sized(w, h) { return w > 0 && h > 0 ? { w, h } : null; }

// Walks the JPEG's segments up to the frame header (SOFn), noting the EXIF orientation on the way.
async function jpeg(fh) {
  const m = Buffer.alloc(4);
  let pos = 2, turned = false;
  for (let i = 0; i < 500; i++) {
    if ((await fh.read(m, 0, 4, pos)).bytesRead < 4 || m[0] !== 0xff) return null;
    const marker = m[1];
    if (marker === 0xff) { pos++; continue; }                                    // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { pos += 2; continue; }   // markers without a length
    if (marker === 0xd9 || marker === 0xda) return null;                         // the picture data, and no size yet
    const len = m.readUInt16BE(2);
    if (len < 2) return null;
    if (marker === 0xe1 && len > 16) {
      const seg = Buffer.alloc(len - 2);
      await fh.read(seg, 0, seg.length, pos + 4);
      const o = orientation(seg);
      if (o >= 5 && o <= 8) turned = true;
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const s = Buffer.alloc(5);
      if ((await fh.read(s, 0, 5, pos + 4)).bytesRead < 5) return null;
      const h = s.readUInt16BE(1), w = s.readUInt16BE(3);
      return turned ? sized(h, w) : sized(w, h);
    }
    pos += 2 + len;
  }
  return null;
}
// EXIF orientation (1 to 8) from an APP1 segment, or 0. 5 to 8 mean the picture shows turned by 90°.
function orientation(seg) {
  if (seg.length < 14 || seg.toString('latin1', 0, 6) !== 'Exif\0\0') return 0;
  const t = seg.subarray(6), le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 0;
  for (let i = 0, n = u16(ifd); i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) return 0;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 0;
}

module.exports = { imageSize, orientation };
