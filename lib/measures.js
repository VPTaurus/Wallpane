'use strict';
// Something measured once per video with FFmpeg (main process): its loudness (lib/loudness.js), its opening
// (lib/openings.js). Kept in a JSON file by the file's path, size and time (the latest KEEP), so a changed file is
// measured again. Each window says which videos its wall shows (want); the ones not measured yet are measured one at a
// time, in that order, and every window hears each result (notify). A failed measure counts as null and is not tried
// again until the file changes.
//
// createMeasures({ ffmpeg, cache, file, measure, notify })
//   measure(path) -> Promise<value | null> (its FFmpeg runs at below-normal priority, as every run)
//   want(owner, paths) -> { path: value } for the ones measured already; the rest are measured, and owner's earlier
//     list is replaced (a file its wall no longer shows is not measured for it)
//   notify({ path: value }) as each is measured
const fs = require('fs');
const files = require('./files');

const KEEP = 20000;

function createMeasures(o) {
  const ff = o.ffmpeg, cache = o.cache;
  let known = {};   // key -> [value, last used (ms)]
  try { const j = JSON.parse(fs.readFileSync(o.file, 'utf8')); if (j && j.files) known = j.files; } catch { /* none yet */ }
  const owners = new Map();   // owner -> [{ path, key }] it waits for
  let busy = false, saveTimer = null;

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const keys = Object.keys(known);
      if (keys.length > KEEP) keys.sort((a, b) => known[a][1] - known[b][1]).slice(0, keys.length - KEEP).forEach((k) => { delete known[k]; });
      files.writeJsonAtomic(o.file, { files: known }).catch(() => { /* measured again next time */ });
    }, 2000);
  }
  function next() {
    for (const list of owners.values()) {
      const w = list.find((x) => !known[x.key]);
      if (w) return w;
    }
    return null;
  }
  async function pump() {
    if (busy || !ff.available()) return;
    const w = next();
    if (!w) return;
    busy = true;
    let value = null;
    try { value = await o.measure(w.path); } catch { /* not measurable */ }
    known[w.key] = [value === undefined ? null : value, Date.now()];
    save();
    for (const [owner, list] of owners) owners.set(owner, list.filter((x) => x.key !== w.key));
    busy = false;
    if (o.notify) o.notify({ [w.path]: known[w.key][0] });
    pump();
  }
  function want(owner, paths) {
    const out = {}, wait = [];
    for (const p of (Array.isArray(paths) ? paths : []).slice(0, 500)) {
      if (typeof p !== 'string' || !p) continue;
      let key;
      try { key = cache.keyOf(p); } catch { continue; }   // gone
      if (known[key]) { known[key][1] = Date.now(); out[p] = known[key][0]; } else wait.push({ path: p, key });
    }
    owners.set(owner, wait);
    pump();
    return out;
  }
  return { want };
}

module.exports = { createMeasures, KEEP };
