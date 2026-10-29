// Tiles on the wall: building them, keeping them in sync with the state, moving and resizing them, and render().
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free;
  var S = A.S, wall = A.wall, $ = A.$, ICON = A.ICON, clamp = U.clamp;

  function idsNow() { return S.items.map(function (i) { return i.id; }); }

  /* ---------- building a tile ---------- */
  function createTile(it) {
    var el = document.createElement('div');
    el.className = 'tile is-' + it.kind + (it.missing ? ' is-missing' : '');
    el.draggable = true;
    el.dataset.id = it.id;
    // Tiles take keyboard focus: Tab moves between them and selects, Enter or Space selects or lets go.
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', it.name + ' (' + A.kindLabel(it) + (it.missing ? ', file not found' : '') + ')');
    var media;
    if (it.missing) {
      media = document.createElement('div');
      media.className = 'media offline-ph';
      var box = document.createElement('div');
      box.title = it.path || '';
      var n1 = document.createElement('div'); n1.className = 'nm'; n1.textContent = it.name;
      var n2 = document.createElement('div'); n2.textContent = 'File not found';
      var rb = document.createElement('button'); rb.className = 'btn rl'; rb.type = 'button'; rb.dataset.act = 'relink'; rb.textContent = 'Locate file';
      box.appendChild(n1); box.appendChild(n2); box.appendChild(rb); media.appendChild(box);
    } else if (it.kind === 'video') {
      media = document.createElement('video');
      media.className = 'media';
      media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true;
      media.setAttribute('playsinline', ''); media.preload = 'auto';
      if (it.pl) {
        media.addEventListener('ended', function () { if (!el._dead) A.advance(it); });
        media.addEventListener('loadedmetadata', function () { A.applyClipStart(it, media); });
        media.addEventListener('timeupdate', function () { if (!el._dead) A.clipTick(it, media); });
        media.addEventListener('playing', function () { var pp = S.playlists[it.pl]; if (pp) pp.bad = 0; });
      }
      media.addEventListener('error', function () { el.classList.add('broken'); });
      media.src = it.url;
    } else {
      media = document.createElement('img');
      media.className = 'media'; media.alt = it.name;
      media.addEventListener('error', function () { el.classList.add('broken'); });
      media.src = it.url;
    }
    media.draggable = false;
    if (it.pl && !it.missing) {
      media.addEventListener('error', function () { if (!el._dead) A.failAdvance(it); });
      media.addEventListener('load', function () { var pp = S.playlists[it.pl]; if (pp) pp.bad = 0; });
    }
    el.appendChild(media);
    el._media = media;

    var fail = document.createElement('div');
    fail.className = 'fail';
    fail.textContent = 'Cannot play ' + it.name + '. The file may be damaged, or use a codec this app does not support. MP4 (H.264), WebM, JPEG, PNG, GIF and WebP work best.';
    el.appendChild(fail);

    var hud = document.createElement('div');
    hud.className = 'hud';
    var nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = it.name; nm.title = it.path || it.name;
    var bt = document.createElement('span'); bt.className = 'hbtns';
    bt.innerHTML =
      (it.pl ? '<button class="hb" data-act="pin" aria-label="Pin to this tile">' + ICON.pin + '</button>' : '') +
      (it.pl ? '<button class="hb" data-act="next" aria-label="Next in playlist" title="Next in playlist">' + ICON.next + '</button>' : '') +
      '<button class="hb" data-act="play" aria-label="Play or pause"></button>' +
      '<button class="hb" data-act="mute" aria-label="Sound on or off"></button>' +
      (it.pl ? '' : '<button class="hb" data-act="loop" aria-label="Loop on or off">' + ICON.loop + '</button>') +
      '<button class="hb" data-act="fit" aria-label="Fit">' + ICON.fit + '</button>' +
      '<button class="hb danger" data-act="remove" aria-label="Remove from wall">' + ICON.trash + '</button>';
    hud.appendChild(nm); hud.appendChild(bt);
    el.appendChild(hud);
    el._playBtn = bt.querySelector('[data-act="play"]');

    if (it.sample) { var bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'SAMPLE'; el.appendChild(bd); }

    ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(function (edge) {
      var hd = document.createElement('div');
      hd.className = 'rz' + (edge.length === 2 ? ' c' : '');
      hd.dataset.edge = edge;
      hd.addEventListener('pointerdown', function (e) { startResize(e, it, el, hd, edge); });
      el.appendChild(hd);
    });

    if (media.tagName === 'VIDEO') {
      media.addEventListener('play', function () { syncPlayBtn(el); A.updateTransport(); });
      media.addEventListener('pause', function () { syncPlayBtn(el); A.updateTransport(); });
    }

    el.addEventListener('focus', function () { if (el.matches(':focus-visible')) A.select(it.id); });
    el.addEventListener('keydown', function (e) {
      if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      A.select(S.sel === it.id ? null : it.id);
    });
    el.addEventListener('pointerdown', function (e) {
      if (S.mode !== 'free' || e.button !== 0) return;
      if (e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      startMoveFree(e, it, el);
    });
    el.addEventListener('click', function (e) {
      if (el._moved) { el._moved = false; return; }
      var b = e.target.closest('[data-act]');
      if (!b) { A.select(S.sel === it.id ? null : it.id); return; }
      e.stopPropagation();
      var act = b.dataset.act;
      if (act === 'remove') { A.removeItem(it.id); return; }
      if (act === 'next') { if (it.pinned) A.toast('This tile is pinned. Unpin it to skip.'); else A.advance(it); return; }
      if (act === 'pin') { A.setPinned(it, !it.pinned); return; }
      if (act === 'relink') { A.select(it.id); A.relinkOne(it); return; }
      if (act === 'fit') { it.fit = it.fit === 'cover' ? 'contain' : 'cover'; it.fitSet = true; A.render(); A.refreshInspector(); }
      else if (act === 'mute') { it.muted = !it.muted; A.render(); A.refreshInspector(); A.updateTransport(); }
      else if (act === 'loop') {
        it.loop = !it.loop; A.render(); A.refreshInspector(); A.updateTransport();
        if (it.loop && media.ended) media.play().catch(function () {});
      }
      else if (act === 'play') { if (media.paused) media.play().catch(function () {}); else media.pause(); }
    });
    el.addEventListener('dblclick', function (e) {
      if (e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      try {
        // Double-click toggles: into fullscreen for this tile, and back out when it is already fullscreen.
        var pr = document.fullscreenElement ? document.exitFullscreen() : (el.requestFullscreen && el.requestFullscreen());
        if (pr && pr.catch) pr.catch(function () {});
      } catch (err) { /* ignore */ }
    });
    el.addEventListener('dragstart', function (e) {
      var c = A.cellAt(e.clientX, e.clientY);
      A.drag.id = it.id;
      A.drag.dx = clamp(c.col - it.col, 0, it.w - 1);
      A.drag.dy = clamp(c.row - it.row, 0, it.h - 1);
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', it.name); } catch (err) { /* ignore */ }
      setTimeout(function () { el.classList.add('dragging'); }, 0);
    });
    el.addEventListener('dragend', function () { A.drag.id = null; el.classList.remove('dragging'); A.hideGhost(); wall.classList.remove('hot'); });
    return el;
  }

  /* ---------- resizing and moving ---------- */
  /* Drag any border or corner: the edge you grab follows the pointer, snapped to cells; tiles in the way move aside.
     Every step is computed from the layout at the start of the drag, so dragging back puts tiles back. */
  function startResize(e, it, el, hd, edge) {
    if (S.mode === 'free') { startResizeFree(e, it, el, hd, edge); return; }
    e.preventDefault(); e.stopPropagation();
    el.draggable = false; A.select(it.id); hd.classList.add('active');
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var m = A.metrics(), sx = e.clientX, sy = e.clientY, base = G.geoMap(S.items), pushed = false;
    var g0 = base[it.id];
    var useX = edge.indexOf('e') > -1 || edge.indexOf('w') > -1;
    var useY = edge.indexOf('n') > -1 || edge.indexOf('s') > -1;
    function geom(dx, dy) {
      var g = { col: g0.col, row: g0.row, w: g0.w, h: g0.h };
      if (edge.indexOf('e') > -1) g.w = g0.w + dx;
      if (edge.indexOf('w') > -1) { g.col = g0.col + dx; g.w = g0.w - dx; }
      if (edge.indexOf('s') > -1) g.h = g0.h + dy;
      if (edge.indexOf('n') > -1) { g.row = g0.row + dy; g.h = g0.h - dy; }
      return g;
    }
    function changed(geo) {
      return S.items.some(function (i) { var g = geo[i.id]; return g && (g.col !== i.col || g.row !== i.row || g.w !== i.w || g.h !== i.h); });
    }
    function mv(ev) {
      var dx = useX ? Math.round((ev.clientX - sx) / m.px) : 0;
      var dy = useY ? Math.round((ev.clientY - sy) / m.py) : 0;
      var res, n = 0;
      for (;;) {
        res = G.resolve(S.items, it.id, geom(dx, dy), base, S.cols, S.rows);
        if (res || n++ > 40) break;
        if (Math.abs(dx) >= Math.abs(dy)) dx += dx > 0 ? -1 : 1; else dy += dy > 0 ? -1 : 1;
      }
      if (res && changed(res)) {
        if (!pushed) { A.pushHistory(); pushed = true; }
        G.applyGeo(S.items, res); A.render(); A.refreshInspector();
      }
    }
    function up() {
      hd.classList.remove('active');
      hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
      el.draggable = S.mode !== 'free';
    }
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  }

  // Free layout: tiles are placed by the pixel, snap to the wall's and other tiles' edges (Alt turns snapping off).
  function startMoveFree(e, it, el) {
    var d = A.wallPx(), base = A.freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, moved = false, pushed = false, lines = F.snapLines(base, it.id, d);
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved) { if (Math.abs(dx) + Math.abs(dy) < 4) return; moved = true; el.classList.add('dragging'); }
      var x = clamp(g0.x + dx, 0, d.W - g0.w), y = clamp(g0.y + dy, 0, d.H - g0.h);
      if (!ev.altKey) {
        x = clamp(x + F.snapAxis(x, g0.w, lines.X), 0, d.W - g0.w);
        y = clamp(y + F.snapAxis(y, g0.h, lines.Y), 0, d.H - g0.h);
      }
      var res = F.resolve(idsNow(), it.id, { x: x, y: y, w: g0.w, h: g0.h }, base, d);
      if (res) { if (!pushed) { A.pushHistory(); pushed = true; } A.applyFreePx(res); A.render(); A.refreshInspector(); }
    }
    function up() {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      if (moved) { el._moved = true; setTimeout(function () { el._moved = false; }, 0); }
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function startResizeFree(e, it, el, hd, edge) {
    e.preventDefault(); e.stopPropagation();
    A.select(it.id); hd.classList.add('active');
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var d = A.wallPx(), base = A.freeGeoPx(), g0 = base[it.id], MIN = F.MIN;
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, pushed = false, lines = F.snapLines(base, it.id, d);
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy, g = { x: g0.x, y: g0.y, w: g0.w, h: g0.h }, snap = !ev.altKey, p;
      if (edge.indexOf('e') > -1) { p = g0.x + g0.w + dx; if (snap) p = F.snapPos(p, lines.X); p = clamp(p, g0.x + MIN, d.W); g.w = p - g0.x; }
      if (edge.indexOf('w') > -1) { p = g0.x + dx; if (snap) p = F.snapPos(p, lines.X); p = clamp(p, 0, g0.x + g0.w - MIN); g.x = p; g.w = g0.x + g0.w - p; }
      if (edge.indexOf('s') > -1) { p = g0.y + g0.h + dy; if (snap) p = F.snapPos(p, lines.Y); p = clamp(p, g0.y + MIN, d.H); g.h = p - g0.y; }
      if (edge.indexOf('n') > -1) { p = g0.y + dy; if (snap) p = F.snapPos(p, lines.Y); p = clamp(p, 0, g0.y + g0.h - MIN); g.y = p; g.h = g0.y + g0.h - p; }
      var res = F.resolve(idsNow(), it.id, g, base, d);
      if (res) { if (!pushed) { A.pushHistory(); pushed = true; } A.applyFreePx(res); A.render(); A.refreshInspector(); }
    }
    function up() {
      hd.classList.remove('active');
      hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
    }
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  }
  // Arrow keys in free layout: move by 1 px (Ctrl: 10), Shift resizes. Quick repeats count as one undo step.
  var lastNudge = { id: null, t: 0 };
  A.nudgeFree = function (it, dir, e) {
    var step = e.ctrlKey ? 10 : 1, d = A.wallPx(), base = A.freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var g = { x: g0.x, y: g0.y, w: g0.w, h: g0.h };
    if (e.shiftKey) { g.w = clamp(g.w + dir[0] * step, F.MIN, d.W - g.x); g.h = clamp(g.h + dir[1] * step, F.MIN, d.H - g.y); }
    else { g.x = clamp(g.x + dir[0] * step, 0, d.W - g.w); g.y = clamp(g.y + dir[1] * step, 0, d.H - g.h); }
    var res = F.resolve(idsNow(), it.id, g, base, d);
    if (!res) return;
    var now = Date.now();
    if (lastNudge.id !== it.id || now - lastNudge.t > 700) A.pushHistory();
    lastNudge = { id: it.id, t: now };
    A.applyFreePx(res); A.render(); A.refreshInspector();
  };

  /* ---------- keeping tiles in sync with the state ---------- */
  function syncPlayBtn(el) {
    var v = el._media, b = el._playBtn;
    if (!v || v.tagName !== 'VIDEO' || !b || b._paused === v.paused) return;
    b._paused = v.paused;
    b.innerHTML = v.paused ? ICON.play : ICON.pause; b.title = v.paused ? 'Play' : 'Pause';
  }
  function syncTile(it, el) {
    if (S.mode === 'free' && F.hasFree(it)) {
      var hg = S.gap / 2;
      el.style.gridColumn = ''; el.style.gridRow = '';
      el.style.left = 'calc(' + (it.fx * 100) + '% + ' + hg + 'px)'; el.style.top = 'calc(' + (it.fy * 100) + '% + ' + hg + 'px)';
      el.style.width = 'calc(' + (it.fw * 100) + '% - ' + S.gap + 'px)'; el.style.height = 'calc(' + (it.fh * 100) + '% - ' + S.gap + 'px)';
    } else {
      el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.height = '';
      el.style.gridColumn = (it.col + 1) + ' / span ' + it.w;
      el.style.gridRow = (it.row + 1) + ' / span ' + it.h;
    }
    el.draggable = S.mode !== 'free';
    el.classList.toggle('sel', S.sel === it.id);
    el.classList.toggle('pinned', !!it.pinned);
    var m = el._media;
    if (!it.missing) m.style.objectFit = it.fit;
    if (m.tagName === 'VIDEO') { m.muted = it.muted; m.loop = it.loop; }
    // The buttons only change when these do, so leave their markup alone otherwise (render runs on every drag step).
    var ui = [it.muted, it.fit, !!it.pinned, it.loop].join('|');
    if (el._ui !== ui) {
      el._ui = ui;
      var mb = el.querySelector('[data-act="mute"]');
      if (mb) { mb.innerHTML = it.muted ? ICON.mute : ICON.vol; mb.title = it.muted ? 'Turn sound on' : 'Mute'; }
      var fb = el.querySelector('[data-act="fit"]');
      if (fb) fb.title = it.fit === 'cover' ? 'Show whole frame' : 'Fill the cell';
      var pb = el.querySelector('[data-act="pin"]');
      if (pb) {
        pb.classList.toggle('on', !!it.pinned);
        pb.title = it.pinned ? 'Pinned. Click to let the playlist continue' : 'Pin: keep this on the tile';
        pb.setAttribute('aria-pressed', String(!!it.pinned));
      }
      var lb = el.querySelector('[data-act="loop"]');
      if (lb) {
        lb.classList.toggle('on', it.loop);
        lb.title = it.loop ? 'Looping. Click to play once' : 'Plays once. Click to loop';
        lb.setAttribute('aria-pressed', String(it.loop));
      }
    }
    syncPlayBtn(el);
  }

  /* ---------- drop preview ---------- */
  var ghost = document.createElement('div');
  ghost.className = 'ghost'; ghost.hidden = true;
  ghost.innerHTML = '<span></span>';
  wall.appendChild(ghost);
  A.showGhost = function (g, ok, label) {
    ghost.style.gridColumn = (g.col + 1) + ' / span ' + g.w;
    ghost.style.gridRow = (g.row + 1) + ' / span ' + g.h;
    ghost.classList.toggle('bad', !ok);
    ghost.firstChild.textContent = label || '';
    ghost.hidden = false;
  };
  A.hideGhost = function () { ghost.hidden = true; };

  /* ---------- render ---------- */
  // Empty cells get a button each. They are only rebuilt when the free cells change, not on every render.
  var slotSig = '';
  function renderSlots() {
    var m = S.mode === 'free' ? null : G.occupancy(S.items, S.cols, S.rows);
    var sig = m ? S.cols + 'x' + S.rows + ':' + m.map(function (r) { return r.map(Number).join(''); }).join('/') : 'free';
    if (sig === slotSig) return;
    slotSig = sig;
    Array.prototype.slice.call(wall.querySelectorAll('.slot')).forEach(function (s) { s.remove(); });
    if (!m) return;
    for (var r = 0; r < S.rows; r++) for (var c = 0; c < S.cols; c++) {
      if (m[r][c]) continue;
      var b = document.createElement('button');
      b.className = 'slot';
      b.style.gridColumn = String(c + 1); b.style.gridRow = String(r + 1);
      b.setAttribute('aria-label', 'Empty cell, column ' + (c + 1) + ' row ' + (r + 1) + '. Choose files.');
      b.innerHTML = '<span>C' + (c + 1) + ' · R' + (r + 1) + '</span><span class="hint">Drop or click</span>';
      b.dataset.col = c; b.dataset.row = r;
      wall.appendChild(b);
    }
  }
  A.render = function () {
    wall.style.setProperty('--cols', S.cols);
    wall.style.setProperty('--rows', S.rows);
    wall.style.setProperty('--gap', S.gap + 'px');
    wall.classList.toggle('free', S.mode === 'free');
    var ar = { 'fill': 0, '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 }[S.aspect];
    if (ar) { wall.classList.add('ratio'); wall.style.setProperty('--ratio', (S.cols * ar / S.rows).toFixed(4)); }
    else { wall.classList.remove('ratio'); wall.style.removeProperty('--ratio'); }

    var ids = {};
    S.items.forEach(function (i) { ids[i.id] = 1; });
    A.tileEls.forEach(function (el, id) { if (!ids[id]) { el.remove(); A.tileEls.delete(id); } });
    S.items.forEach(function (it) {
      var el = A.tileEls.get(it.id);
      if (!el) { el = createTile(it); A.tileEls.set(it.id, el); }
      syncTile(it, el);
      if (el.parentNode !== wall) wall.appendChild(el);
    });
    renderSlots();

    var gridOnly = S.mode === 'free';
    ['colsDec', 'colsInc', 'rowsDec', 'rowsInc', 'cols', 'rows', 'arrangeBtn', 'layoutBtn', 'fitMediaBtn'].forEach(function (id) { $('#' + id).disabled = gridOnly; });
    $('#modeSel').value = S.mode;
    var count = S.items.length + (S.items.length === 1 ? ' item' : ' items');
    $('#readout').textContent = (A.winId > 1 ? 'Wall ' + A.winId + ' · ' : '') +
      (gridOnly ? 'Free layout · ' + count : S.cols + ' × ' + S.rows + ' · ' + count + ' on ' + (S.cols * S.rows) + ' cells') +
      (S.presetName ? ' · ' + S.presetName : '');
    $('#cols').value = S.cols; $('#rows').value = S.rows;
    $('#gap').value = S.gap; $('#gapval').textContent = S.gap + ' px';
    $('#aspect').value = S.aspect; $('#fit').value = S.fit;
    $('#display').value = S.display == null ? '' : String(S.display);
    A.updateTransport();
    A.updateHistoryButtons();
    A.scheduleSession();
    A.syncWatches();
  };

  /* ---------- play / mute / loop buttons in the bar ---------- */
  A.hasImagePlaylist = function () {
    return S.items.some(function (i) { return i.pl && i.kind === 'image' && !i.missing && S.playlists[i.pl]; });
  };
  A.videos = function () {
    var vids = [];
    A.tileEls.forEach(function (el) { var v = el._media; if (v && v.tagName === 'VIDEO') vids.push(v); });
    return vids;
  };
  A.updateTransport = function () {
    var vids = A.videos(), imgPl = A.hasImagePlaylist();
    $('#playAll').disabled = !(vids.length > 0 || imgPl); $('#muteAll').disabled = !vids.length;
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing; });
    var vl = vi.filter(function (i) { return !i.pl; });
    var nl = vl.filter(function (i) { return i.loop; }).length;
    $('#loopAll').disabled = !vl.length;
    $('#loopAll').textContent = !vl.length || nl === vl.length ? 'Loop: on' : (nl ? 'Loop: mixed' : 'Loop: off');
    $('#playAll').textContent = (vids.some(function (v) { return !v.paused; }) || (imgPl && !A.wallPaused)) ? 'Pause all' : 'Play all';
    $('#muteAll').textContent = vi.some(function (i) { return !i.muted; }) ? 'Mute all' : 'Unmute all';
  };
})(window.MW.app);
