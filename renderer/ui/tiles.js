// Tiles on the wall: building them, keeping them in sync with the state, moving and resizing them, and render().
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free, V = MW.view, P = MW.play;
  var S = A.S, wall = A.wall, $ = A.$, ICON = A.ICON, clamp = U.clamp;

  function idsNow() { return S.items.map(function (i) { return i.id; }); }
  A.hasMedia = function (it) { return !it.missing && it.kind !== 'empty'; };

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
    if (it.kind === 'empty') {
      // A frame without media yet: drop media on it, or choose some.
      media = document.createElement('div');
      media.className = 'media empty-ph';
      media.innerHTML = '<span class="ic" aria-hidden="true">' + ICON.tile + '</span><span>Empty tile</span><span class="sub">Drop media here, or choose</span>' +
        '<span class="phbtns"><button class="btn" type="button" data-act="choose" title="One file for this tile">File…</button>' +
        '<button class="btn" type="button" data-act="chooseFolder" title="A folder whose files this tile plays in turn">Folder…</button></span>';
    } else if (it.missing) {
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
      watchVideo(it, el, media);
    } else {
      media = document.createElement('img');
      media.className = 'media'; media.alt = it.name;
      media.addEventListener('error', function () { el.classList.add('broken'); });
      media.src = it.url;
    }
    media.draggable = false;
    if (it._fitOnLoad && A.hasMedia(it)) media.addEventListener(media.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', function () { A.fitNewTile(it); }, { once: true });
    if (it.pl && !it.missing) {
      media.addEventListener('error', function () { if (!el._dead) A.failAdvance(it); });
      media.addEventListener('load', function () { var pp = S.playlists[it.pl]; if (pp) pp.bad = 0; });
    }
    // The media sits in a view that clips it, so it can be moved and zoomed inside the tile.
    var view = document.createElement('div');
    view.className = 'mview';
    view.appendChild(media);
    el.appendChild(view);
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
      (it.pl ? '' : '<button class="hb" data-act="loop" aria-label="Loop on or off">' + ICON.loop + '</button>') +
      '<button class="hb" data-act="fit" aria-label="Fit">' + ICON.fit + '</button>' +
      '<button class="hb danger" data-act="remove" aria-label="Remove from wall">' + ICON.trash + '</button>';
    hud.appendChild(nm); hud.appendChild(bt);
    el.appendChild(hud);
    if (media.tagName === 'VIDEO') buildBar(it, el, media);

    // Shown while the media is being repositioned (see A.startRepos).
    var rbar = document.createElement('div');
    rbar.className = 'repobar';
    rbar.innerHTML = '<span>Drag to move · scroll to zoom</span><button class="hb wide" type="button" data-act="viewReset">Reset</button><button class="hb wide on" type="button" data-act="reposDone">Done</button>';
    el.appendChild(rbar);

    if (it.sample) { var bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'SAMPLE'; el.appendChild(bd); }
    // Pinned playlist tiles get a small pin in the corner (selection has its own ring, so the two never look alike).
    if (it.pl) { var pm = document.createElement('span'); pm.className = 'pinmark'; pm.setAttribute('aria-hidden', 'true'); pm.innerHTML = ICON.pin; el.appendChild(pm); }

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
      if (e.target !== el || e.key !== 'Enter') return;   // Space plays and pauses (see controls.js)
      e.preventDefault();
      if (e.altKey) { e.stopPropagation(); A.openProps(it); return; }   // Alt+Enter: this tile's Properties
      A.select(S.sel === it.id ? null : it.id);
    });
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      if (A.reposId === it.id) { startPan(e, it, el); return; }
      if (S.mode === 'free') startMoveFree(e, it, el);
    });
    // The scroll wheel zooms the media of the selected tile (or the one being repositioned).
    el.addEventListener('wheel', function (e) {
      if (!A.hasMedia(it) || document.body.classList.contains('clean') || (S.sel !== it.id && A.reposId !== it.id) || e.target.closest('.vbar')) return;
      e.preventDefault();
      A.zoomMedia(it, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    el.addEventListener('click', function (e) {
      if (el._moved) { el._moved = false; return; }
      var b = e.target.closest('[data-act]');
      if (!b) { if (A.reposId !== it.id) A.select(S.sel === it.id ? null : it.id); return; }
      e.stopPropagation();
      var act = b.dataset.act;
      if (act === 'remove') { A.removeItem(it.id); return; }
      if (act === 'choose') { A.select(it.id); A.chooseMedia(it); return; }
      if (act === 'chooseFolder') { A.select(it.id); A.ownFolder(it); return; }
      if (act === 'reposDone') { A.endRepos(); return; }
      if (act === 'viewReset') { A.resetView(it); return; }
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
    // Double-click toggles: this tile full screen, and back.
    el.addEventListener('dblclick', function (e) {
      if (e.target.closest('[data-act]') || e.target.closest('.rz')) return;
      A.setSolo(A.soloId == null ? it.id : null);
    });
    el.addEventListener('dragstart', function (e) {
      if (A.reposId === it.id) { e.preventDefault(); return; }
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

  /* ---------- video playback: the control bar, volume, speed, and a part that loops ---------- */
  // A bar along the bottom of a video tile: play, time, a timeline that shows the looped part, mute, volume, speed.
  function buildBar(it, el, media) {
    var bar = document.createElement('div');
    bar.className = 'vbar';
    bar.innerHTML =
      '<button class="hb" type="button" data-act="play" aria-label="Play or pause"></button>' +
      '<span class="vtime">0:00</span>' +
      '<span class="vtrack"><span class="vloop" hidden></span><input class="vseek" type="range" min="0" max="1000" step="1" value="0" aria-label="Position in the video"></span>' +
      '<button class="hb" type="button" data-act="mute" aria-label="Sound on or off"></button>' +
      '<input class="vvol" type="range" min="0" max="100" step="1" aria-label="Volume">' +
      '<select class="vspeed" aria-label="Speed">' + P.SPEEDS.map(function (s) { return '<option value="' + s + '">' + s + '×</option>'; }).join('') + '</select>';
    el.appendChild(bar);
    el._playBtn = bar.querySelector('[data-act="play"]');
    var seek = bar.querySelector('.vseek'), vol = bar.querySelector('.vvol'), speed = bar.querySelector('.vspeed');
    var time = bar.querySelector('.vtime'), loopEl = bar.querySelector('.vloop'), dragging = false;
    function dur() { return isFinite(media.duration) ? media.duration : 0; }
    el._syncBar = function () {
      var d = dur();
      time.textContent = P.fmtTime(media.currentTime) + (d ? ' / ' + P.fmtTime(d) : '');
      if (!dragging && d) seek.value = Math.round(media.currentTime / d * 1000);
      var loop = d > 0 && !it.pl && P.hasLoop(it);
      loopEl.hidden = !loop;
      if (loop) {
        var a = it.loopA || 0, b = it.loopB == null ? d : it.loopB;
        loopEl.style.left = (a / d * 100) + '%'; loopEl.style.width = ((b - a) / d * 100) + '%';
      }
      if (document.activeElement !== vol) vol.value = Math.round((it.vol == null ? 1 : it.vol) * 100);
      if (document.activeElement !== speed) speed.value = String(it.speed || 1);
    };
    ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'].forEach(function (ev) { media.addEventListener(ev, el._syncBar); });
    seek.addEventListener('pointerdown', function () { dragging = true; });
    seek.addEventListener('input', function () { var d = dur(); if (d) media.currentTime = seek.value / 1000 * d; });
    seek.addEventListener('change', function () { dragging = false; });
    vol.addEventListener('input', function () { A.setVolume(it, vol.value / 100); });
    speed.addEventListener('change', function () { A.setSpeed(it, parseFloat(speed.value)); });
    // The bar is for playing, not for moving or selecting the tile.
    bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); el.draggable = false; });
    bar.addEventListener('pointerup', function () { dragging = false; el.draggable = S.mode !== 'free' && A.reposId !== it.id; });
    bar.addEventListener('click', function (e) { if (!e.target.closest('[data-act]')) e.stopPropagation(); });
    bar.addEventListener('dblclick', function (e) { e.stopPropagation(); });
  }
  // Keeps a video inside its loop part, and starts it there.
  function watchVideo(it, el, media) {
    function check(t) {
      if (it.pl) return;
      var to = P.loopTarget(t, it.loopA, it.loopB);
      if (to != null) media.currentTime = to;
    }
    media.addEventListener('timeupdate', function () { check(media.currentTime); });
    // Frame by frame where the browser can, so the jump back lands on time.
    if (media.requestVideoFrameCallback) media.requestVideoFrameCallback(function cb(now, meta) {
      if (!media.isConnected) return;
      check(meta.mediaTime);
      media.requestVideoFrameCallback(cb);
    });
    media.addEventListener('ended', function () {
      if (!it.pl && P.hasLoop(it)) { media.currentTime = it.loopA || 0; media.play().catch(function () {}); }
    });
    media.addEventListener('loadedmetadata', function () {
      if (!isFinite(media.duration)) {
        // Some files (recorded in a browser, for one) only learn their length at the end: look there once, then come back.
        var back = function () {
          if (!isFinite(media.duration)) return;
          media.removeEventListener('durationchange', back);
          media.currentTime = it.pl ? 0 : (it.loopA || 0);
        };
        media.addEventListener('durationchange', back);
        media.currentTime = 1e101;
      } else if (!it.pl && it.loopA) media.currentTime = it.loopA;
    });
  }
  A.videoOf = function (it) {
    var el = A.tileEls.get(it.id), m = el && el._media;
    return m && m.tagName === 'VIDEO' ? m : null;
  };
  // Volume, speed and the loop part belong to the tile: they stay when a playlist moves on (the loop part does not).
  A.setVolume = function (it, v) {
    it.vol = clamp(+v, 0, 1);
    if (it.vol > 0 && it.muted) it.muted = false;   // turning the volume up means you want to hear it
    A.render(); A.refreshInspector(); A.updateTransport();
  };
  A.setSpeed = function (it, s) {
    it.speed = clamp(+s || 1, 0.25, 4);
    A.render(); A.refreshInspector();
  };
  // a, b in seconds (b null: to the end); both null clears the part. False (and a message) when the part makes no sense.
  A.setLoop = function (it, a, b) {
    var media = A.videoOf(it);
    if (a == null && b == null) { it.loopA = null; it.loopB = null; }
    else {
      var c = P.cleanLoop(a, b, media ? media.duration : NaN);
      if (!c) {
        if ((a || 0) === 0 && b == null) { it.loopA = null; it.loopB = null; }
        else { A.toast('The loop needs its end at least a tenth of a second after its start.'); return false; }
      } else {
        it.loopA = c.a; it.loopB = c.b;
        if (media && (media.currentTime < c.a || (c.b != null && media.currentTime >= c.b))) media.currentTime = c.a;
      }
    }
    A.render(); A.refreshInspector();
    return true;
  };

  /* ---------- resizing and moving ---------- */
  /* Drag any border or corner: the edge you grab follows the pointer, snapped to cells; tiles in the way move aside,
     and empty tiles give way when there is no other room. Every step is computed from the layout at the start of the
     drag, so dragging back puts tiles back. */
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
    function changed(r) {
      return S.items.some(function (i) {
        var g = r.geo[i.id];
        return (g && (g.col !== i.col || g.row !== i.row || g.w !== i.w || g.h !== i.h)) || !!i._gone !== (r.removed.indexOf(i.id) > -1);
      });
    }
    function mv(ev) {
      var dx = useX ? Math.round((ev.clientX - sx) / m.px) : 0;
      var dy = useY ? Math.round((ev.clientY - sy) / m.py) : 0;
      var res, n = 0;
      for (;;) {
        res = G.resolveYield(S.items, it.id, geom(dx, dy), base, S.cols, S.rows);
        if (res || n++ > 40) break;
        if (Math.abs(dx) >= Math.abs(dy)) dx += dx > 0 ? -1 : 1; else dy += dy > 0 ? -1 : 1;
      }
      if (res && changed(res)) {
        if (!pushed) { A.pushHistory(); pushed = true; }
        A.previewYield(res); A.render(); A.refreshInspector();
      }
    }
    function up() {
      hd.classList.remove('active');
      hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
      el.draggable = S.mode !== 'free';
      A.dropGone(); A.render(); A.refreshInspector();
    }
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  }

  /* Free layout, moving: the tile always follows the pointer (snapping to the wall's and other tiles' edges; Alt turns
     that off) and the other tiles show where they will go. They only move away on their own side, never jumping over
     the tile. Where they cannot make room, they stay, and dropping on one swaps the two; anywhere else the tile goes
     back to where it was. */
  function startMoveFree(e, it, el) {
    var d = A.wallPx(), base = A.freeGeoPx(), g0 = base[it.id];
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, moved = false, lines = F.snapLines(base, it.id, d), plan = null;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    // The tile (other than this one) whose place contains the pointer, by the layout at the start.
    function tileUnder(ev) {
      var r = wall.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      return Object.keys(base).filter(function (k) {
        var b = base[k];
        return String(k) !== String(it.id) && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;
      })[0];
    }
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true; el.classList.add('dragging'); A.pushHistory();
      }
      var x = clamp(g0.x + dx, 0, d.W - g0.w), y = clamp(g0.y + dy, 0, d.H - g0.h);
      if (!ev.altKey) {
        x = clamp(x + F.snapAxis(x, g0.w, lines.X), 0, d.W - g0.w);
        y = clamp(y + F.snapAxis(y, g0.h, lines.Y), 0, d.H - g0.h);
      }
      var want = { x: x, y: y, w: g0.w, h: g0.h };
      var res = F.resolve(idsNow(), it.id, want, base, d, { keepSide: true }), land = 'move', other;
      if (!res && (other = tileUnder(ev))) {
        res = Object.assign({}, base); res[other] = base[it.id]; res[it.id] = base[other]; land = 'swap';
      }
      if (!res) { res = base; land = 'back'; }
      plan = { land: land, final: res };
      var shown = Object.assign({}, res); shown[it.id] = want;   // this tile under the pointer, the rest where they will go
      A.applyFreePx(shown); A.render();
      el.classList.toggle('nodrop', land === 'back');
      if (land === 'swap') A.showGhostPx(res[it.id], true, 'Swap'); else A.hideGhost();
    }
    function up() {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging', 'nodrop');
      A.hideGhost();
      if (!moved) return;
      el._moved = true; setTimeout(function () { el._moved = false; }, 0);
      A.applyFreePx(plan.final); A.render(); A.refreshInspector();
      if (plan.land === 'back') { A.dropHistory(); A.toast('No room there. Drop on another tile to swap the two.'); }
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  /* Free layout, resizing: the sides that move out push the tiles in their way. Those tiles shrink evenly, or (Settings
     › General) only the ones that reach the wall get squeezed. When even that is not enough, the side stops as far as
     it can go. */
  function startResizeFree(e, it, el, hd, edge) {
    e.preventDefault(); e.stopPropagation();
    A.select(it.id); hd.classList.add('active');
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var d = A.wallPx(), base = A.freeGeoPx(), g0 = base[it.id], MIN = F.MIN;
    if (!g0) return;
    var sx = e.clientX, sy = e.clientY, pushed = false, lines = F.snapLines(base, it.id, d);
    function lerp(t, g) { return { x: g0.x + (g.x - g0.x) * t, y: g0.y + (g.y - g0.y) * t, w: g0.w + (g.w - g0.w) * t, h: g0.h + (g.h - g0.h) * t }; }
    function mv(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy, g = { x: g0.x, y: g0.y, w: g0.w, h: g0.h }, snap = !ev.altKey, p;
      if (edge.indexOf('e') > -1) { p = g0.x + g0.w + dx; if (snap) p = F.snapPos(p, lines.X); p = clamp(p, g0.x + MIN, d.W); g.w = p - g0.x; }
      if (edge.indexOf('w') > -1) { p = g0.x + dx; if (snap) p = F.snapPos(p, lines.X); p = clamp(p, 0, g0.x + g0.w - MIN); g.x = p; g.w = g0.x + g0.w - p; }
      if (edge.indexOf('s') > -1) { p = g0.y + g0.h + dy; if (snap) p = F.snapPos(p, lines.Y); p = clamp(p, g0.y + MIN, d.H); g.h = p - g0.y; }
      if (edge.indexOf('n') > -1) { p = g0.y + dy; if (snap) p = F.snapPos(p, lines.Y); p = clamp(p, 0, g0.y + g0.h - MIN); g.y = p; g.h = g0.y + g0.h - p; }
      if (ev.shiftKey) g = F.keepRatio(g0, g, edge, S.gap);   // Shift keeps the tile's proportions
      var ids = idsNow(), res = F.pushResize(ids, it.id, g0, g, base, d, S.resizeMode);
      if (!res) {                                    // as far towards the pointer as it goes
        var lo = 0, hi = 1;
        for (var i = 0; i < 10; i++) {
          var mid = (lo + hi) / 2, r = F.pushResize(ids, it.id, g0, lerp(mid, g), base, d, S.resizeMode);
          if (r) { lo = mid; res = r; } else hi = mid;
        }
      }
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
    var res = F.resolve(idsNow(), it.id, g, base, d, { keepSide: true });
    if (!res) return;
    var now = Date.now();
    if (lastNudge.id !== it.id || now - lastNudge.t > 700) A.pushHistory();
    lastNudge = { id: it.id, t: now };
    A.applyFreePx(res); A.render(); A.refreshInspector();
  };

  /* ---------- the media inside a tile: reposition (drag) and zoom (scroll wheel) ---------- */
  A.reposId = null;
  function viewGeom(it, el) {
    var r = el.getBoundingClientRect(), m = el._media;
    var a = m.tagName === 'VIDEO' ? m.videoWidth / m.videoHeight : m.naturalWidth / m.naturalHeight;
    return { r: r, c: V.content(r.width, r.height, a, it.fit) };
  }
  function setView(it, v) {
    var o = V.of(it);
    if (o.mx === v.mx && o.my === v.my && o.zoom === v.zoom) return false;
    it.mx = v.mx; it.my = v.my; it.zoom = v.zoom;
    return true;
  }
  A.startRepos = function (it) {
    if (!A.hasMedia(it)) return;
    A.select(it.id);
    A.reposId = it.id;
    A.render();
    A.toast('Drag the media to move it inside the tile, and scroll to zoom. Enter or Esc when done.');
  };
  A.endRepos = function () {
    if (A.reposId == null) return;
    A.reposId = null;
    A.render();
  };
  A.resetView = function (it) {
    if (V.isDefault(it)) return;
    A.pushHistory();
    it.mx = 0.5; it.my = 0.5; it.zoom = 1;
    A.render(); A.refreshInspector();
  };
  // Zoom by `factor` around the screen point (cx, cy). Quick wheel turns count as one undo step.
  var lastZoom = { id: null, t: 0 };
  A.zoomMedia = function (it, factor, cx, cy) {
    var el = A.tileEls.get(it.id);
    if (!el || !A.hasMedia(it)) return;
    var g = viewGeom(it, el), v = V.of(it);
    var nv = V.zoomAt(v, g.r.width, g.r.height, g.c, v.zoom * factor, cx - g.r.left, cy - g.r.top);
    if (v.zoom === nv.zoom && v.mx === nv.mx && v.my === nv.my) return;
    var now = Date.now();
    if (lastZoom.id !== it.id || now - lastZoom.t > 700) A.pushHistory();
    lastZoom = { id: it.id, t: now };
    setView(it, nv); A.render(); A.refreshInspector();
  };
  function startPan(e, it, el) {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var sx = e.clientX, sy = e.clientY, v0 = V.of(it), g = viewGeom(it, el), pushed = false;
    el.classList.add('panning');
    function mv(ev) {
      var nv = V.pan(v0, g.r.width, g.r.height, g.c, ev.clientX - sx, ev.clientY - sy);
      if (!pushed && (nv.mx !== v0.mx || nv.my !== v0.my)) { A.pushHistory(); pushed = true; }
      if (setView(it, nv)) A.render();
    }
    function up() {
      el.classList.remove('panning');
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el._moved = true; setTimeout(function () { el._moved = false; }, 0);
      A.refreshInspector();
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // Reposition mode ends when you press elsewhere (the Properties card, with its zoom slider, does not count).
  document.addEventListener('pointerdown', function (e) {
    if (A.reposId == null) return;
    var el = A.tileEls.get(A.reposId);
    if (!el || (!el.contains(e.target) && !e.target.closest('#inspector'))) A.endRepos();
  }, true);

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
    el.draggable = S.mode !== 'free' && A.reposId !== it.id;
    el.classList.toggle('sel', S.sel === it.id);
    el.classList.toggle('pinned', !!it.pinned);
    el.classList.toggle('repos', A.reposId === it.id);
    el.classList.toggle('gone', !!it._gone);
    el.classList.toggle('solo', A.soloId === it.id);
    var m = el._media;
    if (A.hasMedia(it)) {
      var vc = V.css(it);
      m.style.objectFit = it.fit;
      m.style.objectPosition = vc.objectPosition; m.style.transformOrigin = vc.transformOrigin; m.style.transform = vc.transform;
    }
    if (m.tagName === 'VIDEO') {
      var rate = it.speed || 1;
      // One tile full screen: it is heard and the others are quiet (Settings › General), until full screen ends.
      m.muted = A.soloId != null && S.soloSound ? it.id !== A.soloId : it.muted;
      m.volume = it.vol == null ? 1 : it.vol;
      if (m.playbackRate !== rate) { m.defaultPlaybackRate = rate; m.playbackRate = rate; }
      m.loop = it.loop && (it.pl || !P.hasLoop(it));   // a loop part does its own looping
      if (el._syncBar) el._syncBar();
    }
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
    ghost.style.left = ghost.style.top = ghost.style.width = ghost.style.height = '';
    ghost.style.gridColumn = (g.col + 1) + ' / span ' + g.w;
    ghost.style.gridRow = (g.row + 1) + ' / span ' + g.h;
    ghost.classList.toggle('bad', !ok);
    ghost.firstChild.textContent = label || '';
    ghost.hidden = false;
  };
  // The same in Free layout, for a box in pixels of the wall.
  A.showGhostPx = function (b, ok, label) {
    var hg = S.gap / 2;
    ghost.style.gridColumn = ghost.style.gridRow = '';
    ghost.style.left = (b.x + hg) + 'px'; ghost.style.top = (b.y + hg) + 'px';
    ghost.style.width = Math.max(0, b.w - S.gap) + 'px'; ghost.style.height = Math.max(0, b.h - S.gap) + 'px';
    ghost.classList.toggle('bad', !ok);
    ghost.firstChild.textContent = label || '';
    ghost.hidden = false;
  };
  A.hideGhost = function () { ghost.hidden = true; };

  /* ---------- one tile full screen ---------- */
  // The wall itself goes full screen and shows only that tile (CSS: .wall:fullscreen), so a playlist tile can move on
  // to its next file, which is a new element, without leaving full screen. id null ends it.
  A.soloId = null;
  A.setSolo = function (id) {
    if (id == null) {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      return;
    }
    A.soloId = id; A.render();
    var pr = wall.requestFullscreen();
    if (pr && pr.catch) pr.catch(function () { A.soloId = null; A.render(); });
  };
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && A.soloId != null) { A.soloId = null; A.render(); }
  });

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
    if (A.soloId != null && !ids[A.soloId]) A.setSolo(null);   // the full-screen tile was removed
    S.items.forEach(function (it) {
      var el = A.tileEls.get(it.id);
      if (!el) { el = createTile(it); A.tileEls.set(it.id, el); }
      syncTile(it, el);
      if (el.parentNode !== wall) wall.appendChild(el);
    });
    renderSlots();

    var gridOnly = S.mode === 'free';
    ['colsDec', 'colsInc', 'rowsDec', 'rowsInc', 'cols', 'rows', 'arrangeBtn', 'layoutBtn'].forEach(function (id) { $('#' + id).disabled = gridOnly; });
    Array.prototype.forEach.call($('#modeSeg').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)); });
    $('#gridLabel').textContent = gridOnly ? 'Free' : S.cols + ' × ' + S.rows;
    $('#gridNote').hidden = !gridOnly;
    $('#fitHint').textContent = gridOnly ? 'Shrink every tile to its media’s exact shape' : 'Reshape tiles so their media fills them';
    $('#arrangeHint').textContent = gridOnly ? 'Only when tiles snap to the grid' : 'Pack all tiles from the top left';
    $('#layoutHint').textContent = gridOnly ? 'Only when tiles snap to the grid' : 'Move the tiles into ready-made frames';
    // The grid size shows on its own button, so the line under the title only counts tiles (and names the saved wall).
    var count = S.items.length + (S.items.length === 1 ? ' tile' : ' tiles');
    $('#readout').textContent = (A.winId > 1 ? 'Wall ' + A.winId + ' · ' : '') +
      (gridOnly ? count + ', placed freely' : count + ' on ' + (S.cols * S.rows) + ' cells') +
      (S.presetName ? ' · ' + S.presetName : '');
    $('#readout').title = $('#readout').textContent;
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
  // Icon buttons: the label says what a click does. The play icon shows that too (play or pause, as players do);
  // the speaker shows how the sound is now, like the speaker on each video tile; loop shows on / mixed / off as pressed.
  function iconBtn(b, icon, label, title) {
    if (b._icon !== icon) { b._icon = icon; b.innerHTML = '<span class="ic" aria-hidden="true">' + ICON[icon] + '</span>'; }
    b.setAttribute('aria-label', label); b.title = title || label;
  }
  A.updateTransport = function () {
    var vids = A.videos(), imgPl = A.hasImagePlaylist();
    $('#playAll').disabled = !(vids.length > 0 || imgPl); $('#muteAll').disabled = !vids.length;
    var vi = S.items.filter(function (i) { return i.kind === 'video' && !i.missing; });
    var vl = vi.filter(function (i) { return !i.pl; });
    var nl = vl.filter(function (i) { return i.loop; }).length;
    var loop = !vl.length || nl === vl.length ? 'on' : (nl ? 'mixed' : 'off');
    $('#loopAll').disabled = !vl.length;
    $('#loopAll').classList.toggle('on', loop === 'on' && vl.length > 0);
    $('#loopAll').setAttribute('aria-pressed', loop === 'mixed' ? 'mixed' : String(loop === 'on'));
    iconBtn($('#loopAll'), 'loop', 'Loop all videos', 'Loop: ' + loop + '. Click to ' + (loop === 'on' ? 'play every video once' : 'loop every video'));
    var playing = vids.some(function (v) { return !v.paused; }) || (imgPl && !A.wallPaused);
    iconBtn($('#playAll'), playing ? 'pause' : 'play', playing ? 'Pause all' : 'Play all');
    var loud = vi.some(function (i) { return !i.muted; });
    iconBtn($('#muteAll'), loud ? 'vol' : 'mute', loud ? 'Mute all' : 'Unmute all',
      loud ? 'Sound is on. Click to mute every video' : 'Every video is muted. Click to turn their sound on');
  };
})(window.MW.app);
