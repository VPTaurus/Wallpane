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
   opts.max lowers the file limit (for tests). opts.audio finds music instead (kind 'audio'), for background music.
   opts.convertible: FFmpeg can make AVI, WMV, … playable, so they count as videos. */
async function expand(paths, opts) {
  const max = (opts && opts.max) || MAX_FILES, audio = !!(opts && opts.audio), convertible = !!(opts && opts.convertible);
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
      const kind = audio ? (formats.isAudio(p) ? 'audio' : null) : formats.kindOfName(p, convertible);
      if (!kind) {
        if (!audio && formats.isUnplayable(p)) { const e = formats.extOf(p); unsupported[e] = (unsupported[e] || 0) + 1; }
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

/* ---------- library folders: everything in them, with sizes and times ---------- */
const SCAN_MAX = 200000, SCAN_DEPTH = 32;
// Folders Windows keeps on every drive; never media.
const SYSTEM_DIRS = new Set(['$recycle.bin', 'system volume information']);
/* Every media file in a folder and its subfolders, for the library. isMedia(path) says which files count.
   Returns { ok, entries: [{ path, size, mtime }], unread, truncated }:
   - ok: false when the folder itself is not there (a drive that is not connected); then nothing is known.
   - unread: folders whose files are unknown (they could not be read, or lie more than SCAN_DEPTH deep).
   - truncated: stopped at opts.max files (SCAN_MAX by default).
   Hidden names (starting with a dot), Windows' own folders and links are skipped. */
async function scan(dir, isMedia, opts) {
  const max = (opts && opts.max) || SCAN_MAX;
  const entries = [], unread = [];
  let truncated = false;
  try { if (!(await fsp.stat(dir)).isDirectory()) return { ok: false, entries, unread }; } catch { return { ok: false, entries, unread }; }
  async function walk(d, depth) {
    let list;
    try { list = await fsp.readdir(d, { withFileTypes: true }); } catch { unread.push(d); return; }
    const subs = [], found = [];
    for (const de of list) {
      if (de.name.startsWith('.') || de.isSymbolicLink()) continue;
      const p = path.join(d, de.name);
      if (de.isDirectory()) {
        if (SYSTEM_DIRS.has(de.name.toLowerCase())) continue;
        if (depth >= SCAN_DEPTH) unread.push(p); else subs.push(p);
      } else if (de.isFile() && isMedia(p)) found.push(p);
    }
    // Sizes and times, 32 files at a time.
    for (let i = 0; i < found.length && !truncated; i += 32) {
      const part = found.slice(i, i + 32);
      const sts = await Promise.all(part.map((p) => fsp.stat(p).catch(() => null)));
      sts.forEach((st, j) => {
        if (!st) return;
        if (entries.length >= max) { truncated = true; return; }
        entries.push({ path: part[j], size: st.size, mtime: Math.round(st.mtimeMs) });
      });
    }
    for (const s of subs) {
      if (truncated) return;
      await walk(s, depth + 1);
    }
  }
  await walk(dir, 0);
  return { ok: true, entries, unread, truncated };
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
// Saves to one file go one after another, and of those waiting only the latest is written (the others' promises end
// with it): an older save that Windows held up can never land after a newer one. A save made at once (Sync, as a
// window closes) wins over one still under way, which then leaves the file alone.
const queues = new Map();   // file -> { busy, next: { data, waiters } | null, gen }
function queueOf(f) {
  const key = path.resolve(f).toLowerCase();
  if (!queues.has(key)) queues.set(key, { busy: false, next: null, gen: 0 });
  return queues.get(key);
}
function writeJsonAtomic(f, data) {
  const q = queueOf(f);
  return new Promise((resolve, reject) => {
    if (q.next) { q.next.data = data; q.next.waiters.push({ resolve, reject }); } else q.next = { data, waiters: [{ resolve, reject }] };
    pumpWrites(f, q);
  });
}
async function pumpWrites(f, q) {
  if (q.busy || !q.next) return;
  const job = q.next;
  q.next = null; q.busy = true;
  try { await writeOnce(f, job.data, q, ++q.gen); job.waiters.forEach((w) => w.resolve()); } catch (err) { job.waiters.forEach((w) => w.reject(err)); }
  q.busy = false;
  pumpWrites(f, q);
}
async function writeOnce(f, data, q, gen) {
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const tmp = tmpName(f);
  await fsp.writeFile(tmp, JSON.stringify(data));
  for (let i = 0; ; i++) {
    if (q.gen !== gen) { await fsp.unlink(tmp).catch(() => {}); return; }   // saved at once meanwhile: that one stands
    try { await fsp.rename(tmp, f); return; } catch (err) {
      if (i >= 4 || !BUSY.has(err.code)) { await fsp.unlink(tmp).catch(() => {}); throw err; }
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
}
function writeJsonAtomicSync(f, data) {
  const q = queueOf(f);
  q.gen++;   // a save still under way leaves the file to this one
  if (q.next) { q.next.waiters.forEach((w) => w.resolve()); q.next = null; }
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

// The app's data files (saved walls, layouts, settings, last wall, window places), by name.
const DATA_FILE = /^(?:(?:prefs|session)(?:-\d+)?|presets|layouts|window)\.json$/;
// Copy the data files from the folder of an older app name into the current one, once: only when the current
// folder has no data of its own yet. The old folder stays as it is. Returns how many files were copied.
function migrateData(oldDir, newDir) {
  if (!oldDir || !newDir || path.resolve(oldDir).toLowerCase() === path.resolve(newDir).toLowerCase() || !fs.existsSync(oldDir)) return 0;
  const names = fs.readdirSync(oldDir).filter((n) => DATA_FILE.test(n));
  if (!names.length) return 0;
  fs.mkdirSync(newDir, { recursive: true });
  if (fs.readdirSync(newDir).some((n) => DATA_FILE.test(n))) return 0;
  for (const n of names) fs.copyFileSync(path.join(oldDir, n), path.join(newDir, n));
  return names.length;
}

module.exports = { MAX_FILES, expand, scan, gifSeconds, writeJsonAtomic, writeJsonAtomicSync, migrateData };
