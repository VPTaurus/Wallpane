'use strict';
// Watches playlist folders for new or removed files. Each window says which folders it needs; a folder is watched
// once however many windows need it, and stops being watched when none do. Bursts of changes (a big copy) are
// gathered into one notice per folder.
const fs = require('fs');

/* opts.notify(owner, root): called when a watched folder changed, once per window that watches it.
   opts.watch: fs.watch, replaceable in tests. opts.delay: ms to wait for a burst of changes to settle. */
function createWatchers(opts) {
  const watch = opts.watch || fs.watch;
  const delay = opts.delay === undefined ? 1500 : opts.delay;
  const byRoot = new Map();   // lower-case folder -> { root, owners: Set, watcher, timer }

  function stop(key) {
    const w = byRoot.get(key);
    if (!w) return;
    clearTimeout(w.timer);
    try { w.watcher.close(); } catch { /* already closed */ }
    byRoot.delete(key);
  }
  function start(root, key) {
    let watcher;
    try { watcher = watch(root, { recursive: true, persistent: false }); } catch { return null; }
    const w = { root, owners: new Set(), watcher, timer: null };
    watcher.on('change', () => {
      clearTimeout(w.timer);
      w.timer = setTimeout(() => { for (const o of w.owners) opts.notify(o, w.root); }, delay);
    });
    // A folder that disappears (or a drive that goes away) ends its watcher; the page's slow rescan still covers it.
    watcher.on('error', () => stop(key));
    byRoot.set(key, w);
    return w;
  }
  // The folders `owner` needs now. Returns how many of them are being watched.
  function set(owner, roots) {
    const want = new Map();
    for (const r of Array.isArray(roots) ? roots : []) {
      if (typeof r === 'string' && r && want.size < 24 && !want.has(r.toLowerCase())) want.set(r.toLowerCase(), r);
    }
    for (const [key, w] of byRoot) {
      if (w.owners.has(owner) && !want.has(key)) { w.owners.delete(owner); if (!w.owners.size) stop(key); }
    }
    let n = 0;
    for (const [key, root] of want) {
      const w = byRoot.get(key) || start(root, key);
      if (w) { w.owners.add(owner); n++; }
    }
    return n;
  }
  function dropOwner(owner) { set(owner, []); }
  function closeAll() { for (const key of [...byRoot.keys()]) stop(key); }
  function watched() { return [...byRoot.values()].map((w) => ({ root: w.root, owners: [...w.owners] })); }

  return { set, dropOwner, closeAll, watched };
}

module.exports = { createWatchers };
