'use strict';
// Even loudness (main process): each video's integrated loudness (EBU R128, in LUFS), measured once with FFmpeg's
// ebur128 filter on its sound alone (so even a film takes seconds) and kept in loudness.json by the file's path, size
// and time. Each window says which videos its wall shows (want); the ones not measured yet are measured one at a
// time, in that order, and every window hears each result (notify). A video with no sound, or one FFmpeg cannot read,
// is kept as null and not tried again until it changes.
//
// createLoudness({ ffmpeg, cache, file, notify })
//   want(owner, paths) -> { path: lufs | null } for the ones measured already; the rest are measured, and owner's
//     earlier list is replaced (a file its wall no longer shows is not measured for it)
//   notify({ path: lufs | null }) as each is measured
const fs = require('fs');
const FF = require('./ffmpeg');
const files = require('./files');

const KEEP = 20000;   // results kept, the ones used longest ago go first

function loudnessArgs(file) {
  return ['-nostats', '-v', 'info', '-threads', '1'].concat(FF.input(file),
    ['-map', '0:a:0', '-vn', '-sn', '-dn', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
}
// The integrated loudness from ebur128's summary (the last "I:" line), or null for silence or none.
function parse(text) {
  const all = String(text).match(/\bI:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+LUFS/g);
  if (!all) return null;
  const v = parseFloat(all[all.length - 1].replace(/^I:\s+/, ''));
  return isFinite(v) && v > -70 ? Math.round(v * 10) / 10 : null;
}

function createLoudness(o) {
  const ff = o.ffmpeg, cache = o.cache;
  let known = {};   // key -> [lufs | null, last used (ms)]
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
    let lufs = null;
    try { lufs = parse((await ff.run('ffmpeg', loudnessArgs(w.path), { timeoutMs: 10 * 60 * 1000 })).stderr); } catch { /* no sound, or unreadable */ }
    known[w.key] = [lufs, Date.now()];
    save();
    for (const [owner, list] of owners) owners.set(owner, list.filter((x) => x.key !== w.key));
    busy = false;
    if (o.notify) o.notify({ [w.path]: lufs });
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

module.exports = { createLoudness, loudnessArgs, parse };
