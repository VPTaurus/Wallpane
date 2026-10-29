'use strict';
// File work for the main process: finding media in files and folders, reading GIF lengths, and saving JSON safely.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const formats = require('../renderer/lib/formats');

const MAX_FILES = 3000;
const MAX_DEPTH = 8;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/* Turns files and folders into a flat list of media files. Folders are searched recursively (up to MAX_DEPTH deep,
   at most MAX_FILES files). Returns:
   - entries: [{ path, name, kind }]
   - skipped: dropped or chosen files that are not media at all
   - unsupported: { ext: count } of known formats that cannot play (anywhere, also inside folders)
   - dirs: the folders among `paths`
   - truncated / limit: set when the file limit cut the list short
   opts.max lowers the file limit (for tests). */
async function expand(paths, opts) {
  const max = (opts && opts.max) || MAX_FILES;
  const out = [];
  const seen = new Set();
  const unsupported = {};
  const dirs = [];
  let skipped = 0, truncated = false;
  async function walk(p, depth, top) {
    if (out.length >= max) { truncated = true; return; }
    let st;
    try { st = await fsp.stat(p); } catch { return; }
    if (st.isDirectory()) {
      if (top) dirs.push(p);
      if (depth > MAX_DEPTH) return;
      let names;
      try { names = await fsp.readdir(p); } catch { return; }
      names.sort(collator.compare);
      for (const n of names) {
        if (n.startsWith('.')) continue;
        await walk(path.join(p, n), depth + 1, false);
      }
    } else if (st.isFile()) {
      const kind = formats.kindOfName(p);
      if (!kind) {
        if (formats.isUnplayable(p)) { const e = formats.extOf(p); unsupported[e] = (unsupported[e] || 0) + 1; }
        else if (top) skipped++;
        return;
      }
      const key = p.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ path: p, name: path.basename(p), kind });
    }
  }
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p === 'string' && p) await walk(p, 0, true);
  }
  const res = { entries: out, skipped, unsupported, dirs };
  if (truncated) { res.truncated = true; res.limit = max; }
  return res;
}

// Length of one full play of an animated GIF, in seconds (0 if it is not animated or cannot be read).
function gifSeconds(buf) {
  try {
    if (buf.length < 14 || buf.toString('latin1', 0, 3) !== 'GIF') return 0;
    let p = 13;
    if (buf[10] & 0x80) p += 3 * (1 << ((buf[10] & 7) + 1));
    let total = 0, frames = 0, delay = 10;
    while (p < buf.length) {
      const b = buf[p++];
      if (b === 0x3b) break;
      if (b === 0x21) {
        const label = buf[p++];
        if (label === 0xf9 && buf[p] >= 4) { delay = buf.readUInt16LE(p + 2); if (delay < 2) delay = 10; }
        while (p < buf.length && buf[p] !== 0) p += buf[p] + 1;
        p++;
      } else if (b === 0x2c) {
        const packed = buf[p + 8];
        p += 9;
        if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
        p++; // LZW minimum code size
        while (p < buf.length && buf[p] !== 0) p += buf[p] + 1;
        p++;
        total += delay; frames++; delay = 10;
      } else break;
    }
    return frames > 1 ? total / 100 : 0;
  } catch { return 0; }
}

/* ---------- JSON saved through a temporary file that is then renamed over the real one, so a crash or power cut
   never leaves half a file. Each write has its own temporary name, so two saves at once cannot collide. ---------- */
let tmpSeq = 0;
function tmpName(f) { return f + '.' + process.pid + '-' + (++tmpSeq) + '.tmp'; }
// Windows can refuse a rename for a moment while antivirus or the search indexer has the file open.
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
async function writeJsonAtomic(f, data) {
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const tmp = tmpName(f);
  await fsp.writeFile(tmp, JSON.stringify(data));
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, f); return; } catch (err) {
      if (i >= 4 || !BUSY.has(err.code)) { await fsp.unlink(tmp).catch(() => {}); throw err; }
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
}
function writeJsonAtomicSync(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = tmpName(f);
  fs.writeFileSync(tmp, JSON.stringify(data));
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, f); return; } catch (err) {
      if (i >= 4 || !BUSY.has(err.code)) { try { fs.unlinkSync(tmp); } catch { /* gone */ } throw err; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));
    }
  }
}

module.exports = { MAX_FILES, expand, gifSeconds, writeJsonAtomic, writeJsonAtomicSync };
