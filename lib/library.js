'use strict';
// The library (main process): the folders you add, and what Wallpane knows about every video, GIF and picture in
// them. It lives in <data>\library.json, which only this module reads and writes; the windows ask it for results and
// hear when something changed. It never touches the media files, and it does not scan on its own: a scan tells it
// what a folder holds now, through sync().
//
// createLibrary({ file, convertible, notify, onError, delay, maxWait, notifyEvery, now })
//   file: where library.json lives. convertible: videos FFmpeg can make playable (AVI, WMV, …) count (default true).
//   notify(): something changed (at most once every `notifyEvery` ms, 250).
//   Saving waits `delay` ms after the last change (2 s), but never longer than `maxWait` (30 s) after the first unsaved
//   one, so a long run of changes is still saved along the way. onError(err): a save failed (it is tried again with
//   the next change).
// Returns { load, folders, addFolder, removeFolder, sync, setInfo, needingInfo, all, get, find, query, flush, readOnly,
// and for collections: collections, makeCollection, renameCollection, dropCollection, addToCollection,
// takeFromCollection, moveInCollection, collectionFiles }.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const formats = require('../renderer/lib/formats');
const { writeJsonAtomicSync } = require('./files');

const VERSION = 1;
// What probing a file tells: its size in pixels as the picture shows (a phone video turned by 90° is taller than wide),
// length, frame rate, codecs and rotation, whether it plays as it is (play: none, maybe, remux, audio or convert, as
// mediainfo.verdict says), or why it could not be read (err). terr: why no thumbnail could be made.
const INFO = { w: 'number', h: 'number', dur: 'number', fps: 'number', v: 'string', a: 'string', rot: 'number', play: 'string', err: 'string', terr: 'string' };
// Saved for each file. Its library folder is not: loading finds it from the path.
const STORED = ['path', 'size', 'mtime', 'kind', 'added'].concat(Object.keys(INFO));
const NEEDS_COPY = ['remux', 'audio', 'convert'];
// Files that left the library are remembered this long, so one that comes back (moved or renamed) keeps its id.
const LOST_DAYS = 30, LOST_MAX = 10000;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// 'video', 'gif', 'image' or null (not media). convertible: videos FFmpeg can make playable count too.
function kindOf(p, convertible) { return formats.extOf(p) === 'gif' ? 'gif' : formats.kindOfName(p, convertible); }
function keyOf(p) { return String(p).toLowerCase(); }
function within(p, dir) {
  const a = keyOf(p), d = keyOf(dir);
  return a === d || a.startsWith(d.endsWith(path.sep) ? d : d + path.sep);
}
// Search text without accents and case: "cafe" finds "Café", "zagata" finds "Žagata".
function plain(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function sigOf(size, mtime) { return size + '|' + Math.round(mtime); }
// A collection's name: one line, at most 60 characters, or the fallback when there is nothing.
function cleanName(name, fallback) { return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 60) || fallback; }
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function stored(e) {
  const o = {};
  STORED.forEach((k) => { if (e[k] !== undefined && e[k] !== null) o[k] = e[k]; });
  return o;
}
// Copies the known facts of the right type from `info` onto `e` (null removes one). Returns whether anything changed.
function setFields(e, info) {
  let any = false;
  for (const k of Object.keys(INFO)) {
    if (!(k in info)) continue;
    let v = info[k];
    if (v === null || v === undefined) { if (e[k] !== undefined) { delete e[k]; any = true; } continue; }
    if (typeof v !== INFO[k] || (INFO[k] === 'number' && !isFinite(v))) continue;
    if (k === 'rot') v = ((Math.round(v) % 360) + 360) % 360;
    if (e[k] !== v) { e[k] = v; any = true; }
  }
  return any;
}

