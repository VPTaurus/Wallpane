/* Folder playlists on the wall: one folder feeds a few tiles; when a clip ends (or an image has been shown long
   enough) that tile takes the next file from the folder. New files in the folder join the queue. */
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, PL = MW.pl;
  var S = A.S, $ = A.$, clamp = U.clamp;

  /* ---------- moving on to the next file, or back to the one before ---------- */
  // Each tile remembers what it showed (not saved), for Previous.
  var BACK = 50;
  A.advance = function (it) {
    var p = it.pl && S.playlists[it.pl];
    if (!p) { it.pl = null; return; }
    if (it.pinned || it._picking) return;
    if (p.fitShape) {
      it._picking = true;
      bringShaped(it, p).then(function () { it._picking = false; step(it, p); });
      return;
    }
    step(it, p);
  };
  function step(it, p) {
    if (S.playlists[it.pl] !== p || it.pinned) return;
    var f = PL.nextFile(p);
    if (!f) return;
    if (it.path) { it._back = (it._back || []).concat({ path: it.path, name: it.name, kind: it.kind }).slice(-BACK); }
    show(it, p, f);
  }
  // The file this tile showed before (Previous). The playlist's own order stays as it is.
  A.goBack = function (it) {
    var p = it.pl && S.playlists[it.pl];
    if (!p) return;
    if (it.pinned) { A.toast('This tile is pinned. Unpin it to move on.'); return; }
    var f = it._back && it._back.pop();
    if (!f) { A.toast('Nothing earlier on this tile yet.'); return; }
    show(it, p, f);
  };
  function show(it, p, f) {
    var mu = it.muted, ft = it.fit, view = MW.view.of(it), back = it._back;
    var old = p.fade > 0 ? A.tileEls.get(it.id) : null;
    if (old) A.tileEls.delete(it.id); // keep the old element on screen while the new one fades in
    A.replaceMedia(it, f);
    it.muted = mu; it.fit = ft; it.loop = false; it.shown = 0; it._back = back;
    if (p.keepView) { it.mx = view.mx; it.my = view.my; it.zoom = view.zoom; }   // same framing for every file
    A.render();
    if (old) crossfade(it, old, p.fade);
    if (S.sel === it.id) A.refreshInspector();
  }

  /* ---------- shaped like the tile ---------- */
  // With fitShape, of the next files in line, the first whose shape is close to the tile's (within a quarter) comes
  // forward, else the closest. Shapes come from the main process (the library, or the file itself).
  function tileAspect(it) {
    var el = A.tileEls.get(it.id), r = el && el.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r.width / r.height : 0;
  }
  function bringShaped(it, p) {
    var t = tileAspect(it), up = PL.upcoming(p, 24);
    if (!t || up.length < 2) return Promise.resolve();
    return A.api.mediaShapes(up.map(function (f) { return f.path; })).then(function (s) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < up.length; i++) {
        var a = s && s[up[i].path];
        if (!a) continue;
        var d = Math.abs(Math.log(a / t));
        if (d < Math.log(1.25)) { best = up[i]; break; }
        if (d < bestD) { bestD = d; best = up[i]; }
      }
      if (best && S.playlists[it.pl] === p) PL.bringForward(p, best.path);
    }, function () { /* in line as it is */ });
  }
  // Where a playlist's video starts: where it was in a restored last session (A.takeResume), at random, or after a
  // black or silent opening (ui/playable.js). Not again when the same video comes from another file (a lighter copy):
  // it carries on where it was.
  A.applyClipStart = function (it, media) {
    if (media._swap) return;
    var p = it.pl && S.playlists[it.pl], t0 = 0, r = A.takeResume(it, media);
    it._t0 = 0;
    if (r != null) { it._t0 = r; try { media.currentTime = r; } catch (e) { it._t0 = 0; } return; }
    if (!p || it.pinned || !isFinite(media.duration)) return;
    if (p.randomStart) { var room = media.duration - (p.maxClip || 10); if (room > 1) t0 = Math.random() * room; }
    else t0 = A.openingOf(it, media);
    if (t0) { it._t0 = t0; try { media.currentTime = t0; } catch (e) { it._t0 = 0; } }
  };
  A.clipTick = function (it, media) {
    var p = it.pl && S.playlists[it.pl];
    if (!p || it.pinned || !p.maxClip || !media.isConnected) return;
    if (media.currentTime - (it._t0 || 0) >= p.maxClip) A.advance(it);
  };
  function crossfade(it, old, secs) {
    old._dead = true;
    old.classList.add('leaving');
    old.style.pointerEvents = 'none';
    old.classList.remove('sel');
    var ov = old.querySelector('video'), vol = ov ? ov.volume : 0;
    var ne = A.tileEls.get(it.id);
    if (!ne) { old.remove(); return; }
    var nm = ne._media, started = false;
    ne.style.opacity = '0';
    function go() {
      if (started) return;
      started = true;
      ne.style.transition = 'opacity ' + secs + 's linear';
      ne.style.opacity = '1';
      var t0 = Date.now(), iv = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / (secs * 1000));
        if (ov) { try { ov.volume = Math.max(0, vol * (1 - k)); } catch (e) { /* ignore */ } }
        if (k >= 1) {
          clearInterval(iv);
          if (ov) ov.pause();
          old.remove();
          ne.style.transition = ''; ne.style.opacity = '';
        }
      }, 60);
    }
    if (!nm || nm.classList.contains('offline-ph')) go();
    else {
      nm.addEventListener(nm.tagName === 'VIDEO' ? 'loadeddata' : 'load', go, { once: true });
      setTimeout(go, 1500);
    }
  }
  // quiet: many at once (Pin all), drawn once after.
  A.setPinned = function (it, v, quiet) {
    it.pinned = !!v;
    if (v) it.loop = true;
    else {
      it.loop = false; it.shown = 0;
      var el = A.tileEls.get(it.id), vid = el && el.querySelector('video');
      if (vid) it._t0 = vid.currentTime;
    }
    if (!quiet) { A.render(); A.refreshInspector(); }
  };
  // The bar's Pin all: every tile that plays a playlist stays on the file it shows, looping it; when all of them do
  // already, they all carry on with their playlists.
  A.togglePinAll = function () {
    var pl = S.items.filter(function (i) { return i.pl && S.playlists[i.pl]; });
    if (!pl.length) return;
    var all = pl.every(function (i) { return i.pinned; });
    pl.forEach(function (i) { if (!!i.pinned === all) A.setPinned(i, !all, true); });
    A.render(); A.refreshInspector();
    A.toast(all ? 'The ' + pl.length + (pl.length === 1 ? ' playlist tile carries on with its playlist.' : ' playlist tiles carry on with their playlists.')
      : (pl.length === 1 ? 'The playlist tile stays' : 'The ' + pl.length + ' playlist tiles stay') + ' on the file' + (pl.length === 1 ? ' it shows' : 's they show') + ', looping. Pin all again lets them move on.');
  };
  A.failAdvance = function (it) {
    var p = it.pl && S.playlists[it.pl];
    if (!p) return;
    p.bad = (p.bad || 0) + 1;
    if (p.bad > p.files.length) return; // nothing in this folder plays, so stop trying
    setTimeout(function () { if (it.pl && S.items.indexOf(it) > -1) A.advance(it); }, 600);
  };
  // Images (and GIFs, and missing files) move on after their time is up. Pause all stops the clock.
  setInterval(function () {
    if (A.wallPaused) return;
    S.items.slice().forEach(function (it) {
      if (!it.pl) return;
      var p = S.playlists[it.pl];
      if (!p) return;
      if (it.missing || it.kind === 'image') {
        var need = it.missing ? 2 : (p.secs || 10);
        if (!it.missing && p.gifOnce && /\.gif$/i.test(it.name)) {
          if (it.gifSecs === undefined) {
            it.gifSecs = null;
            A.api.gifDuration(it.path).then(function (d) { it.gifSecs = d > 0 ? clamp(d, 1, 600) : 0; }, function () { it.gifSecs = 0; });
          }
          if (it.gifSecs === null) return;       // still measuring
          if (it.gifSecs) need = it.gifSecs;
        }
        it.shown = (it.shown || 0) + 1;
        if (it.shown >= need) A.advance(it);
      }
    });
  }, 1000);

  /* ---------- which playlists are in use ---------- */
  function playlistTiles() { return S.items.filter(function (i) { return i.pl && S.playlists[i.pl]; }); }
  // The playlists worth keeping: the ones on tiles, and the one that fills new cells.
  A.usedPlaylists = function () {
    var out = {};
    S.items.forEach(function (i) { var p = i.pl && S.playlists[i.pl]; if (p) out[i.pl] = PL.fields(p); });
    if (S.fillPl && S.playlists[S.fillPl]) out[S.fillPl] = PL.fields(S.playlists[S.fillPl]);
    return out;
  };
  A.refreshPlaylistStatus = function () {
    var tiles = playlistTiles(), box = $('#plStatus'), hasFill = !!(S.fillPl && S.playlists[S.fillPl]);
    $('#plFill').hidden = !hasFill;
    if (!tiles.length) {
      box.textContent = hasFill ? 'Waiting for empty cells to fill.' : 'No playlist running.';
      $('#plStop').hidden = !hasFill;
      return;
    }
    var seen = {}, lines = [];
    tiles.forEach(function (t) { seen[t.pl] = (seen[t.pl] || 0) + 1; });
    Object.keys(seen).forEach(function (k) {
      var p = S.playlists[k];
      lines.push('"' + p.name + '": ' + A.plCount(p) + (p.truncated ? ', the first ' + PL.MAX_FILES.toLocaleString('en-US') + ' in the folder' : '') + ' on ' + seen[k] + (seen[k] === 1 ? ' tile' : ' tiles'));
    });
    box.textContent = lines.join('. ') + '.';
    $('#plStop').hidden = false;
  };

  /* ---------- new files in a playlist's folder ---------- */
  // The playlists in use, once each: [[id, playlist]].
  function inUse() {
    var out = [], seen = {};
    playlistTiles().forEach(function (t) { if (!seen[t.pl]) { seen[t.pl] = true; out.push([t.pl, S.playlists[t.pl]]); } });
    if (S.fillPl && S.playlists[S.fillPl] && !seen[S.fillPl]) out.push([S.fillPl, S.playlists[S.fillPl]]);
    return out;
  }
  // The main process watches the folders and says when one changed. A slow rescan also runs, for network drives
  // that do not report changes.
  function watched() { return inUse().filter(function (j) { return j[1].root; }); }
  var watchSig = null;
  A.syncWatches = function () {
    var roots = [], seen = {};
    watched().forEach(function (j) { var k = j[1].root.toLowerCase(); if (!seen[k]) { seen[k] = true; roots.push(j[1].root); } });
    var sig = roots.join('\n');
    if (sig === watchSig) return;
    watchSig = sig;
    A.api.watchFolders(roots);
  };
  var busy = {}, again = {};
  function rescan(key) {
    if (busy[key]) { again[key] = true; return; }
    var jobs = watched().filter(function (j) { return j[1].root.toLowerCase() === key; });
    if (!jobs.length) return;
    busy[key] = true;
    function finish() {
      busy[key] = false;
      A.scheduleSession();
      if (again[key]) { again[key] = false; rescan(key); }
    }
    A.api.expand([jobs[0][1].root]).then(function (res) {
      if (!res.entries.length) return;       // folder gone for now (drive offline?): keep what we have
      jobs.forEach(function (j) {
        if (S.playlists[j[0]] !== j[1]) return;
        var n = PL.refresh(j[1], res.entries);
        j[1].truncated = !!res.truncated;
        if (n) A.toast('"' + j[1].name + '": ' + n + (n === 1 ? ' new file' : ' new files') + ' added to the playlist.');
      });
    }).then(finish, finish);
  }
  A.api.onFolderChanged(function (root) { rescan(String(root).toLowerCase()); });
  setInterval(function () {
    var keys = {};
    watched().forEach(function (j) { keys[j[1].root.toLowerCase()] = true; });
    Object.keys(keys).forEach(rescan);
  }, 120000);

  /* ---------- a collection's playlist follows the collection ---------- */
  // When the library changes (and once the wall is loaded), each playlist that plays a library collection takes its
  // files and order as they are now. A collection that was deleted or emptied leaves its tiles playing what they have.
  A.followCollections = function () {
    var lists = inUse().filter(function (j) { return j[1].coll; }), ids = {};
    lists.forEach(function (j) { ids[j[1].coll] = true; });
    Object.keys(ids).forEach(function (c) {
      A.api.collectionFiles(c).then(function (entries) {
        if (!entries || !entries.length) return;
        lists.forEach(function (j) {
          if (j[1].coll !== c || S.playlists[j[0]] !== j[1]) return;
          var n = PL.follow(j[1], entries);
          if (n < 0) return;
          A.scheduleSession();
          if (n) A.toast('"' + j[1].name + '": ' + n + (n === 1 ? ' new file' : ' new files') + ' added to the playlist.');
        });
      });
    });
  };
  var followTimer = 0;
  A.api.onLibrary(function () { clearTimeout(followTimer); followTimer = setTimeout(A.followCollections, 1000); });

  /* ---------- starting and stopping ---------- */
  // The ticked boxes of a "Plays" group (Videos, GIFs, Images). One always stays ticked: unticking the last one
  // puts it back.
  A.readTypes = function (box) {
    return Array.prototype.filter.call(box.querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; });
  };
  A.guardTypes = function (box) {
    box.addEventListener('change', function (e) {
      if (A.readTypes(box).length) return;
      e.target.checked = true;
      A.toast('A playlist plays at least one kind of file.');
    }, true);
  };
  A.guardTypes($('#plTypes'));
  A.readPlOpts = function () {
    return {
      shuffle: $('#plOrder').value === 'shuffle',
      secs: clamp(parseInt($('#plSecs').value, 10) || 10, 2, 300),
      randomStart: $('#plFrom').value === 'random',
      maxClip: clamp(parseInt($('#plMax').value, 10) || 0, 0, 3600),
      fade: parseFloat($('#plFade').value) || 0,
      gifOnce: $('#plGif').value === 'once',
      keepView: $('#plView').value === 'keep',
      fitShape: $('#plShape').value === 'tile',
      types: A.readTypes($('#plTypes'))
    };
  };
  // "12 files" or "12 of 30 files (videos only)": what a playlist plays of its folder.
  A.plCount = function (p) {
    var n = PL.playable(p), all = p.files.length, t = PL.typesLabel(p);
    return (n === all ? n : n + ' of ' + all) + (all === 1 ? ' file' : ' files') + (t ? ' (' + t + ')' : '');
  };
  function nothingPlays(p, fromLib) {
    A.toast('"' + p.name + '" has no ' + (PL.typesLabel(p).replace(' only', '') || 'media') + '. ' +
      (fromLib ? 'Pick other kinds in the library (Videos, GIFs, Pictures), or none for all of them.' : 'Tick more kinds of file under Plays.'));
  }
  function newId() { return 'p' + Date.now().toString(36) + S.nid; }
  // Files from the library rather than one folder: res.title names the playlist, res.coll is the collection it follows,
  // res.types the kinds of file it plays (the library's Videos / GIFs / Pictures as picked when it was played), also of
  // the files that join it later.
  function fromRes(p, res) {
    if (res.title) p.name = String(res.title).slice(0, 60);
    if (res.coll) p.coll = res.coll;
    if (res.types) p.types = PL.cleanTypes(res.types);
    return p;
  }
  // A folder that fills the empty tiles and empty cells of the wall. Rows or columns added later fill up with it too.
  // lib (the library's Play on the wall as a playlist): an empty wall first gets tiles for it (coverWall), and then
  // Fill the wall arranges every tile by its media's shape, edge to edge (in Free layout), in the same undo step.
  A.fillWithFolder = function (res, opts, lib) {
    var files = res.entries || [];
    if (!files.length) { A.toast(A.noMediaMessage(res)); return; }
    var bare = !!lib && !S.items.some(function (i) { return !i.sample; });
    if (!bare && S.mode === 'free' && !S.items.some(function (i) { return i.kind === 'empty'; })) {
      A.toast('In Free (pixels), a playlist plays in empty tiles. Right-click the wall and choose New empty tile, or use Arrange > Rows and columns.');
      return;
    }
    var id = newId(), p = fromRes(PL.make(files, opts, PL.rootFor(res, files)), res);
    if (!PL.playable(p)) { nothingPlays(p, !!res.types); return; }
    A.pushHistory();
    S.items = S.items.filter(function (i) { return !i.sample; });
    if (S.sel && !A.itemById(S.sel)) S.sel = null;
    if (bare) coverWall(Math.min(PL.playable(p), S.cols * S.rows));
    p.truncated = !!res.truncated;
    S.playlists[id] = p;
    S.fillPl = id;
    var n = A.autoFill(false), more = !lib && S.mode !== 'free' && PL.playable(p) > n;   // files left for new cells
    // From the library with every file on a tile of its own: each tile stays on its file (pinned), so a short one that
    // ends does not move on to a file another tile already shows. Pin all in the bar lets them move on.
    var own = lib && n && n >= PL.playable(p);
    if (own) S.items.forEach(function (it) { if (it.pl === id) A.setPinned(it, true, true); });
    var msg = [n
      ? 'Playing "' + p.name + '" (' + A.plCount(p) + ') on ' + n + (n === 1 ? ' tile.' : ' tiles.') + (more ? ' Add rows or columns and they fill too.' : '') +
        (own ? (n === 1 ? ' It is the only one, so the tile stays on it.' : ' Each file has a tile of its own, so each tile stays on its file (Pin all in the bar lets them move on).') : '')
      : 'The wall is full. Add rows or columns and the folder "' + p.name + '" will fill them.'].concat(A.scanNotes(res)).join(' ');
    if (lib && n) { A.fillWallAfterAdding(msg); return; }
    A.render(); A.refreshInspector();
    A.toast(msg);
  };
  // An empty wall gets n empty tiles for a playlist to fill: one per file, at most as many as the grid has cells (Arrange
  // › Rows and columns), placed as G.coverWall lays them out; Fill the wall then gives each its media's shape. With
  // that many files on the grid, its empty cells take the playlist as they are.
  function coverWall(n) {
    var d = A.wallPx(), full = n >= S.cols * S.rows;
    if (S.mode !== 'free' && full) return;
    var L = full ? { cols: S.cols, rows: S.rows, frames: G.gridFrames(S.cols, S.rows).map(function (f) { return { col: f[0], row: f[1], w: 1, h: 1 }; }) } : G.coverWall(n, d.W, d.H);
    var tiles = L.frames.map(function (f) { return A.makeEmptyItem(f); });
    MW.free.toFree(tiles, L.cols, L.rows, S.gap, d);   // where they go in Free layout
    S.items = S.items.concat(tiles);
  }
  // Puts the fill folder into each empty tile, then (on the grid) into each empty cell, never more tiles than files.
  // With onlyNew (the grid grew), only cells outside the old oldCols by oldRows grid are filled.
  A.autoFill = function (onlyNew, oldCols, oldRows) {
    var p = S.fillPl && S.playlists[S.fillPl];
    if (!p) return 0;
    var room = PL.playable(p) - S.items.filter(function (i) { return i.pl === S.fillPl; }).length, count = 0;
    if (room <= 0) return 0;
    if (!onlyNew) S.items.forEach(function (it) {
      if (count >= room || it.kind !== 'empty') return;
      var f = PL.nextFile(p);
      A.replaceMedia(it, f);
      it.pl = S.fillPl; it.loop = false; it.shown = 0;
      count++;
    });
    if (S.mode === 'free') return count;
    var m = G.occupancy(S.items, S.cols, S.rows);
    for (var r = 0; r < S.rows && count < room; r++) for (var c = 0; c < S.cols && count < room; c++) {
      if (m[r][c]) continue;
      if (onlyNew && c < oldCols && r < oldRows) continue;
      var f = PL.nextFile(p);
      S.items.push({
        id: S.nid++, name: f.name, path: f.path, kind: f.kind, url: U.fileUrl(f.path),
        col: c, row: r, w: 1, h: 1, fit: S.fit, muted: true, loop: false, sample: false, missing: false, pl: S.fillPl, shown: 0
      });
      m[r][c] = true; count++;
    }
    return count;
  };
  function stopPlaylist() {
    if (S.items.some(function (i) { return i.pl; })) A.pushHistory();
    S.items.forEach(function (it) { if (it.pl) { it.pl = null; it.pinned = false; it.loop = true; A.removeTileEl(it.id); } });
    S.playlists = {}; S.fillPl = null;
    A.render(); A.refreshInspector(); A.refreshPlaylistStatus();
  }
  // This tile stops playing its folder and keeps showing the file it has now.
  A.leavePlaylist = function (it) {
    if (!it.pl) return;
    A.pushHistory();
    it.pl = null; it.pinned = false; it.loop = true; it.shown = 0;
    A.removeTileEl(it.id);
    A.render(); A.refreshInspector();
    A.toast('This tile now keeps showing ' + it.name + '.');
  };
  // Give one tile its own folder. It gets a separate playlist, so other tiles keep theirs.
  A.assignFolder = function (it, res) {
    var files = res.entries || [];
    if (!files.length) { A.toast(A.noMediaMessage(res)); return; }
    var base = (it.pl && S.playlists[it.pl]) || A.readPlOpts();
    var id = newId(), p = fromRes(PL.make(files, base, PL.rootFor(res, files)), res);
    if (!PL.playable(p)) { nothingPlays(p, !!res.types); return; }
    p.truncated = !!res.truncated;
    A.pushHistory();
    S.playlists[id] = p;
    var mu = it.muted, ft = it.fit, f = PL.nextFile(p);
    A.replaceMedia(it, f);
    it.muted = mu; it.fit = ft; it.pl = id; it.pinned = false; it.loop = false; it.shown = 0;
    A.render(); A.refreshInspector();
    A.toast(['This tile now plays "' + p.name + '" (' + A.plCount(p) + ').'].concat(A.scanNotes(res)).join(' '));
  };

  $('#plStart').addEventListener('click', function () {
    var opts = A.readPlOpts();
    A.closePops();
    A.api.openFolder().then(function (res) { if (A.picked(res)) A.fillWithFolder(res, opts); });
  });
  $('#plStop').addEventListener('click', stopPlaylist);
  $('#plFill').addEventListener('click', function () {
    var n = A.autoFill(false);
    A.render(); A.refreshInspector(); A.refreshPlaylistStatus();
    A.toast(n ? 'Added ' + n + (n === 1 ? ' tile.' : ' tiles.') : 'No empty cells to fill, or every file is already on a tile.');
  });
})(window.MW.app);
