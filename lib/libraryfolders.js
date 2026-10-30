'use strict';
// Library folders (main process): keeping the library (lib/library.js) in step with the folders on disk.
// - A folder is scanned when it is added, when Wallpane starts, when its watcher notices a change, and on Rescan.
//   Scans of one folder never overlap: a change during a scan makes it scan once more after.
// - A folder that is not there (a drive that is not connected) keeps its files, and is looked for again every minute.
// - Files nobody has read yet get their details from one background job, two files at a time: pictures from their
//   first bytes (lib/imagesize.js), videos and anything else from ffprobe.
//
// createLibraryFolders({ library, scan, imageSize, gifSeconds, probeRaw, canProbe, watchers, jobs, notify, recheckMs })
//   scan(dir) -> lib/files.js scan(); probeRaw(file, { signal }) -> ffprobe JSON; canProbe() -> FFmpeg is there.
//   watchers: lib/watch.js (this module watches as the owner 'library'). notify(): a scan started or ended.
// Returns { ready, start, stop, folders, add, remove, rescan, rescanAll, onChanged, infoKind, readInfo }.
const path = require('path');
const mediainfo = require('./mediainfo');

const OWNER = 'library';

// What ffprobe says about a file, as the library keeps it (see INFO in lib/library.js).
function infoFromProbe(d, kind) {
  const v = d.video;
  if (!v || !v.width || !v.height) return { err: 'No picture in this file' };
  const out = { w: v.width, h: v.height };
  if (kind === 'video') {
    out.rot = v.rotation || 0;
    out.v = v.codec;
    out.play = mediainfo.verdict(d).action;
    if (d.duration > 0) out.dur = Math.round(d.duration * 100) / 100;
    if (v.fps) out.fps = v.fps;
    if (d.audio) out.a = d.audio.codec;
  }
  return out;
}

function createLibraryFolders(o) {
  const lib = o.library;
  const state = new Map();   // lower-case folder -> { available: true | false | null (not looked yet), scanning, again }
  let loaded = false, timer = null;
  function st(p) {
    const k = p.toLowerCase();
    if (!state.has(k)) state.set(k, { available: null, scanning: false, again: false });
    return state.get(k);
  }
  function tell() { if (o.notify) o.notify(); }
  function watch() { o.watchers.set(OWNER, lib.folders().map((f) => f.path)); }
  function canRead(e) { return e.kind !== 'video' || o.canProbe(); }

  // Reads library.json, once, on first use.
  function ready() {
    if (loaded) return;
    loaded = true;
    lib.load();
    watch();
  }
  // [{ path, added, files, pending, available, scanning }]
  function folders() {
    ready();
    return lib.folders().map((f) => { const s = st(f.path); return Object.assign(f, { available: s.available, scanning: s.scanning }); });
  }
  function folderOf(p) {
    const k = path.resolve(String(p)).toLowerCase();
    return lib.folders().find((f) => f.path.toLowerCase() === k) || null;
  }

  async function rescan(p) {
    ready();
    const f = folderOf(p);
    if (!f) return false;
    const s = st(f.path);
    if (s.scanning) { s.again = true; return true; }
    s.scanning = true;
    tell();
    try {
      do {
        s.again = false;
        const r = await o.scan(f.path);
        if (!folderOf(f.path)) break;   // removed meanwhile
        s.available = r.ok;
        if (r.ok) lib.sync(f.path, r.entries, { keep: r.truncated ? [f.path] : r.unread });
      } while (s.again);
    } finally { s.scanning = false; }
    watch();   // a drive that came back gets its watcher again
    queueInfo();
    tell();
    return true;
  }
  async function rescanAll() {
    ready();
    for (const f of lib.folders()) await rescan(f.path);
  }
  // A watched folder changed (lib/watch.js tells the owner 'library').
  function onChanged(root) { rescan(root).catch(() => { /* the next change or start tries again */ }); }

  // -> { status: 'added', path, took } once its files are in, or { status: 'inside', path } (see library.addFolder).
  async function add(p) {
    ready();
    const r = lib.addFolder(p);
    if (r && r.status === 'added') { r.took.forEach((t) => state.delete(t.toLowerCase())); watch(); await rescan(r.path); }
    return r;
  }
  function remove(p) {
    ready();
    const n = lib.removeFolder(p);
    if (n >= 0) { state.delete(path.resolve(String(p)).toLowerCase()); watch(); tell(); }
    return n;
  }

  // Loads the library, scans every folder, and from then on looks for missing folders every minute.
  async function start() {
    ready();
    await rescanAll();
    if (!timer) {
      timer = setInterval(() => {
        lib.folders().forEach((f) => { if (st(f.path).available === false) rescan(f.path).catch(() => {}); });
      }, o.recheckMs || 60000);
      if (timer.unref) timer.unref();
    }
  }
  function stop() { clearInterval(timer); timer = null; o.watchers.set(OWNER, []); }

  /* ---------- file details ---------- */
  // { w, h, … } for one file, { err } when it cannot be read, or null to leave it for later (gone, or a video
  // without FFmpeg).
  async function readInfo(e, signal) {
    try {
      if (e.kind !== 'video') {
        const s = await o.imageSize(e.path);
        if (s) {
          if (e.kind === 'gif' && o.gifSeconds) { const d = await o.gifSeconds(e.path); if (d > 0) s.dur = d; }
          return s;
        }
      }
      if (!o.canProbe()) return e.kind === 'video' ? null : { err: 'Not a picture Wallpane can read' };
      return infoFromProbe(mediainfo.describe(await o.probeRaw(e.path, { signal })), e.kind);
    } catch (err) {
      if (err && err.code === 'CANCELLED') throw err;
      if (err && err.code === 'ENOENT') return null;
      return { err: String((err && err.message) || err).slice(0, 200) };
    }
  }
  function queueInfo() {
    if (o.jobs && lib.needingInfo().some(canRead)) o.jobs.add({ kind: 'libinfo', key: 'libinfo', label: 'Library', priority: 'background' });
  }
  // The job kind: reads every file still without details, including ones that arrive while it runs.
  const infoKind = {
    heavy: false,
    async run(job, ctx) {
      const tried = new Set();
      let done = 0;
      for (;;) {
        const todo = lib.needingInfo().filter((e) => !tried.has(e.id) && canRead(e));
        if (!todo.length) break;
        const total = done + todo.length;
        let next = 0;
        const worker = async () => {
          while (next < todo.length) {
            if (ctx.signal.aborted) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
            const e = todo[next++];
            tried.add(e.id);
            const info = await readInfo(e, ctx.signal);
            if (info) lib.setInfo(e.id, info, e);
            ctx.progress(++done / total);
          }
        };
        await Promise.all([worker(), worker()]);
      }
      return { files: done };
    }
  };

  return { ready, start, stop, folders, add, remove, rescan, rescanAll, onChanged, infoKind, readInfo };
}

module.exports = { createLibraryFolders, infoFromProbe, OWNER };
