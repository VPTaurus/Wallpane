// Folder playlists: one folder feeds one or more tiles. A playlist is plain data:
// { name, files: [{ path, name, kind }], shuffle, secs, randomStart, maxClip, fade, gifOnce, root, order, pos, truncated }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'));
  else (root.MW = root.MW || {}).pl = factory(root.MW.util);
})(this, function (U) {
  'use strict';
  var MAX_PLAYLISTS = 24, MAX_FILES = 3000;

  function fileOf(f) { return { path: f.path, name: f.name, kind: f.kind }; }
  function makeOrder(n, shuffle, rnd) {
    rnd = rnd || Math.random;
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    if (shuffle) for (i = n - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // The next file to show. A new round (reshuffled if the playlist shuffles) starts when the last one is used up.
  function nextFile(p) {
    var n = p.files.length;
    if (!n) return null;
    if (!p.order || p.order.length !== n || p.pos >= n) { p.order = makeOrder(n, p.shuffle); p.pos = 0; }
    return p.files[p.order[p.pos++]];
  }
  // A new playlist from a folder's files. `opts` holds the Playlist panel options; `root` is the folder, when known.
  function make(files, opts, root) {
    opts = opts || {};
    var dir = root || U.dirOf(files[0].path);
    return {
      name: (U.baseName(dir) || dir || 'Playlist').slice(0, 60), files: files.map(fileOf),
      shuffle: !!opts.shuffle, secs: U.clamp(+opts.secs || 10, 2, 300), randomStart: !!opts.randomStart,
      maxClip: U.clamp(+opts.maxClip || 0, 0, 3600), fade: U.clamp(+opts.fade || 0, 0, 5), gifOnce: !!opts.gifOnce,
      root: root || null, order: null, pos: 0, truncated: false
    };
  }
  // The folder a playlist came from, if every file really lives inside it. Used to pick up new files.
  function rootFor(res, files) {
    var root = res && res.root ? res.root : (res && res.dirs && res.dirs.length === 1 ? res.dirs[0] : null);
    if (!root) return null;
    var pre = root.replace(/[\\/]+$/, '').toLowerCase();
    return files.every(function (f) { var q = f.path.toLowerCase(); return q.indexOf(pre) === 0 && /[\\/]/.test(q.charAt(pre.length)); }) ? root : null;
  }
  // The folder was scanned again: drop files that are gone and queue new ones, without replaying what already played
  // this round. Returns how many files were added.
  function refresh(p, entries, rnd) {
    rnd = rnd || Math.random;
    var files = entries.map(fileOf);
    var idx = {};
    files.forEach(function (f, i) { idx[f.path] = i; });
    if (!p.order || p.order.length !== p.files.length) { p.order = makeOrder(p.files.length, p.shuffle, rnd); p.pos = 0; }
    var upcoming = [], done = [];
    p.order.forEach(function (oi, n) {
      var old = p.files[oi], ni = old ? idx[old.path] : undefined;
      if (ni === undefined) return;
      (n >= p.pos ? upcoming : done).push(ni);
    });
    var seen = {};
    upcoming.concat(done).forEach(function (i) { seen[i] = true; });
    var added = [];
    files.forEach(function (f, i) { if (!seen[i]) added.push(i); });
    var removed = p.files.length - (files.length - added.length);
    if (!added.length && !removed) return 0;
    makeOrder(added.length, p.shuffle, rnd).forEach(function (k) {
      var i = added[k];
      if (p.shuffle) upcoming.splice(Math.floor(rnd() * (upcoming.length + 1)), 0, i); else upcoming.push(i);
    });
    p.files = files; p.order = done.concat(upcoming); p.pos = done.length;
    return added.length;
  }
  // The stored fields of a playlist (no runtime extras).
  function fields(p) {
    return { name: p.name, files: p.files, shuffle: p.shuffle, secs: p.secs, randomStart: p.randomStart, maxClip: p.maxClip, fade: p.fade, gifOnce: p.gifOnce, root: p.root, order: p.order, pos: p.pos, truncated: !!p.truncated };
  }
  // A copy for undo: the order is copied, the file list is shared (it is replaced, never changed in place).
  function clone(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { var p = o[k]; out[k] = Object.assign({}, p, { order: p.order ? p.order.slice() : null }); });
    return out;
  }
  // Playlists read from a file: keep only well-formed ones, with every value in range.
  function clean(o) {
    var out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).slice(0, MAX_PLAYLISTS).forEach(function (k) {
      var p = o[k];
      if (!p || !Array.isArray(p.files)) return;
      var files = p.files.filter(function (f) { return f && typeof f.path === 'string' && typeof f.name === 'string' && (f.kind === 'video' || f.kind === 'image'); })
        .slice(0, MAX_FILES).map(fileOf);
      if (!files.length) return;
      var order = Array.isArray(p.order) && p.order.length === files.length && p.order.every(function (x) { return Number.isInteger(x) && x >= 0 && x < files.length; }) ? p.order.slice() : null;
      out[k] = {
        name: typeof p.name === 'string' ? p.name.slice(0, 60) : 'Playlist', files: files, shuffle: !!p.shuffle, secs: U.clamp(+p.secs || 10, 2, 300),
        randomStart: !!p.randomStart, maxClip: U.clamp(+p.maxClip || 0, 0, 3600), fade: U.clamp(+p.fade || 0, 0, 5), gifOnce: !!p.gifOnce,
        root: typeof p.root === 'string' ? p.root : null, order: order, pos: order ? U.clamp(p.pos | 0, 0, order.length) : 0, truncated: !!p.truncated
      };
    });
    return out;
  }

  return { MAX_FILES: MAX_FILES, makeOrder: makeOrder, nextFile: nextFile, make: make, rootFor: rootFor, refresh: refresh, fields: fields, clone: clone, clean: clean };
});