/* ---------- what the filters sort files into ---------- */
function shapeOf(e) {
  if (!(e.w > 0 && e.h > 0)) return null;
  const r = e.w / e.h;
  return r > 1.1 ? 'landscape' : r < 1 / 1.1 ? 'portrait' : 'square';
}
function lengthOf(e) { return e.dur > 0 ? (e.dur < 30 ? 'short' : e.dur <= 300 ? 'medium' : 'long') : null; }
// By the long side, so a portrait 1080 × 1920 video is Full HD too.
function resOf(e) {
  const l = Math.max(e.w || 0, e.h || 0);
  return l ? (l >= 3200 ? '4k' : l >= 1800 ? 'fhd' : l >= 1200 ? 'hd' : 'sd') : null;
}
// Not probed yet: an AVI, WMV, … surely needs a copy.
function needsCopy(e) { return e.play ? NEEDS_COPY.includes(e.play) : formats.convertible(e.path); }
// Sorted by a number, biggest or newest first (dir -1 turns that round); files without it last, then by name.
function byValue(f, dir) {
  return (a, b) => {
    const x = f(a), y = f(b), hx = typeof x === 'number' && isFinite(x), hy = typeof y === 'number' && isFinite(y);
    if (hx !== hy) return hx ? -1 : 1;
    return ((hx && y - x) || a.rank - b.rank) * dir;
  };
}
const VALUES = { added: (e) => e.added, changed: (e) => e.mtime, length: (e) => e.dur, size: (e) => e.size };

