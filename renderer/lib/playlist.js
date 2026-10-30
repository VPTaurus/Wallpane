// Folder playlists: one folder feeds one or more tiles. A playlist is plain data:
// { name, files: [{ path, name, kind }], types, shuffle, secs, randomStart, maxClip, fade, gifOnce, keepView, root, coll, order, pos, truncated }.
// root: the folder it plays, watched for new files. coll: the library collection it plays instead, which it follows.
// fitShape: a tile moving on prefers files shaped like it (Fill the wall turns this on).
// keepView: a tile keeps its zoom and the position of its media when it moves on to the next file.
// types: which kinds of file it plays ('video', 'gif', 'image'). files keeps the whole folder, so turning a kind back
// on needs no rescan; the others are skipped.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'));
  else (root.MW = root.MW || {}).pl = factory(root.MW.util);
})(this, function (U) {
  'use strict';
  var MAX_PLAYLISTS = 24, MAX_FILES = 3000, TYPES = ['video', 'gif', 'image'];

  function fileOf(f) { return { path: f.path, name: f.name, kind: f.kind }; }
  // A file's type for the Plays option: GIFs apart from other images.
  function typeOf(f) { return f.kind === 'video' ? 'video' : /\.gif$/i.test(f.name || f.path || '') ? 'gif' : 'image'; }
  // Known types, in a fixed order; none at all means all of them.
  function cleanTypes(t) {
    var a = Array.isArray(t) ? TYPES.filter(function (x) { return t.indexOf(x) > -1; }) : [];
    return a.length ? a : TYPES.slice();
  }
  function plays(p, f) { return !p.types || p.types.indexOf(typeOf(f)) > -1; }
  // How many of the folder's files the playlist plays.
  function playable(p) { return p.files.filter(function (f) { return plays(p, f); }).length; }
  function makeOrder(n, shuffle, rnd) {
    rnd = rnd || Math.random;
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    if (shuffle) for (i = n - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // A round to go through: made anew (reshuffled if the playlist shuffles) when the last one is used up.
  function ensureOrder(p) {
    var n = p.files.length;
    if (!p.order || p.order.length !== n || p.pos >= n) { p.order = makeOrder(n, p.shuffle); p.pos = 0; }
  }
  // The next file to show, skipping types the playlist doesn't play. Null when nothing in the folder plays.
  function nextFile(p) {
    if (!p.files.length || !playable(p)) return null;
    for (;;) {
      ensureOrder(p);
      var f = p.files[p.order[p.pos++]];
      if (plays(p, f)) return f;
    }
  }
  // The next n files that would show, in this round.
  function upcoming(p, n) {
    var out = [];
    if (!p.files.length) return out;
    ensureOrder(p);
    for (var i = p.pos; i < p.order.length && out.length < n; i++) {
      var f = p.files[p.order[i]];
      if (plays(p, f)) out.push(f);
    }
    return out;
  }
  // The file at `path`, if it is still to come in this round, comes next; the others keep their order.
  function bringForward(p, path) {
    ensureOrder(p);
    for (var i = p.pos; i < p.order.length; i++) {
      if (p.files[p.order[i]].path !== path) continue;
      p.order.splice(p.pos, 0, p.order.splice(i, 1)[0]);
      return true;
    }
    return false;
  }
  // A new playlist from a folder's files. `opts` holds the Playlist panel options; `root` is the folder, when known.
  function make(files, opts, root) {
    opts = opts || {};
    var dir = root || U.dirOf(files[0].path);
    return {
      name: (U.baseName(dir) || dir || 'Playlist').slice(0, 60), files: files.map(fileOf),
      shuffle: !!opts.shuffle, secs: U.clamp(+opts.secs || 10, 2, 300), randomStart: !!opts.randomStart,
      maxClip: U.clamp(+opts.maxClip || 0, 0, 3600), fade: U.clamp(+opts.fade || 0, 0, 5), gifOnce: !!opts.gifOnce,
      keepView: !!opts.keepView, fitShape: !!opts.fitShape, types: cleanTypes(opts.types), root: root || null, coll: null, order: null, pos: 0, truncated: false
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
  // Its collection changed: these are its files now, in the collection's order. A shuffled playlist takes the change
  // as a folder's (refresh); one in order follows the new order, carrying on after the file it played last. Returns how
  // many files were added, or -1 when nothing changed.
  function follow(p, entries, rnd) {
    var files = entries.map(fileOf);
    if (files.length === p.files.length && files.every(function (f, i) { return f.path === p.files[i].path; })) return -1;
    if (p.shuffle) return refresh(p, entries, rnd);
    var had = {}, last = p.order && p.pos > 0 ? p.files[p.order[p.pos - 1]] : null, at = -1;
    p.files.forEach(function (f) { had[f.path] = true; });
    files.forEach(function (f, i) { if (last && f.path === last.path) at = i; });
    var added = files.filter(function (f) { return !had[f.path]; }).length;
    p.files = files; p.order = makeOrder(files.length, false); p.pos = at > -1 ? at + 1 : Math.min(p.pos, files.length);
    return added;
  }
  // The stored fields of a playlist (no runtime extras).
  function fields(p) {
    return { name: p.name, files: p.files, types: cleanTypes(p.types), shuffle: p.shuffle, secs: p.secs, randomStart: p.randomStart, maxClip: p.maxClip, fade: p.fade, gifOnce: p.gifOnce, keepView: !!p.keepView, fitShape: !!p.fitShape, root: p.root, coll: p.coll || null, order: p.order, pos: p.pos, truncated: !!p.truncated };
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
        randomStart: !!p.randomStart, maxClip: U.clamp(+p.maxClip || 0, 0, 3600), fade: U.clamp(+p.fade || 0, 0, 5), gifOnce: !!p.gifOnce, keepView: !!p.keepView, fitShape: !!p.fitShape,
        types: cleanTypes(p.types),
        root: typeof p.root === 'string' ? p.root : null, coll: typeof p.coll === 'string' && p.coll ? p.coll : null, order: order, pos: order ? U.clamp(p.pos | 0, 0, order.length) : 0, truncated: !!p.truncated
      };
    });
    return out;
  }

  // "videos and GIFs" for the types a playlist plays; '' when it plays everything.
  function typesLabel(p) {
    var t = cleanTypes(p.types);
    if (t.length === TYPES.length) return '';
    var w = t.map(function (x) { return { video: 'videos', gif: 'GIFs', image: 'images' }[x]; });
    return w.length === 1 ? w[0] + ' only' : w.join(' and ');
  }

  return {
    MAX_FILES: MAX_FILES, TYPES: TYPES, typeOf: typeOf, cleanTypes: cleanTypes, plays: plays, playable: playable, typesLabel: typesLabel,
    makeOrder: makeOrder, nextFile: nextFile, upcoming: upcoming, bringForward: bringForward, make: make, rootFor: rootFor, refresh: refresh, follow: follow, fields: fields, clone: clone, clean: clean
  };
});
