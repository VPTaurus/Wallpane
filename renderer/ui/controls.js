// The control bar, keyboard shortcuts, wall mode, popovers and the Settings panel.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, G = MW.geo, U = MW.util;
  var S = A.S, $ = A.$, api = A.api, wall = A.wall, clamp = U.clamp;

  /* ---------- grid size and look ---------- */
  function setGrid(c, r) {
    c = clamp(parseInt(c, 10) || S.cols, 1, 12); r = clamp(parseInt(r, 10) || S.rows, 1, 12);
    if (c === S.cols && r === S.rows) { A.render(); return; }
    var oc = S.cols, orows = S.rows;
    var fits = S.items.every(function (i) { return i.col + i.w <= c && i.row + i.h <= r; });
    A.pushHistory();
    if (!fits) {
      // Tiles that still fit stay where they are. Tiles outside the new grid move to the nearest free
      // cell (smaller if needed). If there is no room at all, those tiles are removed; Ctrl+Z brings them back.
      var plan = G.shrinkTo(S.items, c, r), dropped = plan.dropped;
      G.applyGeo(S.items, plan.geo);
      if (dropped.length) {
        S.items = S.items.filter(function (i) { return dropped.indexOf(i.id) < 0; });
        if (S.sel && dropped.indexOf(S.sel) > -1) S.sel = null;
      }
      A.toast(dropped.length
        ? dropped.length + (dropped.length === 1 ? ' tile' : ' tiles') + ' removed to fit ' + c + ' × ' + r + '. Ctrl+Z brings back.'
        : 'Tiles moved to fit ' + c + ' × ' + r + '.');
    }
    S.cols = c; S.rows = r;
    var filled = A.autoFill(true, oc, orows);
    if (filled) A.toast(filled + (filled === 1 ? ' new tile' : ' new tiles') + ' playing "' + S.playlists[S.fillPl].name + '".');
    A.savePrefs(); A.render(); A.refreshInspector();
  }
  $('#colsDec').addEventListener('click', function () { setGrid(S.cols - 1, S.rows); });
  $('#colsInc').addEventListener('click', function () { setGrid(S.cols + 1, S.rows); });
  $('#rowsDec').addEventListener('click', function () { setGrid(S.cols, S.rows - 1); });
  $('#rowsInc').addEventListener('click', function () { setGrid(S.cols, S.rows + 1); });
  $('#cols').addEventListener('change', function () { setGrid($('#cols').value, S.rows); });
  $('#rows').addEventListener('change', function () { setGrid(S.cols, $('#rows').value); });
  $('#gap').addEventListener('input', function () { S.gap = parseInt($('#gap').value, 10) || 0; A.savePrefs(); A.render(); });
  $('#aspect').addEventListener('change', function () { S.aspect = $('#aspect').value; A.savePrefs(); A.render(); });
  $('#fit').addEventListener('change', function () { S.fit = $('#fit').value; S.items.forEach(function (i) { if (!i.fitSet) i.fit = S.fit; }); A.savePrefs(); A.render(); A.refreshInspector(); });
  $('#display').addEventListener('change', function () { var v = $('#display').value; S.display = v === '' ? null : Number(v); A.savePrefs(); });

  /* ---------- adding media ---------- */
  $('#addFiles').addEventListener('click', function () {
    A.closePops();
    api.openFiles(true).then(function (res) { if (A.picked(res)) A.addFiles(res, null); });
  });
  $('#folderPl').addEventListener('click', function () {
    var opts = A.readPlOpts();
    A.closePops();
    api.openFolder().then(function (res) { if (A.picked(res)) A.fillWithFolder(res, opts); });
  });
  $('#folderTiles').addEventListener('click', function () {
    A.closePops();
    api.openFolder().then(function (res) { if (A.picked(res)) A.addFiles(res, null); });
  });
  wall.addEventListener('click', function (e) {
    var slot = e.target.closest('.slot');
    if (slot) {
      var target = { col: +slot.dataset.col, row: +slot.dataset.row };
      api.openFiles(true).then(function (res) { if (A.picked(res)) A.addFiles(res, target); });
      return;
    }
    if (e.target === wall) A.select(null);
  });

  /* ---------- undo, play, mute, loop ---------- */
  $('#undoBtn').addEventListener('click', function () { A.undo(); });
  $('#redoBtn').addEventListener('click', function () { A.redo(); });
  $('#playAll').addEventListener('click', function () {
    var vids = A.videos();
    var anyPlaying = vids.some(function (v) { return !v.paused; }) || (A.hasImagePlaylist() && !A.wallPaused);
    A.wallPaused = anyPlaying;
    vids.forEach(function (v) { if (anyPlaying) v.pause(); else v.play().catch(function () {}); });
    A.updateTransport();
  });
  $('#muteAll').addEventListener('click', function () {
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing; });
    var anyOn = vi.some(function (i) { return !i.muted; });
    vi.forEach(function (i) { i.muted = anyOn; });
    A.render(); A.refreshInspector();
  });
  $('#loopAll').addEventListener('click', function () {
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing && !i.pl; });
    var allOn = vi.length > 0 && vi.every(function (i) { return i.loop; });
    vi.forEach(function (i) { i.loop = !allOn; });
    A.render(); A.refreshInspector();
    if (!allOn) A.videos().forEach(function (v) { if (v.ended) v.play().catch(function () {}); });
  });

  /* ---------- wall mode ---------- */
  // Wall mode hides the controls and goes fullscreen on the chosen display, keeping the display awake if Settings
  // say so. Leaving fullscreen by any route leaves wall mode.
  A.setClean = function (on) {
    if (on) { A.closeProps(); A.closePops(); }
    document.body.classList.toggle('clean', on);
    wake();
    api.setFullscreen(on, S.display);
    api.keepAwake(on && S.awake);
  };
  api.onFullscreen(function (v) {
    A.isFs = v;
    if (!v) document.body.classList.remove('clean');
  });
  api.isFullscreen().then(function (v) { A.isFs = v; });
  // In wall mode the cursor and tile buttons disappear after a few idle seconds and come back on movement.
  var idleTimer = 0;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (document.body.classList.contains('clean')) idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3000);
  }
  document.addEventListener('mousemove', wake);
  document.addEventListener('mousedown', wake);
  $('#newWinBtn').addEventListener('click', function () {
    A.closePops();
    api.newWindow().then(function (r) { if (r && r.error) A.toast(r.error); });
  });
  $('#cleanBtn').addEventListener('click', function () { A.setClean(true); });
  $('#exitBtn').addEventListener('click', function () { A.setClean(false); });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    var t = e.target, inField = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (e.key === 'F11') { e.preventDefault(); A.setClean(!document.body.classList.contains('clean')); return; }
    // Escape (or Enter) first closes the right-click menu, or finishes repositioning media, or closes Properties.
    if (e.key === 'Escape' && A.menuOpen()) { A.hideMenu(); return; }
    if ((e.key === 'Escape' || (e.key === 'Enter' && !inField)) && A.reposId != null) { e.preventDefault(); A.endRepos(); return; }
    if (e.key === 'Escape' && A.propsOpen) { A.closeProps(); return; }
    if (e.key === 'Enter' && e.altKey && A.selected()) { e.preventDefault(); A.openProps(A.selected()); return; }
    if (e.key === 'Escape') {
      if (document.body.classList.contains('clean')) A.setClean(false);
      else if (A.isFs) api.setFullscreen(false, null);
      A.closePops();
      A.select(null);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !inField) {
      var k = String(e.key).toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); A.undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); A.redo(); return; }
    }
    var it = A.selected();
    if (!it || inField) return;
    if (e.key === 'Delete') { e.preventDefault(); A.removeItem(it.id); return; }
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (S.mode === 'free') { A.nudgeFree(it, d, e); return; }
    var g = { col: it.col, row: it.row, w: it.w, h: it.h };
    if (e.shiftKey) { g.w = clamp(g.w + d[0], 1, S.cols); g.h = clamp(g.h + d[1], 1, S.rows); }
    else { g.col += d[0]; g.row += d[1]; }
    var res = G.resolveYield(S.items, it.id, g, null, S.cols, S.rows);
    if (res) { A.pushHistory(); A.commitYield(res); A.render(); A.refreshInspector(); }
  });

  // Clear wall (in Settings) takes two clicks: the first arms it for three seconds.
  var clearArmed = false;
  $('#clearBtn').addEventListener('click', function () {
    var b = this, lbl = b.querySelector('.lbl');
    if (!clearArmed) {
      clearArmed = true; lbl.textContent = 'Click again to clear the wall'; b.classList.add('armed');
      setTimeout(function () { clearArmed = false; lbl.textContent = 'Clear wall'; b.classList.remove('armed'); }, 3000);
      return;
    }
    clearArmed = false; lbl.textContent = 'Clear wall'; b.classList.remove('armed');
    A.closePops();
    A.pushHistory();
    S.items = []; S.sel = null; S.presetName = null; S.playlists = {}; S.fillPl = null; A.render(); A.refreshInspector();
    A.toast('Wall cleared. Ctrl+Z brings it back.');
  });

  /* ---------- popovers and menus ---------- */
  // name: [popover, the button it hangs from]. Frame layouts opens from the Arrange menu, so it has no button of its own.
  var POPS = {
    add: ['#popAdd', '#addBtn'], wall: ['#popGrid', '#gridBtn'], arrange: ['#popArr', '#arrangeMenuBtn'], layouts: ['#popL', '#arrangeMenuBtn'], builder: ['#popB', '#arrangeMenuBtn'],
    presets: ['#pop', '#presetBtn'], playlist: ['#popP', '#playlistBtn'], help: ['#popH', '#helpBtn'], settings: ['#popS', '#settingsBtn']
  };
  A.closePops = function () {
    Object.keys(POPS).forEach(function (k) { $(POPS[k][0]).hidden = true; $(POPS[k][1]).setAttribute('aria-expanded', 'false'); });
  };
  // Popovers are positioned from their button and clamped to the window, so they never run off an edge.
  // They open to the right of buttons on the left side of the bar, and to the left of the others.
  function placePop(pop, btn) {
    var vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
    var w = Math.min(pop.classList.contains('menu') ? 300 : 380, vw - 2 * m);
    var r = btn.getBoundingClientRect();
    pop.style.width = w + 'px';
    pop.style.left = clamp(r.left + w <= vw - m ? r.left : r.right - w, m, Math.max(m, vw - w - m)) + 'px';
    var below = vh - r.bottom - 8 - m;
    if (below >= 260 || below >= r.top - 8 - m) {
      pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 8) + 'px';
      pop.style.maxHeight = Math.max(160, below) + 'px';
    } else {
      pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + 8) + 'px';
      pop.style.maxHeight = Math.max(160, r.top - 8 - m) + 'px';
    }
  }
  function placeOpen() {
    Object.keys(POPS).forEach(function (k) { if (!$(POPS[k][0]).hidden) placePop($(POPS[k][0]), $(POPS[k][1])); });
  }
  window.addEventListener('resize', placeOpen);
  window.addEventListener('scroll', placeOpen);
  function openPop(which) {
    A.closePops();
    $(POPS[which][0]).hidden = false; $(POPS[which][1]).setAttribute('aria-expanded', 'true');
    if (which === 'presets') { $('#presetName').value = S.presetName || ''; A.refreshPresetList(); }
    else if (which === 'layouts') {
      A.renderLayouts();
      // Another window may have saved a layout since.
      api.storeGet('layouts').then(function (l) { A.loadUserLayouts(l); if (!$('#popL').hidden) A.renderLayouts(); });
    }
    else if (which === 'playlist') A.refreshPlaylistStatus();
    else if (which === 'settings') refreshSettings();
    else if (which === 'help') fillAbout();
    placeOpen();
  }
  // About, in Help: version and licence, the source code, and support links when package.json lists any.
  function fillAbout() {
    api.appInfo().then(function (info) {
      $('#aboutLine').textContent = info.name + ' ' + info.version + ' · free software, ' + String(info.license || '').replace('-or-later', ' or later').replace('-', ' ') + '. It never goes online.';
      var box = $('#aboutLinks'), links = [];
      if (info.links.source) links.push(['Source code', info.links.source]);
      info.links.support.forEach(function (u) {
        links.push([/buymeacoffee\.com/.test(u) ? 'Buy me a coffee' : /github\.com\/sponsors/.test(u) ? 'Sponsor on GitHub' : 'Support Wallpane', u]);
      });
      box.innerHTML = '';
      links.forEach(function (l) {
        var b = document.createElement('button');
        b.className = 'btn'; b.type = 'button'; b.textContent = l[0]; b.title = l[1] + ' (opens in your browser)';
        b.addEventListener('click', function () { api.openLink(l[1]); });
        box.appendChild(b);
      });
    });
  }
  A.openPop = openPop;
  Object.keys(POPS).forEach(function (k) {
    if (k === 'layouts' || k === 'builder') return;   // these open from the Arrange menu
    $(POPS[k][1]).addEventListener('click', function (e) { e.stopPropagation(); if ($(POPS[k][0]).hidden) openPop(k); else A.closePops(); });
  });
  $('#layoutBtn').addEventListener('click', function (e) { e.stopPropagation(); openPop('layouts'); });
  // A click outside closes popovers. Not outside: a button that a popover just redrew (no longer on the page), and the
  // right-click menu, whose items may open a popover themselves.
  document.addEventListener('click', function (e) { if (e.target.isConnected && !e.target.closest('.popwrap, .ctx')) A.closePops(); });

  /* ---------- Settings: wall mode and startup ---------- */
  function refreshSettings() {
    $('#setStartWall').checked = S.startWall;
    $('#setAwake').checked = S.awake;
    api.loginItem().then(function (r) {
      var cb = $('#setLogin');
      cb.disabled = !r.supported; cb.checked = !!r.on;
      $('#loginNote').textContent = r.supported ? '' : 'Starting with Windows works in the installed or portable app, not when run with npm start.';
    });
  }
  $('#setStartWall').addEventListener('change', function () { S.startWall = this.checked; A.savePrefs(); });
  $('#setAwake').addEventListener('change', function () {
    S.awake = this.checked; A.savePrefs();
    if (document.body.classList.contains('clean')) api.keepAwake(S.awake);
  });
  $('#setLogin').addEventListener('change', function () {
    var cb = this;
    api.setLoginItem(cb.checked).then(function (r) {
      cb.checked = !!r.on;
      if (!r.ok) A.toast('Windows did not accept that change.');
    });
  });
})(window.MW.app);
