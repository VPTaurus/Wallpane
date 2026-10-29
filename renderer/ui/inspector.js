// Selection and the side panel (inspector) that shows and edits the selected tile.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free, PL = MW.pl;
  var S = A.S, $ = A.$, inspector = A.inspector, clamp = U.clamp, esc = U.esc;

  A.select = function (id) {
    if (S.sel === id) return;
    if (A.reposId != null && A.reposId !== id) A.endRepos();
    S.sel = id;
    A.tileEls.forEach(function (el, k) { el.classList.toggle('sel', k === id); });
    A.refreshInspector();
  };
  A.selected = function () { return S.sel == null ? null : A.itemById(S.sel); };

  function field(id, label, val, max) {
    return '<label class="fld" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="number" min="1" max="' + max + '" value="' + val + '" inputmode="numeric"></label>';
  }
  function freeValues(it) {
    var g = A.freeGeoPx()[it.id] || { x: 0, y: 0, w: 0, h: 0 };
    return { fX: g.x, fY: g.y, fW: g.w, fH: g.h };
  }
  function freeFields(it) {
    var v = freeValues(it);
    function f(id, label) { return '<label class="fld" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="number" step="1" value="' + Math.round(v[id]) + '" inputmode="numeric"></label>'; }
    return f('fX', 'X') + f('fY', 'Y') + f('fW', 'Width') + f('fH', 'Height');
  }
  function seg(id, a, b, aOn) {
    return '<div class="seg" id="' + id + '"><button data-v="a" aria-pressed="' + aOn + '">' + a + '</button><button data-v="b" aria-pressed="' + (!aOn) + '">' + b + '</button></div>';
  }
  function selectFld(id, label, opts, val) {
    if (!opts.some(function (o) { return o[0] === val; })) opts = opts.concat([[val, val]]);
    return '<label class="fld" for="' + id + '"><span>' + label + '</span><select id="' + id + '">' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function numFld(id, label, val, min, max, title) {
    return '<label class="fld" for="' + id + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><span>' + label + '</span>' +
      '<input id="' + id + '" type="number" min="' + min + '" max="' + max + '" value="' + val + '" inputmode="numeric"></label>';
  }

  /* ---------- a tile that plays a folder: that playlist's own options ---------- */
  function playersOf(it) { return S.items.filter(function (i) { return i.pl === it.pl; }).length; }
  function playlistSec(it) {
    var p = S.playlists[it.pl], users = playersOf(it);
    return '<div class="sec" id="plSec"><span class="lab">Playlist</span>' +
      '<div class="plhead"><span class="ic" aria-hidden="true">' + A.ICON.folder + '</span><div><b>' + esc(p.name) + '</b><small>' +
      p.files.length + (p.files.length === 1 ? ' file' : ' files') + (p.truncated ? ', the first ' + PL.MAX_FILES.toLocaleString('en-US') + ' in the folder' : '') + '</small></div></div>' +
      (users > 1 ? '<p class="note">' + users + ' tiles play this folder. Changes here apply to all of them.</p>' : '') +
      seg('sPin', 'Rotating', 'Pinned', !it.pinned) +
      '<div class="plgrid" id="plOpts">' +
      selectFld('pOrder', 'Order', [['name', 'Name order'], ['shuffle', 'Shuffle']], p.shuffle ? 'shuffle' : 'name') +
      numFld('pSecs', 'Image seconds', p.secs, 2, 300) +
      selectFld('pGif', 'GIFs stay', [['secs', 'Image time'], ['once', 'One full play']], p.gifOnce ? 'once' : 'secs') +
      selectFld('pFrom', 'Videos start', [['start', 'Beginning'], ['random', 'Random point']], p.randomStart ? 'random' : 'start') +
      selectFld('pFade', 'Crossfade', [['0', 'Cut'], ['0.5', '0.5 s'], ['1', '1 s'], ['2', '2 s']], String(p.fade || 0)) +
      numFld('pMax', 'Max clip seconds', p.maxClip, 0, 3600, '0 plays each clip to the end') +
      selectFld('pView', 'Zoom and position', [['reset', 'New for each file'], ['keep', 'Keep for every file']], p.keepView ? 'keep' : 'reset').replace('class="fld"', 'class="fld wide"') +
      '</div>' +
      '<div class="acts"><button class="btn" id="plNext"' + (it.pinned ? ' disabled title="Pinned: unpin to move on"' : '') + '>Next file</button>' +
      '<button class="btn" id="plChange" title="Play a different folder on this tile">Change folder…</button></div>' +
      '<button class="btn" id="plLeave" title="Keep showing the file that is on the tile now">Stop the playlist on this tile</button></div>';
  }
  function playlistSig(it) {
    var p = it.pl && S.playlists[it.pl];
    return p ? [p.name, p.files.length, !!p.truncated, p.shuffle, p.secs, p.gifOnce, p.randomStart, p.fade, p.maxClip, !!p.keepView, playersOf(it)].join(',') : '';
  }

  // What the card shows. When only the tile's place changed (every step of a drag) or a playlist moved on to the next
  // file, just the numbers and the name are updated, so nothing you are typing in the card is lost.
  var shownKey = null, shownItem = null;
  function keyOf(it) {
    return it ? [it.id, S.mode, S.cols, S.rows, it.kind, !!it.missing, !!it.sample, it.pl || '', !!it.pinned, it.muted, it.loop, it.fit, playlistSig(it)].join('|') : '';
  }
  function updatePlacement(it) {
    var v = S.mode === 'free' ? freeValues(it) : { fCol: it.col + 1, fRow: it.row + 1, fW: it.w, fH: it.h };
    v.insZoom = MW.view.of(it).zoom * 100;
    Object.keys(v).forEach(function (id) {
      var input = document.getElementById(id);
      if (input && input !== document.activeElement) input.value = Math.round(v[id]);
    });
    var zl = document.getElementById('insZoomVal');
    if (zl) zl.textContent = Math.round(v.insZoom) + '%';
    var nm = inspector.querySelector('.ins-name'), pa = inspector.querySelector('.ins-path');
    if (nm && nm.textContent !== it.name) nm.textContent = it.name;
    if (pa && pa.textContent !== (it.path || '')) pa.textContent = it.path || '';
  }

  /* ---------- the Properties card: floats next to the selected tile, so the wall keeps the whole window ---------- */
  A.propsOpen = false;
  // `section`: a part of the card to bring into view, e.g. '#plSec' for the playlist options.
  A.openProps = function (it, section) {
    if (!it) return;
    A.select(it.id);
    A.propsOpen = true; shownKey = null;
    A.refreshInspector();
    var s = section && inspector.querySelector(section);
    if (s) { s.scrollIntoView({ block: 'nearest' }); s.classList.add('flash'); setTimeout(function () { s.classList.remove('flash'); }, 900); }
  };
  A.closeProps = function () {
    A.propsOpen = false; shownKey = null; shownItem = null;
    inspector.hidden = true;
  };
  // Beside the tile (right if there is room, else left), as high as the tile, inside the window.
  function placeCard(it) {
    var el = A.tileEls.get(it.id);
    if (!el) return;
    var r = el.getBoundingClientRect(), m = 12, vw = window.innerWidth, vh = window.innerHeight;
    var w = inspector.offsetWidth, h = Math.min(inspector.offsetHeight, vh - 2 * m);
    var left = r.right + 14 + w <= vw - m ? r.right + 14 : (r.left - 14 - w >= m ? r.left - 14 - w : vw - w - m);
    inspector.style.left = Math.max(m, left) + 'px';
    inspector.style.top = clamp(r.top, m, Math.max(m, vh - h - m)) + 'px';
  }

  A.refreshInspector = function () {
    var it = A.selected();
    if (!A.propsOpen || !it) { if (A.propsOpen) A.closeProps(); return; }
    var key = keyOf(it), moved = it !== shownItem;
    if (key === shownKey && !moved) { updatePlacement(it); return; }
    shownKey = key; shownItem = it;
    var pills = '<span class="pill">' + A.kindLabel(it) + '</span>' +
      (it.pl ? '<span class="pill acc">' + (it.pinned ? 'Playlist · pinned' : 'Playlist') + '</span>' : '') +
      (it.sample ? '<span class="pill">Sample</span>' : '') +
      (it.missing ? '<span class="pill warn">File not found</span>' : '');
    inspector.innerHTML =
      '<button class="btn ib closex" id="insClose" type="button" aria-label="Close properties" title="Close (Esc)">' + A.ICON.x + '</button>' +
      '<div class="ins-head"><div class="ins-name">' + esc(it.name) + '</div><div class="ins-meta">' + pills + '</div>' +
      (it.path ? '<div class="ins-path">' + esc(it.path) + '</div>' : '') + '</div>' +
      '<div class="sec"><span class="lab">' + (S.mode === 'free' ? 'Position and size (pixels)' : 'Position and size (cells)') + '</span><div class="fields">' +
      (S.mode === 'free' ? freeFields(it) :
        field('fCol', 'Column', it.col + 1, S.cols) + field('fRow', 'Row', it.row + 1, S.rows) +
        field('fW', 'Width', it.w, S.cols) + field('fH', 'Height', it.h, S.rows)) + '</div></div>' +
      (!A.hasMedia(it) ? '' : '<div class="sec"><span class="lab">Display</span>' + seg('sFit', 'Fill the tile', 'Whole frame', it.fit === 'cover') +
        '<div class="frow zoomrow"><label for="insZoom">Zoom</label><div class="row"><input id="insZoom" type="range" min="100" max="' + (MW.view.MAXZ * 100) + '" step="5" value="' + Math.round(MW.view.of(it).zoom * 100) + '"><span class="gapval" id="insZoomVal">' + Math.round(MW.view.of(it).zoom * 100) + '%</span></div></div>' +
        '<div class="acts"><button class="btn" id="insRepos" title="Drag the media inside the tile; scroll to zoom"><span class="ic" aria-hidden="true">' + A.ICON.move + '</span>Reposition</button>' +
        '<button class="btn" id="insViewReset" title="Centre the media and zoom out"><span class="ic" aria-hidden="true">' + A.ICON.reset + '</span>Reset</button></div>' +
        '<button class="btn" id="insFitTile" title="Shrink the tile to the exact shape of its media: no bars, nothing cropped"><span class="ic" aria-hidden="true">' + A.ICON.fit + '</span>Fit tile to media</button></div>') +
      (it.kind === 'video' && !it.missing ? '<div class="sec"><span class="lab">Playback</span>' + seg('sMute', 'Sound off', 'Sound on', it.muted) + (it.pl ? '' : seg('sLoop', 'Loop', 'Play once', it.loop)) + '</div>' : '') +
      (it.pl && S.playlists[it.pl] ? playlistSec(it) : '') +
      '<div class="sec"><span class="lab">' + (it.kind === 'empty' ? 'Media' : 'File') + '</span><div class="acts">' +
      (it.missing ? '<button class="btn pri" id="insRelink">Locate file…</button>' : it.kind === 'empty' ? '<button class="btn pri" id="insReplace">Choose media…</button>' : '<button class="btn" id="insReplace">Replace…</button>') +
      '<button class="btn" id="insFolder" title="Give this tile a folder of its own to play">' + (it.kind === 'empty' ? 'Play a folder…' : 'Own folder…') + '</button>' +
      (it.path && !it.missing ? '<button class="btn" id="insReveal">Show in folder</button>' : '') +
      '</div></div>' +
      '<button class="btn warn full" id="insRemove"><span class="ic" aria-hidden="true">' + A.ICON.trash + '</span>Remove from wall</button>';

    function commit() {
      var col = clamp((parseInt($('#fCol').value, 10) || 1) - 1, 0, S.cols - 1);
      var row = clamp((parseInt($('#fRow').value, 10) || 1) - 1, 0, S.rows - 1);
      var w = clamp(parseInt($('#fW').value, 10) || 1, 1, S.cols);
      var h = clamp(parseInt($('#fH').value, 10) || 1, 1, S.rows);
      var res = G.resolveYield(S.items, it.id, { col: col, row: row, w: w, h: h }, null, S.cols, S.rows);
      if (res) { A.pushHistory(); A.commitYield(res); A.render(); }
      else A.toast('There is no room for that placement.');
      A.refreshInspector();
    }
    function commitFree() {
      var d = A.wallPx();
      var w = clamp(parseInt($('#fW').value, 10) || F.MIN, F.MIN, d.W), h = clamp(parseInt($('#fH').value, 10) || F.MIN, F.MIN, d.H);
      var x = clamp(parseInt($('#fX').value, 10) || 0, 0, d.W - w), y = clamp(parseInt($('#fY').value, 10) || 0, 0, d.H - h);
      var res = F.resolve(S.items.map(function (i) { return i.id; }), it.id, { x: x, y: y, w: w, h: h }, A.freeGeoPx(), d);
      if (res) { A.pushHistory(); A.applyFreePx(res); A.render(); }
      else A.toast('There is no room for that.');
      A.refreshInspector();
    }
    (S.mode === 'free' ? ['#fX', '#fY', '#fW', '#fH'] : ['#fCol', '#fRow', '#fW', '#fH']).forEach(function (s) { $(s).addEventListener('change', S.mode === 'free' ? commitFree : commit); });
    if ($('#sFit')) $('#sFit').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.fit = b.dataset.v === 'a' ? 'cover' : 'contain'; it.fitSet = true; A.render(); A.refreshInspector(); });
    if ($('#sMute')) $('#sMute').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.muted = b.dataset.v === 'a'; A.render(); A.refreshInspector(); });
    if ($('#sLoop')) $('#sLoop').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; it.loop = b.dataset.v === 'a'; A.render(); A.refreshInspector(); });
    if ($('#insFitTile')) $('#insFitTile').addEventListener('click', function () { A.fitTilesToMedia([it]); });
    if ($('#sPin')) $('#sPin').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; A.setPinned(it, b.dataset.v === 'b'); });
    // Playlist options apply at once to the folder this tile plays (and to every tile that plays it).
    if ($('#plOpts')) $('#plOpts').addEventListener('change', function () {
      var p = S.playlists[it.pl];
      if (!p) return;
      var next = {
        shuffle: $('#pOrder').value === 'shuffle',
        secs: clamp(parseInt($('#pSecs').value, 10) || 10, 2, 300),
        gifOnce: $('#pGif').value === 'once',
        randomStart: $('#pFrom').value === 'random',
        fade: clamp(parseFloat($('#pFade').value) || 0, 0, 5),
        maxClip: clamp(parseInt($('#pMax').value, 10) || 0, 0, 3600),
        keepView: $('#pView').value === 'keep'
      };
      A.pushHistory();
      if (next.shuffle !== p.shuffle) { p.order = null; p.pos = 0; }   // a new round, in the new order
      Object.assign(p, next);
      $('#pSecs').value = p.secs; $('#pMax').value = p.maxClip;
      shownKey = keyOf(it);   // the card already shows these values
      A.scheduleSession();
    });
    if ($('#plNext')) $('#plNext').addEventListener('click', function () { A.advance(it); });
    if ($('#plChange')) $('#plChange').addEventListener('click', function () { A.ownFolder(it); });
    if ($('#plLeave')) $('#plLeave').addEventListener('click', function () { A.leavePlaylist(it); });
    if ($('#insZoom')) $('#insZoom').addEventListener('input', function () {
      var el = A.tileEls.get(it.id), r = el && el.getBoundingClientRect();
      if (!r) return;
      A.zoomMedia(it, (parseInt(this.value, 10) / 100) / MW.view.of(it).zoom, r.left + r.width / 2, r.top + r.height / 2);
    });
    if ($('#insRepos')) $('#insRepos').addEventListener('click', function () { A.startRepos(it); });
    if ($('#insViewReset')) $('#insViewReset').addEventListener('click', function () { A.resetView(it); });
    $('#insFolder').addEventListener('click', function () { A.ownFolder(it); });
    if ($('#insReplace')) $('#insReplace').addEventListener('click', function () { A.chooseMedia(it); });
    if ($('#insRelink')) $('#insRelink').addEventListener('click', function () { A.relinkOne(it); });
    if ($('#insReveal')) $('#insReveal').addEventListener('click', function () { A.api.revealFile(it.path); });
    $('#insRemove').addEventListener('click', function () { A.removeItem(it.id); });
    $('#insClose').addEventListener('click', A.closeProps);
    inspector.hidden = false;
    if (moved) placeCard(it);   // a newly shown tile: move the card next to it
  };
})(window.MW.app);
