// Putting media on the wall: adding, replacing, relinking and removing; drag and drop; switching layouts;
// Auto-arrange and Fit to media.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free, FIT = MW.fit, PL = MW.pl;
  var S = A.S, wall = A.wall, $ = A.$, clamp = U.clamp;

  /* ---------- messages about what a scan found ---------- */
  A.noMediaMessage = function (res) {
    return MW.formats.describeUnsupported(res.unsupported) ||
      ((res.skipped || 0) ? 'Only video, image and GIF files can go on the wall.' : 'No videos, images or GIFs found there.');
  };
  // Notes to add after media went on the wall: formats that cannot play, other files left out, folders cut short.
  A.scanNotes = function (res) {
    var out = [], u = MW.formats.describeUnsupported(res.unsupported), bad = res.skipped || 0;
    if (u) out.push(u);
    if (bad) out.push(bad + ' other ' + (bad === 1 ? 'file was' : 'files were') + ' skipped (not a video, image or GIF).');
    if (res.truncated) out.push('Only the first ' + Number(res.limit || PL.MAX_FILES).toLocaleString('en-US') + ' files were used.');
    return out;
  };
  // True when a file or folder dialog returned something worth a reply (false when it was cancelled).
  A.picked = function (res) {
    return !!(res && ((res.entries && res.entries.length) || res.skipped || res.dirs || (res.unsupported && Object.keys(res.unsupported).length)));
  };

  /* ---------- items ---------- */
  A.makeItem = function (entry, g) {
    return {
      id: S.nid++, name: entry.name, path: entry.path, kind: entry.kind, url: U.fileUrl(entry.path),
      col: g.col, row: g.row, w: g.w, h: g.h, fit: S.fit, muted: true, loop: true, sample: false, missing: false
    };
  };
  // A frame without media: drop media on it or choose some later. Playlists fill empty tiles first.
  A.makeEmptyItem = function (g) {
    return {
      id: S.nid++, name: 'Empty tile', path: '', kind: 'empty', url: null,
      col: g.col, row: g.row, w: g.w, h: g.h, fit: S.fit, muted: true, loop: true, sample: false, missing: false
    };
  };
  A.replaceMedia = function (it, entry) {
    A.removeTileEl(it.id);
    it.name = entry.name; it.path = entry.path; it.kind = entry.kind; it.url = U.fileUrl(entry.path);
    it.sample = false; it.missing = false; it.muted = true; it.loop = true; it.gifSecs = undefined;
    it.mx = 0.5; it.my = 0.5; it.zoom = 1;
    it.loopA = null; it.loopB = null;   // a loop part belongs to one video; volume and speed stay with the tile
  };
  function relinkItem(it, entry) {
    var mu = it.muted, lp = it.loop, ft = it.fit, v = MW.view.of(it), la = it.loopA, lb = it.loopB;
    A.replaceMedia(it, entry);
    it.muted = mu; it.loop = lp; it.fit = ft; it.done = false; it.mx = v.mx; it.my = v.my; it.zoom = v.zoom;
    it.loopA = la; it.loopB = lb;   // the same video found again
  }
  // Pick a file for this tile (or a new one in its place).
  A.chooseMedia = function (it) {
    A.api.openFiles(false).then(function (res) {
      var f = res.entries[0];
      if (!f) { if (A.picked(res)) A.toast(A.noMediaMessage(res)); return; }
      A.pushHistory(); A.replaceMedia(it, f);
      if (it.pl) { it.pinned = true; it.loop = true; }
      A.render(); A.refreshInspector();
    });
  };
  // Give this tile a folder of its own to play.
  A.ownFolder = function (it) {
    A.api.openFolder().then(function (res) {
      if (res.entries.length) A.assignFolder(it, res);
      else if (A.picked(res)) A.toast(A.noMediaMessage(res));
    });
  };
  // Put files into the empty tiles, in reading order. Returns the tiles that got media.
  function fillEmpties(list) {
    var filled = [];
    S.items.filter(function (i) { return i.kind === 'empty'; }).sort(S.mode === 'free' ? byFreeOrder : U.readingOrder).forEach(function (t) {
      if (!list.length) return;
      A.replaceMedia(t, list.shift()); filled.push(t);
    });
    return filled;
  }
  function byFreeOrder(a, b) { return ((a.fy || 0) - (b.fy || 0)) || ((a.fx || 0) - (b.fx || 0)); }
  A.relinkOne = function (it) {
    A.api.openFiles(false).then(function (res) {
      var f = res.entries[0];
      if (!f) return;
      A.pushHistory();
      relinkItem(it, f);
      // Files that moved together usually still sit together, so look for the other missing ones in the same folder.
      var dir = U.dirOf(f.path), others = S.items.filter(function (i) { return i.missing && i !== it; });
      var go = others.length ? A.api.resolveNames(dir, others.map(function (i) { return i.name; })) : Promise.resolve({});
      return go.then(function (found) {
        var n = 0;
        others.forEach(function (o) {
          var p = found[o.name];
          if (p) { relinkItem(o, { path: p, name: o.name, kind: MW.formats.kindOfName(o.name) || o.kind }); n++; }
        });
        A.render(); A.refreshInspector();
        if (n) A.toast('Also reconnected ' + n + ' more from the same folder.');
      });
    });
  };
  A.removeItem = function (id) {
    if (A.reposId === id) A.reposId = null;
    A.pushHistory();
    S.items = S.items.filter(function (i) { return i.id !== id; });
    if (S.sel === id) S.sel = null;
    A.render(); A.refreshInspector();
  };
  function dropSamples() {
    S.items = S.items.filter(function (i) { return !i.sample; });
    if (S.sel && !A.itemById(S.sel)) S.sel = null;
  }

  /* ---------- adding files ---------- */
  // res: what the main process found ({ entries, skipped, dirs, unsupported, truncated }). target: the cell (grid) or
  // point (free layout) where the files were dropped or chosen, or null. fromDrop: dropped from Explorer.
  A.addFiles = function (res, target, fromDrop) {
    if (fromDrop && res.dirs && res.dirs.length === 1 && (res.entries || []).length) {
      // A folder dropped on a tile gives that tile the folder. Dropped anywhere else on the grid, it becomes a
      // playlist that fills the empty cells; in Free layout each of its files gets a tile (below).
      var occ0 = target ? (target.free ? itemUnderPoint(target) : G.itemAt(S.items, target.col, target.row)) : null;
      if (occ0 && !occ0.sample) { A.assignFolder(occ0, res); return; }
      if (S.mode !== 'free') { A.fillWithFolder(res, A.readPlOpts()); return; }
    }
    if (S.mode === 'free') { addFilesFree(res, target); return; }
    var media = U.sortEntries(res.entries || []);
    if (!media.length) { A.toast(A.noMediaMessage(res)); return; }
    A.pushHistory();

    // Files that match tiles marked "not found" reconnect those tiles first.
    var offl = S.items.filter(function (i) { return i.missing; }), matched = 0;
    if (offl.length) {
      var rest = [];
      media.forEach(function (f) {
        var m = offl.filter(function (o) { return !o.done && o.name.toLowerCase() === f.name.toLowerCase(); })[0];
        if (m) { m.done = true; relinkItem(m, f); matched++; } else rest.push(f);
      });
      var ignored = 0;
      if (matched && rest.length && !target) { ignored = rest.length; rest = []; }
      media = rest;
      if (!media.length) {
        A.render(); A.refreshInspector();
        A.toast(['Reconnected ' + matched + (matched === 1 ? ' file.' : ' files.') + (ignored ? ' ' + ignored + ' other ' + (ignored === 1 ? 'file was' : 'files were') + ' left out. Drop them again to add them.' : '')].concat(A.scanNotes(res)).join(' '));
        return;
      }
    }

    var list = media.slice(), all = media.slice(), fresh = [], start = 0;
    var occ = target ? G.itemAt(S.items, target.col, target.row) : null;
    var inherit = null;
    if (occ && !occ.sample) {
      var f1 = list.shift();
      if (occ.missing) relinkItem(occ, f1); else A.replaceMedia(occ, f1);
      if (occ.pl) { occ.pinned = true; occ.loop = true; }
      start = occ.row * S.cols + occ.col + 1;
    } else if (occ && occ.sample) {
      inherit = { col: occ.col, row: occ.row, w: occ.w, h: occ.h };
    } else if (target) {
      start = target.row * S.cols + target.col;
    }
    dropSamples();
    // Added without a place in mind: empty tiles are waiting for media, so they come first.
    if (!target) fillEmpties(list).forEach(function (t) { fresh.push(t); });
    var m = G.occupancy(S.items, S.cols, S.rows), skipped = 0;
    if (inherit && list.length) {
      var it0 = A.makeItem(list.shift(), inherit);
      S.items.push(it0); fresh.push(it0); G.mark(m, inherit, inherit.w, inherit.h); start = inherit.row * S.cols + inherit.col + 1;
    }
    list.forEach(function (f) {
      var s = G.freeSpot(m, 1, 1, start, S.cols, S.rows);
      if (!s) { skipped++; return; }
      var it = A.makeItem(f, { col: s.col, row: s.row, w: 1, h: 1 });
      S.items.push(it); fresh.push(it); G.mark(m, s, 1, 1); start = s.idx + 1;
    });
    var madePl = skipped && playRest(all, fresh, res);
    A.render(); A.refreshInspector();
    var msg = [];
    if (madePl) msg.push('There are ' + all.length + ' files, so ' + fresh.length + (fresh.length === 1 ? ' tile plays' : ' tiles play') + ' them as a playlist.');
    if (matched) msg.push('Reconnected ' + matched + (matched === 1 ? ' file.' : ' files.'));
    if (skipped && !madePl) msg.push(skipped + (skipped === 1 ? ' file did' : ' files did') + ' not fit. Add rows or columns and add them again.');
    msg = msg.concat(A.scanNotes(res));
    if (msg.length) A.toast(msg.join(' '));
  };
  // More files than room on the wall (grid or Free): the new tiles become a playlist of all of them, so the rest play
  // in turn, carrying on after the files the tiles show now. Returns whether it made one.
  function playRest(all, fresh, res) {
    if (!fresh.length) return false;
    var idx = {}, last = 0;
    all.forEach(function (f, n) { idx[f.path] = n; });
    fresh.forEach(function (t) { if (idx[t.path] > last) last = idx[t.path]; });
    var pid = 'p' + Date.now().toString(36) + S.nid;
    var p = PL.make(all, A.readPlOpts(), PL.rootFor(res, all));
    p.order = all.map(function (f, n) { return n; }); p.pos = last + 1; p.truncated = !!res.truncated;
    S.playlists[pid] = p;
    fresh.forEach(function (t) { t.pl = pid; t.loop = false; t.shown = 0; A.removeTileEl(t.id); });
    S.fillPl = pid;
    return true;
  }

  /* ---------- adding in free layout ---------- */
  function itemUnderPoint(p) {
    var el = document.elementFromPoint ? document.elementFromPoint(p.x, p.y) : null, t = el && el.closest && el.closest('.tile');
    if (!t) return null;
    return S.items.filter(function (i) { return String(i.id) === t.dataset.id; })[0] || null;
  }
  // Where a new tile goes in free layout: the first gap that fits, else the middle, pushing others aside.
  function placeFreeNew(it) {
    var d = A.wallPx(), box = F.findGap(A.freeGeoPx(), d);
    if (box) { F.setPx(it, box, d); S.items.push(it); return true; }
    it.fx = 0.375; it.fy = 0.375; it.fw = 0.25; it.fh = 0.25;
    S.items.push(it);
    var res = F.resolve(S.items.map(function (i) { return i.id; }), it.id, { x: 0.375 * d.W, y: 0.375 * d.H, w: 0.25 * d.W, h: 0.25 * d.H }, A.freeGeoPx(), d);
    if (res) { A.applyFreePx(res); return true; }
    S.items.pop();
    return false;
  }
  // A new tile a quarter of the wall in size, centred on the screen point p (others make room), else in the first gap.
  function placeFreeAt(it, p) {
    var d = A.wallPx(), r = wall.getBoundingClientRect(), w = d.W / 4, h = d.H / 4;
    var box = { x: clamp(p.x - r.left - w / 2, 0, d.W - w), y: clamp(p.y - r.top - h / 2, 0, d.H - h), w: w, h: h };
    F.setPx(it, box, d); S.items.push(it);
    var res = F.resolve(S.items.map(function (i) { return i.id; }), it.id, box, A.freeGeoPx(), d, { shrink: true });
    if (res) { A.applyFreePx(res); return true; }
    S.items.pop();
    return placeFreeNew(it);
  }
  // A new tile in free layout, which takes its media's shape once the media has loaded (A.fitNewTile).
  function newFreeItem(f) {
    var it = A.makeItem(f, { col: 0, row: 0, w: 1, h: 1 });
    it._fitOnLoad = true;
    return it;
  }
  // A tile for each file while there is room; once one does not fit, the rest play in turn on the new tiles.
  function addFilesFree(res, target) {
    var media = U.sortEntries(res.entries || []), all = media.slice(), fresh = [], failed = 0;
    if (!media.length) { A.toast(A.noMediaMessage(res)); return; }
    A.pushHistory();
    var under = target && target.free ? itemUnderPoint(target) : null;
    dropSamples();
    if (under && S.items.indexOf(under) > -1) {
      var f1 = media.shift();
      if (under.missing) relinkItem(under, f1); else A.replaceMedia(under, f1);
      if (under.pl) { under.pinned = true; under.loop = true; }
    } else if (target && target.free) {
      var it0 = newFreeItem(media.shift());
      if (placeFreeAt(it0, target)) fresh.push(it0); else failed++;
    } else fillEmpties(media).forEach(function (t) { fresh.push(t); });
    media.forEach(function (f) {
      if (failed) { failed++; return; }   // the wall is full: no use trying the rest
      var it = newFreeItem(f);
      if (placeFreeNew(it)) fresh.push(it); else failed++;
    });
    var madePl = failed && playRest(all, fresh, res);
    A.render(); A.refreshInspector();
    var msg = [];
    if (madePl) msg.push('There are ' + all.length + ' files, so ' + fresh.length + (fresh.length === 1 ? ' tile plays' : ' tiles play') + ' them as a playlist.');
    else if (failed) msg.push(failed + (failed === 1 ? ' file did' : ' files did') + ' not fit. Make room and add again.');
    msg = msg.concat(A.scanNotes(res));
    if (msg.length) A.toast(msg.join(' '));
  }

  /* ---------- new, duplicated and split tiles ---------- */
  function finishNew(it, msg) {
    A.render(); A.select(it.id); A.refreshInspector();
    if (msg) A.toast(msg);
  }
  // An empty tile at a grid cell ({ col, row }) or a screen point ({ x, y, free: true }).
  A.newEmptyTile = function (target) {
    if (S.mode === 'free') {
      A.pushHistory(); dropSamples();
      var it = A.makeEmptyItem({ col: 0, row: 0, w: 1, h: 1 });
      if (!(target && target.free ? placeFreeAt(it, target) : placeFreeNew(it))) { A.dropHistory(); A.toast('There is no room for another tile.'); A.render(); return; }
      finishNew(it, 'New empty tile. Drag its edges to size it, then drop media on it.');
      return;
    }
    var m = G.occupancy(S.items.filter(function (i) { return !i.sample; }), S.cols, S.rows);
    var start = target ? target.row * S.cols + target.col : 0, s = G.freeSpot(m, 1, 1, start, S.cols, S.rows);
    if (!s) { A.toast('There is no empty cell. Add rows or columns first.'); return; }
    A.pushHistory(); dropSamples();
    var e = A.makeEmptyItem({ col: s.col, row: s.row, w: 1, h: 1 });
    S.items.push(e);
    finishNew(e, 'New empty tile. Drag its edges to size it, then drop media on it.');
  };
  function copyOf(it, g) {
    var c = it.kind === 'empty' ? A.makeEmptyItem(g) : A.makeItem({ name: it.name, path: it.path, kind: it.kind }, g);
    ['fit', 'fitSet', 'muted', 'loop', 'mx', 'my', 'zoom', 'missing', 'pl', 'vol', 'speed', 'loopA', 'loopB'].forEach(function (k) { if (it[k] !== undefined) c[k] = it[k]; });
    if (c.missing) c.url = null;
    return c;
  }
  // A second tile with the same media and settings, next to this one if there is room.
  A.duplicateTile = function (it) {
    if (S.mode === 'free') {
      var d = A.wallPx(), geo = A.freeGeoPx(), g = geo[it.id];
      var tries = [{ x: g.x + g.w, y: g.y }, { x: g.x, y: g.y + g.h }, { x: g.x - g.w, y: g.y }, { x: g.x, y: g.y - g.h }].map(function (p) { return { x: p.x, y: p.y, w: g.w, h: g.h }; });
      var spot = tries.filter(function (b) {
        return F.inside(b, d) && Object.keys(geo).every(function (k) { return !F.ovl(b, geo[k]); });
      })[0];
      var c = copyOf(it, { col: 0, row: 0, w: 1, h: 1 });
      A.pushHistory();
      if (spot) { F.setPx(c, spot, d); S.items.push(c); }
      else if (!placeFreeAt(c, { x: wall.getBoundingClientRect().left + g.x + g.w, y: wall.getBoundingClientRect().top + g.y + g.h / 2 })) { A.dropHistory(); A.toast('There is no room for a copy.'); return; }
      finishNew(c);
      return;
    }
    var m = G.occupancy(S.items, S.cols, S.rows), start = it.row * S.cols + it.col + 1;
    var s = G.freeSpot(m, it.w, it.h, start, S.cols, S.rows), w = it.w, h = it.h;
    if (!s) { w = 1; h = 1; s = G.freeSpot(m, 1, 1, start, S.cols, S.rows); }
    if (!s) { A.toast('There is no empty cell for a copy. Add rows or columns first.'); return; }
    A.pushHistory();
    var cp = copyOf(it, { col: s.col, row: s.row, w: w, h: h });
    S.items.push(cp);
    finishNew(cp);
  };
  // Split a tile in two ('v': side by side, 'h': one above the other). The new half is an empty tile.
  A.canSplit = function (it, dir) {
    if (S.mode === 'free') { var g = A.freeGeoPx()[it.id]; return !!g && (dir === 'v' ? g.w : g.h) >= 2 * F.MIN; }
    return (dir === 'v' ? it.w : it.h) >= 2;
  };
  A.splitTile = function (it, dir) {
    if (!A.canSplit(it, dir)) { A.toast(S.mode === 'free' ? 'This tile is too small to split.' : 'Only a tile two or more cells ' + (dir === 'v' ? 'wide' : 'tall') + ' can split. Switch to Free (pixels) to split any tile.'); return; }
    A.pushHistory();
    var e;
    if (S.mode === 'free') {
      var d = A.wallPx(), g = A.freeGeoPx()[it.id], a = { x: g.x, y: g.y, w: g.w, h: g.h }, b;
      if (dir === 'v') { a.w = g.w / 2; b = { x: g.x + a.w, y: g.y, w: g.w - a.w, h: g.h }; }
      else { a.h = g.h / 2; b = { x: g.x, y: g.y + a.h, w: g.w, h: g.h - a.h }; }
      F.setPx(it, a, d);
      e = A.makeEmptyItem({ col: 0, row: 0, w: 1, h: 1 }); F.setPx(e, b, d);
    } else if (dir === 'v') {
      var w1 = Math.ceil(it.w / 2);
      e = A.makeEmptyItem({ col: it.col + w1, row: it.row, w: it.w - w1, h: it.h }); it.w = w1;
    } else {
      var h1 = Math.ceil(it.h / 2);
      e = A.makeEmptyItem({ col: it.col, row: it.row + h1, w: it.w, h: it.h - h1 }); it.h = h1;
    }
    S.items.push(e);
    A.render(); A.refreshInspector();
  };

  /* ---------- drag and drop ---------- */
  // What a drop at the pointer would do: move or swap a tile being dragged, or add files from Explorer.
  function planDrop(e, isFiles) {
    var inside = A.inWall(e.clientX, e.clientY);
    if (A.drag.id != null) {
      var it = A.itemById(A.drag.id);
      if (!it || !inside) return { ok: false, ghost: null };
      var c = A.cellAt(e.clientX, e.clientY);
      var mine = { col: clamp(c.col - A.drag.dx, 0, S.cols - it.w), row: clamp(c.row - A.drag.dy, 0, S.rows - it.h), w: it.w, h: it.h };
      var o = {}; o[it.id] = mine;
      if (G.validLayout(S.items, S.cols, S.rows, o)) return { ok: true, plan: { geo: o, removed: [] }, ghost: mine, label: 'Move' };
      var occ = G.itemAt(S.items, c.col, c.row, it.id);
      if (occ && occ.w === it.w && occ.h === it.h) {
        var a = { col: occ.col, row: occ.row, w: it.w, h: it.h };
        var b = { col: it.col, row: it.row, w: occ.w, h: occ.h };
        var o2 = {}; o2[it.id] = a; o2[occ.id] = b;
        if (G.validLayout(S.items, S.cols, S.rows, o2)) return { ok: true, plan: { geo: o2, removed: [] }, ghost: a, label: 'Swap' };
      }
      var res = G.resolveYield(S.items, it.id, mine, null, S.cols, S.rows);
      if (res) return { ok: true, plan: res, ghost: mine, label: res.removed.length ? 'Move, over the empty tile' : 'Move, others make room' };
      return { ok: false, ghost: mine, label: 'No room' };
    }
    if (!isFiles) return null;
    if (!inside) return { ok: true, target: null, ghost: null };
    var cc = A.cellAt(e.clientX, e.clientY), oc = G.itemAt(S.items, cc.col, cc.row);
    var n = A.libDrag ? A.libDrag.n : (e.dataTransfer && e.dataTransfer.items) ? e.dataTransfer.items.length : 1, coll = !!(A.libDrag && A.libDrag.coll);
    if (oc) return { ok: true, target: cc, ghost: { col: oc.col, row: oc.row, w: oc.w, h: oc.h }, label: oc.missing ? 'Reconnect' : (oc.sample ? 'Replace sample' : coll ? 'Play the collection here' : (A.libDrag && e.shiftKey && n > 1 ? 'Play these ' + n + ' in turn' : 'Replace')) };
    return { ok: true, target: cc, ghost: { col: cc.col, row: cc.row, w: 1, h: 1 }, label: coll ? 'Play it in the empty cells' : n > 1 ? 'Add ' + n : 'Add' };
  }

  // Files from Explorer, or from the library (A.LIB_TYPE: { paths } of files or a folder, or { coll, name }).
  function filesIn(dt) {
    var types = Array.prototype.slice.call((dt && dt.types) || []);
    return types.indexOf('Files') > -1 || types.indexOf(A.LIB_TYPE) > -1;
  }
  function libData(dt) {
    try { var v = JSON.parse(dt.getData(A.LIB_TYPE) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (err) { return {}; }
  }
  // A collection from the library: the tile it lands on plays it; anywhere else it fills the empty tiles and cells, as a
  // folder does. Either way the playlist follows the collection as it changes (ui/playlists.js).
  function dropCollection(lib, tgt) {
    A.api.collectionFiles(lib.coll).then(function (entries) {
      var res = { entries: entries || [], dirs: [], skipped: 0, unsupported: {}, coll: lib.coll, title: String(lib.name || 'Collection') };
      if (!res.entries.length) { A.toast('"' + res.title + '" has no files yet.'); return; }
      var on = tgt ? (tgt.free ? itemUnderPoint(tgt) : G.itemAt(S.items, tgt.col, tgt.row)) : null;
      if (on && !on.sample) A.assignFolder(on, res); else A.fillWithFolder(res, A.readPlOpts());
    });
  }
  window.addEventListener('dragover', function (e) {
    e.preventDefault();
    var isFiles = filesIn(e.dataTransfer);
    if (A.drag.id == null && !isFiles) return;
    if (S.mode === 'free') { A.hideGhost(); wall.classList.toggle('hot', isFiles && A.inWall(e.clientX, e.clientY)); e.dataTransfer.dropEffect = 'copy'; return; }
    var plan = planDrop(e, isFiles);
    if (plan && plan.ghost) A.showGhost(plan.ghost, plan.ok, plan.label); else A.hideGhost();
    wall.classList.toggle('hot', !!(plan && plan.ok && isFiles && !plan.ghost));
    e.dataTransfer.dropEffect = (plan && plan.ok === false) ? 'none' : (A.drag.id != null ? 'move' : 'copy');
  });
  window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) { A.hideGhost(); wall.classList.remove('hot'); } });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    A.hideGhost(); wall.classList.remove('hot');
    if (A.drag.id != null) {
      var plan = planDrop(e, false);
      if (plan && plan.ok) { A.pushHistory(); A.commitYield(plan.plan); A.render(); A.refreshInspector(); }
      else if (plan && plan.label === 'No room') A.toast('The wall is too full to make room for that.');
      A.drag.id = null;
      return;
    }
    var dt = e.dataTransfer;
    if (!dt || !filesIn(dt)) return;
    var lib = Array.prototype.indexOf.call(dt.types || [], A.LIB_TYPE) > -1 ? libData(dt) : null, fromLib = !!lib;
    var plan2 = planDrop(e, true);
    var tgt = S.mode === 'free' ? { x: e.clientX, y: e.clientY, free: true } : (plan2 && plan2.target);
    if (lib && typeof lib.coll === 'string' && lib.coll) { dropCollection(lib, tgt); return; }
    var paths = lib ? (Array.isArray(lib.paths) ? lib.paths : []).filter(function (p) { return typeof p === 'string' && p; })
      : Array.prototype.slice.call(dt.files || []).map(function (f) { return A.api.pathOf(f); }).filter(Boolean);
    if (!paths.length) { A.toast('Could not read those files. Drop files or folders from Explorer.'); return; }
    // Shift while dropping several files from the library on a tile: that tile plays them in turn.
    var inTurn = fromLib && e.shiftKey && paths.length > 1;
    A.api.expand(paths).then(function (res) {
      var on = inTurn && tgt ? (tgt.free ? itemUnderPoint(tgt) : G.itemAt(S.items, tgt.col, tgt.row)) : null;
      if (on && !on.sample && res.entries.length > 1) { res.title = res.entries.length + ' files from the library'; A.assignFolder(on, res); return; }
      A.addFiles(res, tgt, true);
    });
  });

  /* ---------- Grid or Free layout ---------- */
  function setMode(m) {
    if (m === S.mode) return;
    A.pushHistory();
    var lost = 0, d = A.wallPx();
    if (m === 'free') { F.toFree(S.items, S.cols, S.rows, S.gap, d, false); S.mode = 'free'; }
    else {
      var dropped = F.toGrid(S.items, S.cols, S.rows, S.gap, d);
      if (dropped.length) {
        S.items = S.items.filter(function (i) { return dropped.indexOf(i.id) < 0; });
        if (S.sel && dropped.indexOf(S.sel) > -1) S.sel = null;
      }
      lost = dropped.length; S.mode = 'grid';
    }
    A.savePrefs(); A.render(); A.refreshInspector();
    A.toast(m === 'free' ? 'Free (pixels): drag tiles, and resize by any edge. Shift keeps the shape, Alt turns snapping off. Arrow keys move by 1 px, Ctrl makes it 10.' : (lost ? 'Back on the grid; ' + lost + ' tiles did not fit and were removed. Ctrl+Z brings them back.' : 'Back on the grid.'));
  }
  $('#modeSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

  $('#arrangeBtn').addEventListener('click', function () {
    A.closePops();
    if (!S.items.length) { A.toast('Nothing to arrange yet.'); return; }
    var plan = G.arrange(S.items, S.cols, S.rows);
    if (!plan) { A.toast('Not enough room. Add rows or columns first.'); return; }
    A.pushHistory(); G.applyGeo(S.items, plan); A.render(); A.refreshInspector();
  });

  /* ---------- Fit to media ---------- */
  function mediaAspect(it) {
    var el = A.tileEls.get(it.id), m = el && el._media, w = 0, h = 0;
    if (m && !it.missing) {
      if (m.tagName === 'VIDEO') { w = m.videoWidth; h = m.videoHeight; }
      else if (m.tagName === 'IMG') { w = m.naturalWidth; h = m.naturalHeight; }
    }
    if (w > 0 && h > 0) { it.ar = w / h; return { a: it.ar, known: true }; }
    return { a: it.ar || 16 / 9, known: !!it.ar };
  }
  // A tile just added in free layout takes the exact shape of its media as soon as the media has loaded, inside the
  // space it was given (top left corner kept). Part of the same undo step as adding it.
  A.fitNewTile = function (it) {
    if (!it._fitOnLoad) return;
    it._fitOnLoad = false;
    if (S.mode !== 'free' || S.items.indexOf(it) < 0) return;
    var r = mediaAspect(it), geo = A.freeGeoPx();
    if (!r.known || !geo[it.id]) return;
    geo[it.id] = F.fitBox(geo[it.id], r.a, S.gap);
    it.fit = 'contain'; it.fitSet = true;
    A.applyFreePx(geo); A.render(); A.refreshInspector();
  };
  // Free layout: shrink tiles to the exact shape of their media, so there are no bars and nothing is cropped.
  // On the grid this first switches to Free layout (tiles stay where they are on screen); one Ctrl+Z undoes both.
  A.fitTilesToMedia = function (list) {
    var ready = [], waiting = 0;
    list.forEach(function (it) {
      if (!A.hasMedia(it)) return;
      var r = mediaAspect(it);
      if (r.known) ready.push([it, r.a]); else waiting++;
    });
    if (!ready.length) { A.toast(waiting ? 'The media has not loaded yet. Try again in a moment.' : 'Nothing to fit.'); return; }
    A.pushHistory();
    var switched = S.mode !== 'free';
    if (switched) { F.toFree(S.items, S.cols, S.rows, S.gap, A.wallPx(), false); S.mode = 'free'; A.savePrefs(); }
    var geo = A.freeGeoPx();
    ready.forEach(function (p) {
      var it = p[0];
      if (geo[it.id]) geo[it.id] = F.fitBox(geo[it.id], p[1], S.gap);
      it.fit = 'contain'; it.fitSet = true;
    });
    A.applyFreePx(geo); A.render(); A.refreshInspector();
    var msg = ready.length === 1 ? 'The tile now has the exact shape of its media.' : ready.length + ' tiles now have the exact shape of their media.';
    if (switched) msg += ' Tiles are now placed freely, by the pixel. Ctrl+Z undoes this.';
    if (waiting) msg += ' ' + waiting + (waiting === 1 ? ' tile was' : ' tiles were') + ' not loaded yet and stayed as they were.';
    A.toast(msg);
  };
  function fitToMedia() {
    if (S.mode === 'free') { A.fitTilesToMedia(S.items); shapePlaylists(); return; }
    var N = S.items.length;
    if (!N) { A.toast('Nothing to fit yet.'); return; }
    if (N > S.cols * S.rows) { A.toast('There are more tiles than cells. Add rows or columns first.'); return; }
    var mt = A.metrics(), unknown = 0;
    var asp = S.items.map(function (it) { var r = mediaAspect(it); if (!r.known && A.hasMedia(it)) unknown++; return r.a; });
    var before = FIT.coverage(S.items.map(function (i) { return { w: i.w, h: i.h }; }), null, asp, mt.px, mt.py, S.gap);
    // A quarter of a second is plenty to find a good layout, and short enough that the videos keep playing smoothly.
    var best = FIT.plan({ cols: S.cols, rows: S.rows, asp: asp, px: mt.px, py: mt.py, gap: S.gap, budgetMs: 250, now: function () { return performance.now(); } });
    A.pushHistory();
    best.rects.forEach(function (g, j) {
      var it = S.items[best.assign[j]];
      it.col = g.col; it.row = g.row; it.w = g.w; it.h = g.h; it.fit = 'contain'; it.fitSet = true;
    });
    var shaped = shapePlaylists();
    A.render(); A.refreshInspector();
    var msg = 'Fitted ' + N + (N === 1 ? ' tile' : ' tiles') + ': ' + Math.round(before * 100) + '% of tile area showed media, now ' + Math.round(best.score * 100) + '%.';
    if (shaped) msg += ' Its playlists now pick files shaped like their tiles first.';
    else if (S.items.some(function (i) { return i.pl; })) msg += ' Playlist tiles keep this shape, so later clips may still have bars.';
    if (unknown) msg += ' ' + unknown + (unknown === 1 ? ' tile was' : ' tiles were') + ' not loaded yet and counted as 16:9.';
    A.toast(msg);
  }
  $('#fitMediaBtn').addEventListener('click', function () { A.closePops(); fitToMedia(); });

  /* ---------- Fill the wall ---------- */
  // Tiles in reading order by their place on screen: rows from the top (a tile whose middle lies within the first
  // tile of a row belongs to that row), each row from the left.
  function readingOrderPx(list, geo) {
    var left = list.filter(function (i) { return geo[i.id]; }).sort(function (a, b) {
      var ga = geo[a.id], gb = geo[b.id];
      return (ga.y + ga.h / 2) - (gb.y + gb.h / 2);
    }), out = [];
    while (left.length) {
      var top = geo[left[0].id], row = left.filter(function (i) { var g = geo[i.id], c = g.y + g.h / 2; return c >= top.y && c <= top.y + top.h; });
      row.sort(function (a, b) { return geo[a.id].x - geo[b.id].x; });
      out = out.concat(row);
      left = left.filter(function (i) { return row.indexOf(i) < 0; });
    }
    return out;
  }
  // After Fill the wall or Fit to media every tile has its media's shape: the playlists on the wall then pick files
  // shaped like their tiles first, so the shapes keep fitting (Settings › General can leave them be). Returns how many
  // playlists started to.
  function shapePlaylists() {
    if (!S.fillShapes) return 0;
    var n = 0;
    S.items.forEach(function (it) {
      var p = it.pl && S.playlists[it.pl];
      if (p && !p.fitShape) { p.fitShape = true; n++; }
    });
    return n;
  }
  // Every tile keeps its media's shape, in rows (or columns) that fill the wall edge to edge; the tiles keep their
  // reading order unless regrouping them crops clearly less. On the grid this first switches to Free layout; one
  // Ctrl+Z undoes both.
  function fillWall() {
    if (!S.items.length) { A.toast('Nothing to arrange yet.'); return; }
    A.pushHistory();
    var switched = S.mode !== 'free';
    if (switched) { F.toFree(S.items, S.cols, S.rows, S.gap, A.wallPx(), false); S.mode = 'free'; A.savePrefs(); }
    var d = A.wallPx(), geo = A.freeGeoPx(), list = readingOrderPx(S.items, geo), waiting = 0;
    var asp = list.map(function (it) { var r = mediaAspect(it); if (!r.known && A.hasMedia(it)) waiting++; return r.a; });
    var plan = MW.collage.fill(asp, d.W, d.H, S.gap);
    list.forEach(function (it, i) {
      geo[it.id] = plan.boxes[i];
      if (A.hasMedia(it)) { it.fit = 'cover'; it.fitSet = true; }
    });
    var shaped = shapePlaylists();
    A.applyFreePx(geo); A.render(); A.refreshInspector();
    var n = list.length, msg = n + (n === 1 ? ' tile fills' : ' tiles fill') + ' the wall in ' + plan.rows + (plan.cols ? (plan.rows === 1 ? ' column' : ' columns') : (plan.rows === 1 ? ' row' : ' rows')) + '.';
    if (shaped) msg += ' Its playlists now pick files shaped like their tiles first.';
    if (plan.reordered) msg += ' Some tiles changed places so they fit.';
    if (plan.crop >= 0.01) msg += ' Each is cropped by about ' + Math.round(plan.crop * 100) + '% to close the last gap.';
    if (switched) msg += ' Tiles are now placed freely, by the pixel. Ctrl+Z undoes this.';
    if (waiting) msg += ' ' + waiting + (waiting === 1 ? ' tile has' : ' tiles have') + ' not loaded yet; run it again in a moment.';
    A.toast(msg);
  }
  $('#fillWallBtn').addEventListener('click', function () { A.closePops(); fillWall(); });
})(window.MW.app);
