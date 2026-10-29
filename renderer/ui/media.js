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
  A.replaceMedia = function (it, entry) {
    A.removeTileEl(it.id);
    it.name = entry.name; it.path = entry.path; it.kind = entry.kind; it.url = U.fileUrl(entry.path);
    it.sample = false; it.missing = false; it.muted = true; it.loop = true; it.gifSecs = undefined;
  };
  function relinkItem(it, entry) {
    var mu = it.muted, lp = it.loop, ft = it.fit;
    A.replaceMedia(it, entry);
    it.muted = mu; it.loop = lp; it.fit = ft; it.done = false;
  }
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
    // More files than free cells: the new tiles become a playlist, so the rest of the files play in turn.
    var madePl = false;
    if (skipped && fresh.length) {
      var idx = {};
      all.forEach(function (f, n) { idx[f.path] = n; });
      var last = 0;
      fresh.forEach(function (t) { if (idx[t.path] > last) last = idx[t.path]; });
      var pid = 'p' + Date.now().toString(36) + S.nid;
      var p = PL.make(all, null, PL.rootFor(res, all));
      p.order = all.map(function (f, n) { return n; }); p.pos = last + 1; p.truncated = !!res.truncated;
      S.playlists[pid] = p;
      fresh.forEach(function (t) { t.pl = pid; t.loop = false; t.shown = 0; A.removeTileEl(t.id); });
      S.fillPl = pid;
      madePl = true;
    }
    A.render(); A.refreshInspector();
    var msg = [];
    if (madePl) msg.push('There are ' + all.length + ' files, so ' + fresh.length + (fresh.length === 1 ? ' tile plays' : ' tiles play') + ' them as a playlist.');
    if (matched) msg.push('Reconnected ' + matched + (matched === 1 ? ' file.' : ' files.'));
    if (skipped && !madePl) msg.push(skipped + (skipped === 1 ? ' file did' : ' files did') + ' not fit. Add rows or columns and add them again.');
    msg = msg.concat(A.scanNotes(res));
    if (msg.length) A.toast(msg.join(' '));
  };

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
  function addFilesFree(res, target) {
    var media = U.sortEntries(res.entries || []);
    if (!media.length) { A.toast(A.noMediaMessage(res)); return; }
    A.pushHistory();
    var under = target && target.free ? itemUnderPoint(target) : null;
    dropSamples();
    if (under && S.items.indexOf(under) > -1) {
      var f1 = media.shift();
      if (under.missing) relinkItem(under, f1); else A.replaceMedia(under, f1);
      if (under.pl) { under.pinned = true; under.loop = true; }
    }
    var failed = 0;
    media.forEach(function (f) {
      if (!placeFreeNew(A.makeItem(f, { col: 0, row: 0, w: 1, h: 1 }))) failed++;
    });
    A.render(); A.refreshInspector();
    var msg = [];
    if (failed) msg.push(failed + (failed === 1 ? ' file did' : ' files did') + ' not fit. Make room and add again.');
    msg = msg.concat(A.scanNotes(res));
    if (msg.length) A.toast(msg.join(' '));
  }

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
      if (G.validLayout(S.items, S.cols, S.rows, o)) return { ok: true, changes: o, ghost: mine, label: 'Move' };
      var occ = G.itemAt(S.items, c.col, c.row, it.id);
      if (occ && occ.w === it.w && occ.h === it.h) {
        var a = { col: occ.col, row: occ.row, w: it.w, h: it.h };
        var b = { col: it.col, row: it.row, w: occ.w, h: occ.h };
        var o2 = {}; o2[it.id] = a; o2[occ.id] = b;
        if (G.validLayout(S.items, S.cols, S.rows, o2)) return { ok: true, changes: o2, ghost: a, label: 'Swap' };
      }
      var res = G.resolve(S.items, it.id, mine, null, S.cols, S.rows);
      if (res) return { ok: true, changes: res, ghost: mine, label: 'Move, others make room' };
      return { ok: false, ghost: mine, label: 'No room' };
    }
    if (!isFiles) return null;
    if (!inside) return { ok: true, target: null, ghost: null };
    var cc = A.cellAt(e.clientX, e.clientY), oc = G.itemAt(S.items, cc.col, cc.row);
    var n = (e.dataTransfer && e.dataTransfer.items) ? e.dataTransfer.items.length : 1;
    if (oc) return { ok: true, target: cc, ghost: { col: oc.col, row: oc.row, w: oc.w, h: oc.h }, label: oc.missing ? 'Reconnect' : (oc.sample ? 'Replace sample' : 'Replace') };
    return { ok: true, target: cc, ghost: { col: cc.col, row: cc.row, w: 1, h: 1 }, label: n > 1 ? 'Add ' + n : 'Add' };
  }

  window.addEventListener('dragover', function (e) {
    e.preventDefault();
    var types = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.types) || []);
    var isFiles = types.indexOf('Files') > -1;
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
      if (plan && plan.ok) { A.pushHistory(); G.applyGeo(S.items, plan.changes); A.render(); A.refreshInspector(); }
      else if (plan && plan.label === 'No room') A.toast('The wall is too full to make room for that.');
      A.drag.id = null;
      return;
    }
    var dt = e.dataTransfer;
    if (!dt || Array.prototype.slice.call(dt.types || []).indexOf('Files') < 0) return;
    var plan2 = planDrop(e, true);
    var paths = Array.prototype.slice.call(dt.files || []).map(function (f) { return A.api.pathOf(f); }).filter(Boolean);
    if (!paths.length) { A.toast('Could not read those files. Drop files or folders from Explorer.'); return; }
    var tgt = S.mode === 'free' ? { x: e.clientX, y: e.clientY, free: true } : (plan2 && plan2.target);
    A.api.expand(paths).then(function (res) { A.addFiles(res, tgt, true); });
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
    A.toast(m === 'free' ? 'Free layout: drag, and resize by any edge. Alt turns snapping off. Arrow keys move by 1 px, Ctrl makes it 10.' : (lost ? 'Back on the grid; ' + lost + ' tiles did not fit and were removed. Ctrl+Z brings them back.' : 'Back on the grid.'));
  }
  $('#modeSel').addEventListener('change', function () { setMode($('#modeSel').value); });

  $('#arrangeBtn').addEventListener('click', function () {
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
  function fitToMedia() {
    if (S.mode === 'free') { A.toast('Fit to media works on the grid. Switch Layout to Grid first.'); return; }
    var N = S.items.length;
    if (!N) { A.toast('Nothing to fit yet.'); return; }
    if (N > S.cols * S.rows) { A.toast('There are more tiles than cells. Add rows or columns first.'); return; }
    var mt = A.metrics(), unknown = 0;
    var asp = S.items.map(function (it) { var r = mediaAspect(it); if (!r.known) unknown++; return r.a; });
    var before = FIT.coverage(S.items.map(function (i) { return { w: i.w, h: i.h }; }), null, asp, mt.px, mt.py, S.gap);
    // A quarter of a second is plenty to find a good layout, and short enough that the videos keep playing smoothly.
    var best = FIT.plan({ cols: S.cols, rows: S.rows, asp: asp, px: mt.px, py: mt.py, gap: S.gap, budgetMs: 250, now: function () { return performance.now(); } });
    A.pushHistory();
    best.rects.forEach(function (g, j) {
      var it = S.items[best.assign[j]];
      it.col = g.col; it.row = g.row; it.w = g.w; it.h = g.h; it.fit = 'contain'; it.fitSet = true;
    });
    A.render(); A.refreshInspector();
    var msg = 'Fitted ' + N + (N === 1 ? ' tile' : ' tiles') + ': ' + Math.round(before * 100) + '% of tile area showed media, now ' + Math.round(best.score * 100) + '%.';
    if (S.items.some(function (i) { return i.pl; })) msg += ' Playlist tiles keep this shape, so later clips may still have bars.';
    if (unknown) msg += ' ' + unknown + (unknown === 1 ? ' tile was' : ' tiles were') + ' not loaded yet and counted as 16:9.';
    A.toast(msg);
  }
  $('#fitMediaBtn').addEventListener('click', fitToMedia);
})(window.MW.app);
