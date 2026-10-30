'use strict';
// The cache: what Wallpane makes from media files (playable copies, thumbnails, previews, lighter copies) in
// <data>\cache\<kind>\. A made file is named by a hash of the original's path, size and modification time, so a
// changed original gets a new one; originals are never touched. Using a cached file marks it as used, and clean()
// keeps the cache under its limit by removing the files used longest ago. Files still being written end in ".part".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINDS = ['converted', 'thumbs', 'previews', 'proxies'];

function createCache(root) {
  function keyOf(file) {
    const st = fs.statSync(file);
    return crypto.createHash('sha1').update(path.resolve(file).toLowerCase() + '|' + st.size + '|' + Math.round(st.mtimeMs)).digest('hex').slice(0, 24);
  }
  function check(kind) { if (!KINDS.includes(kind)) throw new Error('Unknown cache kind: ' + kind); }
  // Where the made file for this original goes (the folder is made if needed).
  function pathFor(kind, file, ext) {
    check(kind);
    const dir = path.join(root, kind);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, keyOf(file) + '.' + ext);
  }
  // The made file, if it is there (and marked as used now), else null.
  function find(kind, file, ext) {
    let p;
    try { p = pathFor(kind, file, ext); } catch { return null; }
    try {
      const st = fs.statSync(p);
      fs.utimesSync(p, new Date(), st.mtime);
      return p;
    } catch { return null; }
  }
  function files() {
    const out = [];
    KINDS.forEach((kind) => {
      let names;
      try { names = fs.readdirSync(path.join(root, kind)); } catch { return; }
      names.forEach((n) => {
        const p = path.join(root, kind, n);
        try { const st = fs.statSync(p); if (st.isFile()) out.push({ kind, path: p, size: st.size, used: st.atimeMs, part: n.endsWith('.part'), age: Date.now() - st.mtimeMs }); } catch { /* gone */ }
      });
    });
    return out;
  }
  // { total, files, byKind: { converted, thumbs, previews, proxies } } in bytes.
  function info() {
    const byKind = {};
    KINDS.forEach((k) => { byKind[k] = 0; });
    const all = files();
    all.forEach((f) => { byKind[f.kind] += f.size; });
    return { dir: root, total: all.reduce((s, f) => s + f.size, 0), files: all.length, byKind };
  }
  // Down to the limit, the files used longest ago first. Unfinished files (.part) under a day old are left alone.
  // Returns the bytes freed.
  function clean(limit) {
    const all = files().filter((f) => !(f.part && f.age < 86400000)).sort((a, b) => a.used - b.used);
    let total = files().reduce((s, f) => s + f.size, 0), freed = 0;
    for (const f of all) {
      if (total <= limit) break;
      try { fs.unlinkSync(f.path); total -= f.size; freed += f.size; } catch { /* in use */ }
    }
    return freed;
  }
  // Everything (or one kind) removed; files in use stay. Returns the bytes freed.
  function clear(kind) {
    let freed = 0;
    files().filter((f) => !kind || f.kind === kind).forEach((f) => { try { fs.unlinkSync(f.path); freed += f.size; } catch { /* in use */ } });
    return freed;
  }
  return { root, KINDS, keyOf, pathFor, find, info, clean, clear };
}

module.exports = { createCache, KINDS };
