// Rows and columns: build the wall from lines with their own number of tiles, e.g. 3 tiles in the first row and 4 in
// the second. When the lines share a grid (up to 12 cells across) the wall stays on the grid; otherwise it switches to
// Free (pixels). Tiles move into the new frames in reading order; frames left over become empty tiles.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, G = MW.geo, U = MW.util;
  var S = A.S, $ = A.$;
  var MAX = 12;
  var B = { dir: 'rows', counts: null };

  function freeOrder(a, b) { return ((a.fy || 0) - (b.fy || 0)) || ((a.fx || 0) - (b.fx || 0)); }
  function lineName(i) { return (B.dir === 'rows' ? 'Row ' : 'Column ') + (i + 1); }

  function draw() {
    Array.prototype.forEach.call($('#bDir').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.dir === B.dir)); });
    $('#bLines').innerHTML = B.counts.map(function (n, i) {
      return '<div class="bline"><span>' + lineName(i) + '</span>' +
        '<div class="step"><button type="button" data-b="dec" data-i="' + i + '" aria-label="Fewer tiles in ' + lineName(i) + '">−</button>' +
        '<input type="number" min="1" max="' + MAX + '" value="' + n + '" data-i="' + i + '" aria-label="Tiles in ' + lineName(i) + '">' +
        '<button type="button" data-b="inc" data-i="' + i + '" aria-label="More tiles in ' + lineName(i) + '">+</button></div>' +
        '<span class="bunit">' + (n === 1 ? 'tile' : 'tiles') + '</span>' +
        '<button class="btn ib" type="button" data-b="del" data-i="' + i + '" aria-label="Remove ' + lineName(i) + '"' + (B.counts.length < 2 ? ' disabled' : '') + '>' + A.ICON.trash + '</button></div>';
    }).join('');
    $('#bAddLbl').textContent = B.dir === 'rows' ? 'Add a row' : 'Add a column';
    $('#bAdd').disabled = B.counts.length >= MAX;
    $('#bPrev').className = 'bprev ' + B.dir;
    $('#bPrev').innerHTML = B.counts.map(function (n) { return '<span class="ln">' + new Array(n + 1).join('<i></i>') + '</span>'; }).join('');
    var L = G.linesLayout(B.counts, B.dir), total = L.boxes.length, have = S.items.filter(function (i) { return !i.sample; }).length;
    var notes = [total + (total === 1 ? ' tile' : ' tiles') + ' in all.'];
    if (!L.grid) notes.push('These ' + (B.dir === 'rows' ? 'rows' : 'columns') + ' do not line up on one grid, so the wall switches to Free (pixels).');
    else if (S.mode === 'free') notes.push('The wall goes back to Snap to grid, ' + L.cols + ' × ' + L.rows + ' cells.');
    if (have > total) notes.push('The wall has ' + have + ' tiles: add frames, or remove tiles first.');
    else if (have < total) notes.push((total - have) + (total - have === 1 ? ' frame stays' : ' frames stay') + ' empty for now.');
    $('#bNote').textContent = notes.join(' ');
    $('#bApply').disabled = have > total;
  }

  A.openBuilder = function () {
    if (!B.counts) {   // start from the wall as it is: each row of the grid
      B.counts = [];
      for (var r = 0; r < Math.min(S.rows, MAX); r++) B.counts.push(Math.min(S.cols, MAX));
    }
    draw();
    A.openPop('builder');
  };
  $('#rowsBtn').addEventListener('click', function (e) { e.stopPropagation(); A.openBuilder(); });
  $('#bDir').addEventListener('click', function (e) { var b = e.target.closest('[data-dir]'); if (b) { B.dir = b.dataset.dir; draw(); } });
  $('#bLines').addEventListener('click', function (e) {
    var b = e.target.closest('[data-b]');
    if (!b || b.disabled) return;
    var i = +b.dataset.i;
    if (b.dataset.b === 'inc') B.counts[i] = Math.min(MAX, B.counts[i] + 1);
    else if (b.dataset.b === 'dec') B.counts[i] = Math.max(1, B.counts[i] - 1);
    else if (b.dataset.b === 'del' && B.counts.length > 1) B.counts.splice(i, 1);
    draw();
  });
  $('#bLines').addEventListener('change', function (e) {
    if (!e.target.matches('input')) return;
    B.counts[+e.target.dataset.i] = U.clamp(parseInt(e.target.value, 10) || 1, 1, MAX);
    draw();
  });
  $('#bAdd').addEventListener('click', function () {
    if (B.counts.length < MAX) B.counts.push(B.counts[B.counts.length - 1] || 3);
    draw();
  });

  $('#bApply').addEventListener('click', function () {
    var L = G.linesLayout(B.counts, B.dir);
    var keep = S.items.filter(function (i) { return !i.sample; });
    if (keep.length > L.boxes.length) { draw(); return; }
    A.pushHistory();
    var order = keep.sort(S.mode === 'free' ? freeOrder : U.readingOrder);
    while (order.length < L.boxes.length) order.push(A.makeEmptyItem({ col: 0, row: 0, w: 1, h: 1 }));
    S.items = order.slice();
    if (S.sel && !A.itemById(S.sel)) S.sel = null;
    if (L.grid) {
      S.mode = 'grid'; S.cols = L.cols; S.rows = L.rows;
      order.forEach(function (it, i) { var f = L.frames[i]; it.col = f.col; it.row = f.row; it.w = f.w; it.h = f.h; });
    } else {
      S.mode = 'free';
      order.forEach(function (it, i) { var b = L.boxes[i]; it.fx = b.fx; it.fy = b.fy; it.fw = b.fw; it.fh = b.fh; });
    }
    var empties = order.filter(function (i) { return i.kind === 'empty'; }).length;
    A.autoFill(false);   // a running folder playlist fills the new empty tiles
    A.closePops(); A.savePrefs(); A.render(); A.refreshInspector();
    A.toast('The wall now has ' + B.counts.join(' + ') + ' tiles' + (B.dir === 'rows' ? ' in its rows' : ' in its columns') +
      (L.grid ? '.' : ', placed freely.') + (empties ? ' Drop media on the empty tiles, or add a folder as a playlist to fill them.' : ''));
  });
})(window.MW.app);
