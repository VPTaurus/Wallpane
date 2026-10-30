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
  // The displays under Settings › Wall mode › Show on. At start a chosen display that is gone is forgotten; later (a
  // TV switched off) the choice stays, marked as not connected, and wall mode goes back to it when it returns.
  // Returns true when there are more displays than before (one was just connected).
  var displaysShown = null;
  A.fillDisplays = function (displays, atStart) {
    var sel = $('#display'), more = displaysShown != null && displays.length > displaysShown;
    displaysShown = displays.length;
    while (sel.options.length > 1) sel.remove(1);
    displays.forEach(function (d) { var o = document.createElement('option'); o.value = String(d.id); o.textContent = d.label; sel.appendChild(o); });
    if (S.display != null && !displays.some(function (d) { return d.id === S.display; })) {
      if (atStart) S.display = null;
      else { var o = document.createElement('option'); o.value = String(S.display); o.textContent = 'The chosen display (not connected now)'; sel.appendChild(o); }
    }
    sel.value = S.display == null ? '' : String(S.display);
    return more;
  };
  api.onDisplaysChanged(function () {
    api.displays().then(function (list) {
      if (A.fillDisplays(list, false)) A.toast('A display was connected. Settings › Wall mode › Show on can put the wall on it.');
    });
  });

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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'l') { e.preventDefault(); A.toggleLibrary(); return; }
    if (e.key === 'Escape' && A.soloId != null) { A.setSolo(null); return; }   // only the tile's full screen ends
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
    // A selected video: Space or K plays and pauses, J and L skip 5 s back and on, [ and ] set where the looped part
    // starts and ends, \ stops looping it, < and > change the speed, M mutes.
    var vid = A.videoOf(it), key = e.key;
    if (vid && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((key === ' ' && t.tagName !== 'BUTTON') || key === 'k' || key === 'K') { e.preventDefault(); if (vid.paused) vid.play().catch(function () {}); else vid.pause(); return; }
      if (/^[jJlL]$/.test(key)) {
        e.preventDefault();
        vid.currentTime = clamp(vid.currentTime + (key.toLowerCase() === 'j' ? -5 : 5), 0, isFinite(vid.duration) ? vid.duration : Infinity);
        return;
      }
      if (!it.pl && key === '[') { e.preventDefault(); var at = vid.currentTime; A.setLoop(it, at, it.loopB != null && it.loopB > at ? it.loopB : null); return; }
      if (!it.pl && key === ']') { e.preventDefault(); A.setLoop(it, it.loopA || 0, vid.currentTime); return; }
      if (!it.pl && key === '\\') { e.preventDefault(); A.setLoop(it, null, null); return; }
      if (key === '<' || key === '>') { e.preventDefault(); A.setSpeed(it, MW.play.stepSpeed(it.speed || 1, key === '>' ? 1 : -1)); A.toast('Speed ' + it.speed + '×'); return; }
      if (key === 'm' || key === 'M') { e.preventDefault(); it.muted = !it.muted; A.render(); A.refreshInspector(); A.updateTransport(); return; }
    }
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

  /* ---------- the bar on one line ---------- */
  // Measured rather than set by window width: the clock's chips come and go. Changes wait for the next frame, so a
  // change here never feeds back into the observer that asked for it.
  var bar = $('.bar'), fitQueued = false;
  function oneLine() { return bar.lastElementChild.getBoundingClientRect().top < bar.firstElementChild.getBoundingClientRect().bottom; }
  A.fitBar = function () {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () {
      fitQueued = false;
      bar.classList.remove('c1', 'c2', 'c3');
      ['c1', 'c2', 'c3'].some(function (c) {
        if (oneLine()) return true;
        bar.classList.add(c);
        return false;
      });
    });
  };
  new ResizeObserver(A.fitBar).observe(bar);

  /* ---------- popovers and menus ---------- */
  // name: [popover, the button it hangs from]. Frame layouts opens from the Arrange menu, so it has no button of its own.
  var POPS = {
    add: ['#popAdd', '#addBtn'], wall: ['#popGrid', '#gridBtn'], arrange: ['#popArr', '#arrangeMenuBtn'], layouts: ['#popL', '#arrangeMenuBtn'], builder: ['#popB', '#arrangeMenuBtn'],
    presets: ['#pop', '#presetBtn'], playlist: ['#popP', '#playlistBtn'], help: ['#popH', '#helpBtn'], settings: ['#popS', '#settingsBtn'],
    time: ['#popT', '#timeBtn'], music: ['#popM', '#musicBtn'], jobs: ['#popJ', '#jobsBtn']
  };
  A.closePops = function () {
    Object.keys(POPS).forEach(function (k) { $(POPS[k][0]).hidden = true; $(POPS[k][1]).setAttribute('aria-expanded', 'false'); });
  };
  // Popovers are positioned from their button and clamped to the window, so they never run off an edge.
  // They open to the right of buttons on the left side of the bar, and to the left of the others.
  function placePop(pop, btn) {
    var vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
    var w = Math.min(pop.classList.contains('menu') ? 300 : pop.classList.contains('settings') ? 680 : 380, vw - 2 * m);
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
    else if (which === 'time') A.refreshTime();
    else if (which === 'music') A.refreshMusic();
    else if (which === 'jobs') A.refreshJobs();
    placeOpen();
  }
  // About, in Settings: version and licence, the source code, and support links when package.json lists any.
  function fillAbout() {
    api.appInfo().then(function (info) {
      $('#aboutLine').textContent = info.name + ' ' + info.version + ' · free software, ' + String(info.license || '').replace('-or-later', ' or later').replace('-', ' ') + '. It never goes online.';
      var f = info.ffmpeg;
      $('#aboutFfmpeg').textContent = f
        ? 'Includes FFmpeg ' + f.version + ' (build by ' + f.by + '), free software under the ' + f.license.replace('-', ' ') + ', used for converting and reading media files.'
        : 'FFmpeg is not in this copy (npm run fetch-ffmpeg adds it), so converting files is not available.';
      var box = $('#aboutLinks'), links = [];
      if (info.links.source) links.push(['Source code', info.links.source]);
      if (info.links.ffmpeg) links.push(['FFmpeg source', info.links.ffmpeg]);
      info.links.support.forEach(function (u) {
        links.push([/github\.com\/sponsors/.test(u) ? 'Sponsor on GitHub' : 'Support Wallpane', u]);
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

  /* ---------- Settings: a section at a time (General, Wall mode, Emergency hide, Keys, About) ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.snav [role="tab"]')), secNow = 'general';
  function showSec(name) {
    secNow = name;
    tabs.forEach(function (t) {
      var on = t.dataset.sec === name;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    $('.sbody').scrollTop = 0;
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { showSec(t.dataset.sec); });
    // Up and down arrows move between the sections, like any list of tabs.
    t.addEventListener('keydown', function (e) {
      var d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      var next = tabs[(i + d + tabs.length) % tabs.length];
      showSec(next.dataset.sec); next.focus();
    });
  });
  // Opens Settings at one section ('keys', 'about', ...), e.g. from Help.
  A.openSettings = function (name) {
    openPop('settings');
    showSec(name || secNow);
  };
  $('#helpKeys').addEventListener('click', function () { A.openSettings('keys'); });
  $('#helpAbout').addEventListener('click', function () { A.openSettings('about'); });

  function refreshSettings() {
    showSec(secNow);
    A.refreshHideSettings();
    A.refreshStorage();
    A.refreshLibrary();
    fillAbout();
    $('#setStartWall').checked = S.startWall;
    $('#setAwake').checked = S.awake;
    $('#setClock').value = typeof S.clock24 === 'boolean' ? (S.clock24 ? '24' : '12') : '';
    $('#setSoloSound').checked = S.soloSound;
    $('#setFillShapes').checked = S.fillShapes;
    $('#setPauseMin').checked = S.pauseMin;
    $('#setStartWith').value = S.startWith;
    $('#setConvert').checked = S.autoConvert;
    $('#setGifVideo').value = S.gifVideo;
    $('#setResize').value = S.resizeMode;
    api.loginItem().then(function (r) {
      var cb = $('#setLogin');
      cb.disabled = !r.supported; cb.checked = !!r.on;
      $('#loginNote').textContent = r.supported ? '' : 'Starting with Windows works in the installed or portable app, not when run with npm start.';
    });
    api.storeInfo().then(function (i) { $('#dataDir').textContent = i.dir; });
  }
  $('#setClock').addEventListener('change', function () {
    S.clock24 = this.value === '' ? null : this.value === '24';
    A.savePrefs();
  });
  $('#dataDirBtn').addEventListener('click', function () { api.revealStore(); });
  $('#castBtn').addEventListener('click', function () { api.openDisplaySettings(); });
  $('#setSoloSound').addEventListener('change', function () { S.soloSound = this.checked; A.savePrefs(); A.render(); });
  $('#setFillShapes').addEventListener('change', function () { S.fillShapes = this.checked; A.savePrefs(); });
  $('#setPauseMin').addEventListener('change', function () { S.pauseMin = this.checked; A.savePrefs(); });
  $('#setStartWith').addEventListener('change', function () { S.startWith = this.value; A.savePrefs(); });

  // Minimized, the wall rests: its videos pause and image playlists stop moving on, until the window is back.
  var restWas = null;
  api.onMinimized(function (min) {
    if (min && S.pauseMin && !restWas) {
      var vids = Array.prototype.slice.call(A.wall.querySelectorAll('video'));
      restWas = { playing: vids.filter(function (v) { return !v.paused; }), paused: A.wallPaused };
      A.wallPaused = true;
      restWas.playing.forEach(function (v) { v.pause(); });
    } else if (!min && restWas) {
      A.wallPaused = restWas.paused;
      restWas.playing.forEach(function (v) { if (v.isConnected) v.play().catch(function () {}); });
      restWas = null;
    }
    A.updateTransport();
  });
  $('#setResize').addEventListener('change', function () { S.resizeMode = this.value === 'squeeze' ? 'squeeze' : 'even'; A.savePrefs(); });
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