function createLibrary(o) {
  const file = o.file;
  const delay = o.delay === undefined ? 2000 : o.delay, maxWait = o.maxWait === undefined ? 30000 : o.maxWait;
  const notifyEvery = o.notifyEvery === undefined ? 250 : o.notifyEvery;
  const now = o.now || Date.now;
  const convertible = o.convertible !== false;
  const kind = (p) => kindOf(p, convertible);
  let folders = [];             // [{ path, added }]
  const files = new Map();      // id -> entry
  const byPath = new Map();     // lower-case path -> entry
  const bySig = new Map();      // size|time -> Set of entries, to find a copy of a file that left
  let lost = [];                // files that left lately, oldest first: [{ id, at, e }]
  let collections = [];         // your own lists of files: [{ id, name, files: [file ids, in their order] }]
  let order = null;             // every entry sorted by name; made again after names change
  let readOnly = false, dirty = false, firstChange = 0, saveAt = 0, saveTimer = null, noteTimer = null;

  /* ---------- the indexes ---------- */
  function describe(e) {
    e.name = path.basename(e.path);
    const sub = path.relative(e.folder, path.dirname(e.path));
    e.find = plain([e.name, path.basename(e.folder), sub.split(path.sep).join(' ')].join(' '));
  }
  function put(e) {
    describe(e);
    files.set(e.id, e); byPath.set(keyOf(e.path), e);
    const s = sigOf(e.size, e.mtime);
    if (!bySig.has(s)) bySig.set(s, new Set());
    bySig.get(s).add(e);
    order = null;
  }
  function drop(e) {
    files.delete(e.id); byPath.delete(keyOf(e.path));
    const s = sigOf(e.size, e.mtime), set = bySig.get(s);
    if (set) { set.delete(e); if (!set.size) bySig.delete(s); }
    order = null;
  }
  function byName() {
    if (!order) {
      order = [...files.values()].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.path, b.path));
      order.forEach((e, i) => { e.rank = i; });
    }
    return order;
  }
  function newId() {
    let id;
    do { id = 'f' + crypto.randomBytes(6).toString('hex'); } while (files.has(id));
    return id;
  }
  function folderFor(p) { return folders.find((f) => within(p, f.path)) || null; }

  /* ---------- saving and telling ---------- */
  function changed() {
    dirty = true;
    if (!readOnly) {
      const t = now();
      if (!firstChange) firstChange = t;
      const at = Math.min(t + delay, firstChange + maxWait);
      if (!(saveTimer && at === saveAt)) {
        clearTimeout(saveTimer); saveAt = at;
        saveTimer = setTimeout(flush, Math.max(0, at - t));
        if (saveTimer.unref) saveTimer.unref();
      }
    }
    if (o.notify && !noteTimer) noteTimer = setTimeout(() => { noteTimer = null; o.notify(); }, notifyEvery);
  }
  function pruneLost() {
    const old = now() - LOST_DAYS * 86400000;
    lost = lost.filter((l) => l.at >= old).slice(-LOST_MAX);
  }
  function snapshot() {
    pruneLost();
    // A collection forgets files that are neither in the library nor remembered as lately gone.
    const back = new Set(lost.map((l) => l.id));
    collections.forEach((c) => { c.files = c.files.filter((id) => files.has(id) || back.has(id)); });
    const out = {};
    for (const e of files.values()) out[e.id] = stored(e);
    return { version: VERSION, folders: folders.map((f) => ({ path: f.path, added: f.added })), files: out, lost, collections };
  }
  // Saves now if anything changed (also used when Wallpane closes). Returns whether it saved.
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty || readOnly) return false;
    try { writeJsonAtomicSync(file, snapshot()); } catch (err) { if (o.onError) o.onError(err); return false; }
    dirty = false; firstChange = 0;
    return true;
  }

  /* ---------- loading ---------- */
  function clean(r) {
    if (!r || typeof r.path !== 'string' || !r.path) return null;
    const k = kind(r.path);
    if (!k) return null;
    const e = { path: r.path, size: +r.size || 0, mtime: Math.round(+r.mtime || 0), kind: k, added: +r.added || 0 };
    setFields(e, r);
    return e;
  }
  // Reads library.json. A missing file is an empty library. A damaged one is kept aside as library.json.bad and the
  // library starts empty; one written by a newer Wallpane is read but never overwritten. Returns { files, folders }
  // and, when so, damaged: true or readOnly: true.
  function load() {
    let text, data;
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
      if (err.code === 'ENOENT') return { files: 0, folders: 0 };
      throw err;
    }
    try { data = JSON.parse(text); } catch {
      try { fs.renameSync(file, file + '.bad'); } catch { /* left where it is */ }
      return { files: 0, folders: 0, damaged: true };
    }
    if (!data || typeof data !== 'object') data = {};
    readOnly = (+data.version || 0) > VERSION;
    folders = [];
    (Array.isArray(data.folders) ? data.folders : [])
      .filter((f) => f && typeof f.path === 'string' && f.path)
      .map((f) => ({ path: path.resolve(f.path), added: +f.added || 0 }))
      .sort((a, b) => a.path.length - b.path.length)
      .forEach((f) => { if (!folderFor(f.path)) folders.push(f); });
    folders.sort((a, b) => collator.compare(a.path, b.path));
    files.clear(); byPath.clear(); bySig.clear(); order = null;
    const src = data.files && typeof data.files === 'object' ? data.files : {};
    for (const id of Object.keys(src)) {
      const e = clean(src[id]), home = e && folderFor(e.path);
      if (!home || files.has(id) || byPath.has(keyOf(e.path))) continue;
      e.id = id; e.folder = home.path;
      put(e);
    }
    lost = (Array.isArray(data.lost) ? data.lost : [])
      .map((l) => l && typeof l.id === 'string' && !files.has(l.id) && clean(l.e) ? { id: l.id, at: +l.at || 0, e: clean(l.e) } : null)
      .filter(Boolean);
    pruneLost();
    collections = (Array.isArray(data.collections) ? data.collections : [])
      .filter((c) => c && typeof c.id === 'string' && c.id && Array.isArray(c.files))
      .map((c) => ({ id: c.id, name: cleanName(c.name, 'Collection'), files: [...new Set(c.files.filter((x) => typeof x === 'string'))] }));
    dirty = false;
    const res = { files: files.size, folders: folders.length };
    if (readOnly) res.readOnly = true;
    return res;
  }

  /* ---------- folders ---------- */
  // [{ path, added, files, pending }]: pending files still wait for their details (see needingInfo).
  function folderList() {
    const count = new Map(), pending = new Map();
    for (const e of files.values()) {
      const k = keyOf(e.folder);
      count.set(k, (count.get(k) || 0) + 1);
      if (e.w === undefined && e.err === undefined) pending.set(k, (pending.get(k) || 0) + 1);
    }
    return folders.map((f) => ({ path: f.path, added: f.added, files: count.get(keyOf(f.path)) || 0, pending: pending.get(keyOf(f.path)) || 0 }));
  }
  // -> { status: 'added', path, took: [library folders it took in] } or { status: 'inside', path: the library folder
  // it is part of already }. Its files come with the next sync().
  function addFolder(p) {
    if (typeof p !== 'string' || !p) return null;
    const dir = path.resolve(p);
    const outer = folderFor(dir);
    if (outer) return { status: 'inside', path: outer.path };
    // A folder around library folders takes them in, files and all.
    const inner = folders.filter((f) => within(f.path, dir));
    folders = folders.filter((f) => !inner.includes(f));
    folders.push({ path: dir, added: now() });
    folders.sort((a, b) => collator.compare(a.path, b.path));
    if (inner.length) for (const e of files.values()) if (within(e.path, dir)) { e.folder = dir; describe(e); }
    changed();
    return { status: 'added', path: dir, took: inner.map((f) => f.path) };
  }
  // Forgets a library folder and its files. Returns how many files went (or -1 when it was not a library folder).
  function removeFolder(p) {
    const k = keyOf(path.resolve(String(p)));
    const i = folders.findIndex((f) => keyOf(f.path) === k);
    if (i < 0) return -1;
    folders.splice(i, 1);
    const gone = [...files.values()].filter((e) => keyOf(e.folder) === k);
    gone.forEach(drop);
    changed();
    return gone.length;
  }

  /* ---------- files ---------- */
  // References to a file that left go to its copy (same name, size and time) that is still in the library.
  function redirect(from, to) {
    if (from.added && (!to.added || from.added < to.added)) to.added = from.added;
    collections.forEach((c) => {
      if (!c || !Array.isArray(c.files) || !c.files.includes(from.id)) return;
      c.files = c.files.map((id) => (id === from.id ? to.id : id)).filter((id, i, a) => a.indexOf(id) === i);
    });
  }
  // What a library folder holds now, from a full scan: [{ path, size, mtime }]. New files come in; a changed file
  // forgets what probing told (it is probed again); files no longer there leave. A file that left (from here or from
  // another library folder) and turns up with the same size and time keeps its id: the same name anywhere means it
  // was moved, and a different name is taken as a rename when only one file could be meant.
  // opts.keep: folders the scan could not read; their files stay as they are.
  // Returns { added, changed, moved, removed }, each a list of ids, or null when `p` is not a library folder.
  function sync(p, entries, opts) {
    const k = keyOf(path.resolve(String(p)));
    const home = folders.find((f) => keyOf(f.path) === k);
    if (!home) return null;
    const keep = (opts && Array.isArray(opts.keep) ? opts.keep : []).filter((d) => typeof d === 'string' && d);
    const res = { added: [], changed: [], moved: [], removed: [] };
    const t = now();
    let any = false;
    const here = new Map();
    for (const r of Array.isArray(entries) ? entries : []) {
      if (!r || typeof r.path !== 'string' || !within(r.path, home.path) || !kind(r.path)) continue;
      here.set(keyOf(r.path), { path: r.path, size: +r.size || 0, mtime: Math.round(+r.mtime || 0) });
    }
    // Gone first, so that a renamed file can be recognised below.
    for (const e of [...files.values()]) {
      if (keyOf(e.folder) !== k || here.has(keyOf(e.path)) || keep.some((d) => within(e.path, d))) continue;
      drop(e); res.removed.push(e.id); any = true;
      const twins = bySig.get(sigOf(e.size, e.mtime));
      const twin = twins && [...twins].find((x) => keyOf(x.name) === keyOf(e.name));
      if (twin) redirect(e, twin);
      else lost.push({ id: e.id, at: t, e: stored(e) });
    }
    const back = new Map();   // size|time -> files that left
    lost.forEach((l) => { const s = sigOf(l.e.size, l.e.mtime); if (!back.has(s)) back.set(s, []); back.get(s).push(l); });
    function takeBack(r) {
      const list = (back.get(sigOf(r.size, r.mtime)) || []).filter((l) => !l.taken);
      const name = keyOf(path.basename(r.path));
      const l = list.find((x) => keyOf(path.basename(x.e.path)) === name) || (list.length === 1 ? list[0] : null);
      if (l) l.taken = true;
      return l;
    }
    for (const [key, r] of here) {
      const e = byPath.get(key);
      if (e) {
        if (e.size === r.size && e.mtime === r.mtime) {
          if (e.path !== r.path) { e.path = r.path; describe(e); order = null; any = true; }   // only the case changed
          continue;
        }
        drop(e);
        e.path = r.path; e.size = r.size; e.mtime = r.mtime;
        Object.keys(INFO).forEach((f) => { delete e[f]; });
        put(e); res.changed.push(e.id); any = true;
        continue;
      }
      const l = takeBack(r);
      const n = Object.assign(l ? l.e : { added: t }, { id: l ? l.id : newId(), path: r.path, folder: home.path, size: r.size, mtime: r.mtime, kind: kind(r.path) });
      put(n);
      (l ? res.moved : res.added).push(n.id); any = true;
    }
    lost = lost.filter((l) => !l.taken);
    if (any) changed();
    return res;
  }
  // Facts from probing a file (see INFO). With `was` ({ size, mtime }, what the file was when probed), facts about a
  // file that has changed since are ignored. Returns whether anything changed.
  function setInfo(id, info, was) {
    const e = files.get(id);
    if (!e || !info || typeof info !== 'object') return false;
    if (was && (e.size !== +was.size || e.mtime !== Math.round(+was.mtime))) return false;
    const any = setFields(e, info);
    if (any) changed();
    return any;
  }
  // Files nobody has probed yet: [{ id, path, kind, size, mtime }].
  function needingInfo() {
    const out = [];
    for (const e of files.values()) if (e.w === undefined && e.err === undefined) out.push({ id: e.id, path: e.path, kind: e.kind, size: e.size, mtime: e.mtime });
    return out;
  }
  // Every file, for background work: [{ id, path, kind, size, mtime, w, dur, err, terr }].
  function all() {
    const out = [];
    for (const e of files.values()) out.push({ id: e.id, path: e.path, kind: e.kind, size: e.size, mtime: e.mtime, w: e.w, dur: e.dur, err: e.err, terr: e.terr });
    return out;
  }
  function view(e) { return e ? Object.assign({ id: e.id, name: e.name, folder: e.folder }, stored(e)) : null; }
  function get(id) { return view(files.get(id)); }
  function find(p) { return view(byPath.get(keyOf(p))); }

  /* ---------- collections: your own lists of files ---------- */
  function collectionOf(id) { return collections.find((c) => c.id === id) || null; }
  // Adds files (ids of files in the library, each once) at the end. Returns how many came in.
  function addTo(c, ids) {
    let n = 0;
    for (const id of Array.isArray(ids) ? ids : []) if (files.has(id) && !c.files.includes(id)) { c.files.push(id); n++; }
    return n;
  }
  // [{ id, name, files }]: files counts those in the library now.
  function collectionList() {
    return collections.map((c) => ({ id: c.id, name: c.name, files: c.files.filter((id) => files.has(id)).length }));
  }
  // A new collection, with these files in it if any. -> { id, name, files }
  function makeCollection(name, ids) {
    let id;
    do { id = 'c' + crypto.randomBytes(5).toString('hex'); } while (collectionOf(id));
    const c = { id, name: cleanName(name, 'New collection'), files: [] };
    collections.push(c);
    addTo(c, ids);
    changed();
    return { id: c.id, name: c.name, files: c.files.length };
  }
  function renameCollection(id, name) {
    const c = collectionOf(id);
    if (!c) return false;
    c.name = cleanName(name, c.name);
    changed();
    return true;
  }
  // The collection goes; its files stay where they are.
  function dropCollection(id) {
    const i = collections.findIndex((c) => c.id === id);
    if (i < 0) return false;
    collections.splice(i, 1);
    changed();
    return true;
  }
  // Returns how many files came in (-1: no such collection).
  function addToCollection(id, ids) {
    const c = collectionOf(id);
    if (!c) return -1;
    const n = addTo(c, ids);
    if (n) changed();
    return n;
  }
  // Returns how many files went out of it (-1: no such collection).
  function takeFromCollection(id, ids) {
    const c = collectionOf(id), out = new Set(Array.isArray(ids) ? ids : []);
    if (!c) return -1;
    const before = c.files.length;
    c.files = c.files.filter((x) => !out.has(x));
    if (c.files.length !== before) changed();
    return before - c.files.length;
  }
  // Moves files (ids, in the order given) to just before `before` (another file in it), or to the end.
  function moveInCollection(id, ids, before) {
    const c = collectionOf(id);
    if (!c) return false;
    const moving = [...new Set(Array.isArray(ids) ? ids : [])].filter((x) => c.files.includes(x));
    if (!moving.length) return false;
    const rest = c.files.filter((x) => !moving.includes(x));
    const at = before && rest.includes(before) ? rest.indexOf(before) : rest.length;
    const next = rest.slice(0, at).concat(moving, rest.slice(at));
    if (next.join() === c.files.join()) return false;
    c.files = next;
    changed();
    return true;
  }
  // What a tile playing the collection plays: its files in the library now, in its order: [{ id, path, name, kind }].
  function collectionFiles(id) {
    const c = collectionOf(id);
    return c ? c.files.map((x) => files.get(x)).filter(Boolean).map((e) => ({ id: e.id, path: e.path, name: e.name, kind: e.kind })) : null;
  }

  /* ---------- searching ---------- */
  // q: { text, folder, collection, kinds: ['video', 'gif', 'image'], shape: 'landscape' | 'portrait' | 'square',
  //      length: 'short' | 'medium' | 'long', res: 'sd' | 'hd' | 'fhd' | '4k', needsCopy: bool,
  //      sort: 'name' | 'added' | 'changed' | 'length' | 'size' | 'random' | 'order', reverse: bool, seed }
  // Every word of the text must be in the file's name or the names of its folders. Names sort A to Z (numbers by
  // value), the others biggest or newest first; random is the same order for the same seed; 'order' is a
  // collection's own order.
  // -> { total, count, items: [{ id, name, path, kind, w, h, dur }] }.
  function query(q) {
    q = q || {};
    const words = plain(q.text || '').split(/\s+/).filter(Boolean);
    const scope = typeof q.folder === 'string' && q.folder ? path.resolve(q.folder) : null;
    const kinds = Array.isArray(q.kinds) && q.kinds.length ? q.kinds : null;
    const coll = q.collection ? collectionOf(q.collection) : null;
    if (q.collection && !coll) return { total: files.size, count: 0, items: [] };
    const all = byName();   // also gives every file its rank by name
    let list = (coll ? coll.files.map((x) => files.get(x)).filter(Boolean) : all).filter((e) => (!scope || within(e.path, scope)) &&
      (!kinds || kinds.includes(e.kind)) && (!q.shape || shapeOf(e) === q.shape) && (!q.length || lengthOf(e) === q.length) &&
      (!q.res || resOf(e) === q.res) && (!q.needsCopy || needsCopy(e)) && words.every((w) => e.find.includes(w)));
    if (q.sort === 'random') {
      const seed = String(q.seed === undefined ? '' : q.seed);
      list = list.map((e) => [hash(seed + e.id), e]).sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank).map((x) => x[1]);
    } else if (VALUES[q.sort]) list.sort(byValue(VALUES[q.sort], q.reverse ? -1 : 1));
    else {
      if (coll && q.sort !== 'order') list.sort((a, b) => a.rank - b.rank);
      if (q.reverse) list.reverse();
    }
    const items = list.map((e) => ({ id: e.id, name: e.name, path: e.path, kind: e.kind, w: e.w || 0, h: e.h || 0, dur: e.dur || 0 }));
    return { total: files.size, count: items.length, items };
  }

  return {
    load, folders: folderList, addFolder, removeFolder, sync, setInfo, needingInfo, all, get, find, query, flush,
    collections: collectionList, makeCollection, renameCollection, dropCollection, addToCollection, takeFromCollection,
    moveInCollection, collectionFiles, readOnly: () => readOnly
  };
}

module.exports = { createLibrary, VERSION };
