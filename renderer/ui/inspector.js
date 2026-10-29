// Selection and the side panel (inspector) that shows and edits the selected tile.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free;
  var S = A.S, $ = A.$, inspector = A.inspector, clamp = U.clamp, esc = U.esc;

  A.select = function (id) {
    if (S.sel === id) return;
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

  // What the panel shows. When only the tile's place changed (every step of a drag), just the numbers are updated.
  var shownKey = null, shownItem = null;
  function keyOf(it) {
    return it ? [it.id, S.mode, S.cols, S.rows, it.kind, !!it.missing, !!it.sample, it.pl || '', !!it.pinned, it.muted, it.loop, it.fit, it.name, it.path].join('|') : '';
  }
  function updatePlacement(it) {
    var v = S.mode === 'free' ? freeValues(it) : { fCol: it.col + 1, fRow: it.row + 1, fW: it.w, fH: it.h };
    Object.keys(v).forEach(function (id) {
      var input = document.getElementById(id);
      if (input && input !== document.activeElement) input.value = Math.round(v[id]);
    });
  }

  A.refreshInspector = function () {
    var it = A.selected(), key = keyOf(it);
    if (key === shownKey && it === shownItem) { if (it) updatePlacement(it); return; }
    shownKey = key; shownItem = it;
    if (!it) {
      inspector.innerHTML =
        '<div><div class="ins-name">Nothing selected</div><div class="ins-kind">Click a tile, or Tab to it, to set its position and size.</div></div>' +
        '<ul class="tips">' +
        '<li>Drop files from Explorer onto the wall to add them in name order. Drop on a tile to replace it.</li>' +
        '<li>Drop a folder to play it as a playlist that fills the empty cells (in Free layout each file gets its own tile). Drop a folder on a tile to give just that tile the folder.</li>' +
        '<li>Drag a tile anywhere. Tiles in the way move aside, or swap if they are the same size.</li>' +
        '<li>Drag any border or corner of a tile to resize it. Double-click a tile for fullscreen.</li>' +
        '<li>Arrow keys move the selected tile, Shift and arrows resize it, Delete removes it. Ctrl+Z undoes. In Free layout the arrows move by 1 px (Ctrl: 10).</li>' +
        '<li>F11 toggles wall mode: it hides the controls and fills the display you pick. Settings can start a window in wall mode.</li>' +
        '</ul>' +
        '<p class="note">Sample tiles disappear when you add your own media. The wall you leave open comes back next time you start the app.</p>';
      return;
    }
    inspector.innerHTML =
      '<div><div class="ins-name">' + esc(it.name) + '</div><div class="ins-kind">' + A.kindLabel(it) + (it.sample ? ' · sample' : '') + (it.missing ? ' · file not found' : '') + '</div></div>' +
      (it.path ? '<div class="ins-path">' + esc(it.path) + '</div>' : '') +
      '<div class="sec"><span class="lab">Placement' + (S.mode === 'free' ? ' (pixels)' : '') + '</span><div class="fields">' +
      (S.mode === 'free' ? freeFields(it) :
        field('fCol', 'Column', it.col + 1, S.cols) + field('fRow', 'Row', it.row + 1, S.rows) +
        field('fW', 'Width', it.w, S.cols) + field('fH', 'Height', it.h, S.rows)) + '</div></div>' +
      (it.missing ? '' : '<div class="sec"><span class="lab">Display</span>' + seg('sFit', 'Fill cell', 'Whole frame', it.fit === 'cover') + '</div>') +
      (it.kind === 'video' && !it.missing ? '<div class="sec"><span class="lab">Playback</span>' + seg('sMute', 'Sound off', 'Sound on', it.muted) + (it.pl ? '' : seg('sLoop', 'Loop', 'Play once', it.loop)) + '</div>' : '') +
      (it.pl && !it.missing ? '<div class="sec"><span class="lab">Playlist</span>' + seg('sPin', 'Rotating', 'Pinned', !it.pinned) + '</div>' : '') +
      '<div class="acts">' +
      '<button class="btn" id="insFolder">Own folder…</button>' +
      (it.missing ? '<button class="btn pri" id="insRelink">Locate file</button>' : '<button class="btn" id="insReplace">Replace file</button>') +
      (it.path && !it.missing ? '<button class="btn" id="insReveal">Show in folder</button>' : '') +
      '<button class="btn warn" id="insRemove">Remove</button></div>';

    function commit() {
      var col = clamp((parseInt($('#fCol').value, 10) || 1) - 1, 0, S.cols - 1);
      var row = clamp((parseInt($('#fRow').value, 10) || 1) - 1, 0, S.rows - 1);
      var w = clamp(parseInt($('#fW').value, 10) || 1, 1, S.cols);
      var h = clamp(parseInt($('#fH').value, 10) || 1, 1, S.rows);
      var res = G.resolve(S.items, it.id, { col: col, row: row, w: w, h: h }, null, S.cols, S.rows);
      if (res) { A.pushHistory(); G.applyGeo(S.items, res); A.render(); }
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
    if ($('#sPin')) $('#sPin').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; A.setPinned(it, b.dataset.v === 'b'); });
    $('#insFolder').addEventListener('click', function () {
      A.api.openFolder().then(function (res) {
        if (res.entries.length) A.assignFolder(it, res);
        else if (A.picked(res)) A.toast(A.noMediaMessage(res));
      });
    });
    if ($('#insReplace')) $('#insReplace').addEventListener('click', function () {
      A.api.openFiles(false).then(function (res) {
        var f = res.entries[0];
        if (!f) { if (A.picked(res)) A.toast(A.noMediaMessage(res)); return; }
        A.pushHistory(); A.replaceMedia(it, f);
        if (it.pl) { it.pinned = true; it.loop = true; }
        A.render(); A.refreshInspector();
      });
    });
    if ($('#insRelink')) $('#insRelink').addEventListener('click', function () { A.relinkOne(it); });
    if ($('#insReveal')) $('#insReveal').addEventListener('click', function () { A.api.revealFile(it.path); });
    $('#insRemove').addEventListener('click', function () { A.removeItem(it.id); });
  };
})(window.MW.app);
