// The library's browsing view, used in the wall page (as a drawer or a panel: ui/library.js) and in the library window
// (libwin/libwin.js): search, Videos / GIFs / Pictures, filters, the library folders, thumbnails in even rows (only the
// rows on screen exist in the page), sorting, selecting, keys, and dragging out. It builds itself into #lib.
// What it needs from the page (A): $, api, S.lib (its settings), ICON, savePrefs(), toast(), showMenu(), and A.libHost:
//   isOpen()            whether the view shows
//   put(paths)          double-click or Enter: onto the wall
//   menu(paths, x, y)   the right-click menu for these files
//   dragOut(e, paths)   a drag of files or a folder begins; dragEnd() when it ends
//   close()             Esc with nothing left to clear
//   places              whether its header offers the drawer / panel menu (placeMenu(x, y))
// It gives A.libView: { show() (fill it as it opens), refresh(), cleanPrefs(saved) }.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, J = MW.justify, U = MW.util;
  var $ = A.$, api = A.api, S = A.S, ICON = A.ICON, host = A.libHost;

  function count(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function nameOf(p) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

  // The view's settings, from what was saved (anything odd falls back to the default).
  var DEFAULTS = { place: 'drawer', side: 'left', open: false, w: 400, size: 110, sort: 'name', rev: false, kinds: [], shape: '', length: '', res: '', copy: false, folder: null };
  function cleanPrefs(l) {
    var one = function (v, list) { return list.indexOf(v) > -1 ? v : ''; };
    if (!l || typeof l !== 'object') return Object.assign({}, DEFAULTS);
    return {
      place: one(l.place, ['panel', 'window']) || 'drawer', side: one(l.side, ['right']) || 'left', open: l.open === true,
      w: U.clamp(+l.w || 400, 260, 4000), size: U.clamp(+l.size || 110, 60, 240),
      sort: one(l.sort, ['added', 'changed', 'length', 'size', 'random']) || 'name', rev: l.rev === true,
      kinds: (Array.isArray(l.kinds) ? l.kinds : []).filter(function (k) { return ['video', 'gif', 'image'].indexOf(k) > -1; }),
      shape: one(l.shape, ['landscape', 'portrait', 'square']), length: one(l.length, ['short', 'medium', 'long']),
      res: one(l.res, ['sd', 'hd', 'fhd', '4k']), copy: l.copy === true, folder: typeof l.folder === 'string' && l.folder ? l.folder : null
    };
  }

  /* ---------- its markup ---------- */
  var root = $('#lib');
  root.innerHTML =
    '<div class="lhead"><span class="ic">' + ICON.library + '</span><h2>Library</h2><span class="lcount" id="libCount"></span><span class="sp"></span>' +
      '<button class="btn ib" id="libAddFolder" type="button" aria-label="Add a folder to the library" title="Add a folder to the library"><span class="ic">' + ICON.plus + '</span></button>' +
      (host.places ? '<button class="btn ib" id="libPlace" type="button" aria-haspopup="menu" aria-label="Show the library as…" title="Show the library as a drawer over the wall, a panel beside it, or a window of its own"><span class="ic">' + ICON.panel + '</span></button>' : '') +
      '<button class="btn ib" id="libClose" type="button" aria-label="Close the library" title="Close the library (Ctrl+L)"><span class="ic">' + ICON.x + '</span></button></div>' +
    '<label class="lsearch"><span class="ic">' + ICON.search + '</span><input id="libSearch" type="search" placeholder="Search names" aria-label="Search names in the library" spellcheck="false" autocomplete="off"></label>' +
    '<div class="lchips"><div class="lkinds" role="group" aria-label="Show only">' +
      '<button type="button" class="chip" data-kind="video" aria-pressed="false">Videos</button>' +
      '<button type="button" class="chip" data-kind="gif" aria-pressed="false">GIFs</button>' +
      '<button type="button" class="chip" data-kind="image" aria-pressed="false">Pictures</button></div><span class="sp"></span>' +
      '<button type="button" class="chip" id="libFiltBtn" aria-expanded="false" aria-controls="libFilt">Filters<span class="lnum" id="libFiltN" hidden></span><span class="ic">' + ICON.chev + '</span></button></div>' +
    '<div class="lfilt" id="libFilt" hidden>' +
      '<select id="libShape" aria-label="Shape"><option value="">Any shape</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square</option></select>' +
      '<select id="libLength" aria-label="Length"><option value="">Any length</option><option value="short">Under 30 s</option><option value="medium">30 s to 5 min</option><option value="long">Over 5 min</option></select>' +
      '<select id="libRes" aria-label="Resolution"><option value="">Any resolution</option><option value="sd">Below HD</option><option value="hd">HD</option><option value="fhd">Full HD</option><option value="4k">4K and up</option></select>' +
      '<label class="check"><input type="checkbox" id="libCopy"><span>Needs a playable copy</span></label>' +
      '<button class="btn" id="libFiltClear" type="button">Clear filters</button></div>' +
    '<div class="lfolderpick" id="libFolderPick">' +
      '<button type="button" class="lfolderbtn" id="libFolderBtn" aria-haspopup="true" aria-expanded="false" aria-controls="libFolderList" title="Show one library folder, or all of them">' +
        '<span class="ic" id="libFolderIc"></span><span class="lfname" id="libFolderName"></span><span class="lnumr" id="libFolderNum"></span><span class="ic">' + ICON.chev + '</span></button>' +
      '<div class="lfolders" id="libFolderList" role="list" aria-label="Library folders" hidden></div></div>' +
    '<div class="lgrid" id="libGrid" tabindex="0" role="listbox" aria-label="Files" aria-multiselectable="true"><div class="lspace" id="libSpace"></div><div class="lempty" id="libEmpty" hidden></div></div>' +
    '<div class="lfoot"><span class="lshown" id="libShown"></span><span class="sp"></span>' +
      '<select id="libSort" aria-label="Sort by"><option value="name">Name</option><option value="added">Date added</option><option value="changed">Date changed</option><option value="length">Length</option><option value="size">File size</option><option value="random">Random</option></select>' +
      '<button class="btn ib" id="libRev" type="button" aria-pressed="false" aria-label="Reverse the order" title="Reverse the order"><span class="ic">' + ICON.sortdir + '</span></button>' +
      '<button class="btn ib" id="libShuffle" type="button" aria-label="Shuffle again" title="Shuffle again" hidden><span class="ic">' + ICON.shuffle + '</span></button>' +
      '<input type="range" id="libSize" min="60" max="240" step="10" aria-label="Thumbnail size" title="Thumbnail size"></div>' +
    '<div class="lresize" id="libResize" title="Drag to make the library wider or narrower"></div>';

  var grid = $('#libGrid'), space = $('#libSpace'), emptyBox = $('#libEmpty'), folderBox = $('#libFolderList'), folderPick = $('#libFolderPick');
  var GAP = 4;
  var results = [], index = new Map(), total = 0, folders = [], layout = { rows: [], boxes: [], height: 0 };
  var els = new Map();       // id -> thumbnail element on screen
  var thumbs = new Map();    // id -> thumbnail URL
  var asked = new Set();     // ids whose thumbnails were asked for
  var sel = new Set(), anchor = -1;
  var seq = 0, text = '', seed = 1, laidWidth = 0;

  function query() {
    var l = S.lib;
    return { text: text, folder: l.folder, kinds: l.kinds, shape: l.shape, length: l.length, res: l.res, needsCopy: l.copy, sort: l.sort, reverse: l.rev, seed: seed };
  }
  function filtering() { var l = S.lib; return !!(text.trim() || l.kinds.length || l.shape || l.length || l.res || l.copy || l.folder); }
  function refresh() {
    if (!host.isOpen()) return;
    var n = ++seq;
    api.queryLibrary(query()).then(function (r) {
      if (n !== seq) return;
      results = r.items; total = r.total;
      index = new Map();
      results.forEach(function (it, i) { index.set(it.id, i); });
      sel.forEach(function (id) { if (!index.has(id)) sel.delete(id); });
      relayout();
      showCounts();
    });
  }
  function refreshFolders() {
    if (!host.isOpen()) return;
    api.libraryFolders().then(function (list) {
      folders = list;
      if (S.lib.folder && !list.some(function (f) { return f.path === S.lib.folder; })) { S.lib.folder = null; refresh(); }
      drawFolders();
      showCounts();
    });
  }
  // As the view opens: its settings into the controls, and everything fetched afresh (thumbnails may have been made
  // again or cleaned since).
  function show() {
    var l = S.lib;
    Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', String(l.kinds.indexOf(b.dataset.kind) > -1)); });
    $('#libShape').value = l.shape; $('#libLength').value = l.length; $('#libRes').value = l.res; $('#libCopy').checked = l.copy;
    $('#libSort').value = l.sort; $('#libRev').setAttribute('aria-pressed', String(l.rev)); $('#libSize').value = l.size;
    showFilterCount(); showSortButtons();
    root.style.setProperty('--libw', l.w + 'px');
    thumbs.clear(); asked.clear();
    refreshFolders(); refresh();
  }
  A.libView = { show: show, refresh: function () { refreshFolders(); refresh(); }, cleanPrefs: cleanPrefs };

  $('#libClose').addEventListener('click', function () { host.close(); });
  if (host.places) $('#libPlace').addEventListener('click', function () { var r = this.getBoundingClientRect(); host.placeMenu(r.left, r.bottom + 4); });
  $('#libAddFolder').addEventListener('click', function () {
    api.addLibraryFolder().then(function (r) {
      if (!r) return;
      if (r.status === 'added') A.toast('Added ' + nameOf(r.path) + ' to the library.');
      else if (r.status === 'inside') A.toast('That folder is in the library already, as part of ' + nameOf(r.path) + '.');
      refreshFolders(); refresh();
    });
  });

  /* ---------- what it shows ---------- */
  var typing = 0;
  $('#libSearch').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(typing);
    typing = setTimeout(function () { text = v; grid.scrollTop = 0; refresh(); }, 120);
  });
  function changed() { A.savePrefs(); grid.scrollTop = 0; refresh(); }
  Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.kind, on = S.lib.kinds.indexOf(k) < 0;
      S.lib.kinds = on ? S.lib.kinds.concat(k) : S.lib.kinds.filter(function (x) { return x !== k; });
      b.setAttribute('aria-pressed', String(on));
      changed();
    });
  });
  function showFilterCount() {
    var l = S.lib, n = (l.shape ? 1 : 0) + (l.length ? 1 : 0) + (l.res ? 1 : 0) + (l.copy ? 1 : 0), el = $('#libFiltN');
    el.hidden = !n; el.textContent = String(n);
  }
  $('#libFiltBtn').addEventListener('click', function () {
    var f = $('#libFilt');
    f.hidden = !f.hidden;
    this.setAttribute('aria-expanded', String(!f.hidden));
  });
  [['#libShape', 'shape'], ['#libLength', 'length'], ['#libRes', 'res']].forEach(function (x) {
    $(x[0]).addEventListener('change', function () { S.lib[x[1]] = this.value; showFilterCount(); changed(); });
  });
  $('#libCopy').addEventListener('change', function () { S.lib.copy = this.checked; showFilterCount(); changed(); });
  $('#libFiltClear').addEventListener('click', function () {
    S.lib.shape = ''; S.lib.length = ''; S.lib.res = ''; S.lib.copy = false;
    $('#libShape').value = ''; $('#libLength').value = ''; $('#libRes').value = ''; $('#libCopy').checked = false;
    showFilterCount(); changed();
  });
  function clearAll() {
    $('#libSearch').value = ''; text = '';
    S.lib.kinds = []; S.lib.folder = null;
    Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('#libFiltClear').click();
    drawFolders();
  }
  function showSortButtons() {
    var rnd = S.lib.sort === 'random';
    $('#libShuffle').hidden = !rnd; $('#libRev').hidden = rnd;
  }
  $('#libSort').addEventListener('change', function () { S.lib.sort = this.value; showSortButtons(); changed(); });
  $('#libRev').addEventListener('click', function () { S.lib.rev = !S.lib.rev; this.setAttribute('aria-pressed', String(S.lib.rev)); changed(); });
  $('#libShuffle').addEventListener('click', function () { seed++; grid.scrollTop = 0; refresh(); });
  var sizeSave = 0;
  $('#libSize').addEventListener('input', function () {
    S.lib.size = +this.value;
    relayout();
    clearTimeout(sizeSave); sizeSave = setTimeout(A.savePrefs, 400);
  });

  /* ---------- the folders: one row that says which, and opens the list of them ---------- */
  function folderLabel(f) { return f.path ? nameOf(f.path) + (f.available === false ? ' (not found)' : '') : 'All folders'; }
  function drawFolders() {
    folderBox.innerHTML = '';
    folderPick.hidden = !folders.length;
    if (!folders.length) { openFolders(false); return; }
    var all = [{ path: null, files: folders.reduce(function (s, f) { return s + f.files; }, 0) }].concat(folders);
    var now = all.filter(function (f) { return f.path === S.lib.folder; })[0] || all[0];
    $('#libFolderIc').innerHTML = now.path ? ICON.folder : ICON.library;
    $('#libFolderName').textContent = folderLabel(now);
    $('#libFolderNum').textContent = now.scanning ? '…' : now.files.toLocaleString('en');
    $('#libFolderBtn').classList.toggle('off', now.available === false);
    $('#libFolderBtn').classList.toggle('one', !!now.path);
    all.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lfolder' + (f.available === false ? ' off' : '');
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-current', String(S.lib.folder === f.path));
      b.innerHTML = '<span class="ic" aria-hidden="true">' + (f.path ? ICON.folder : ICON.library) + '</span><span class="lfname"></span><span class="lnumr"></span>';
      b.querySelector('.lfname').textContent = folderLabel(f);
      b.querySelector('.lnumr').textContent = f.scanning ? '…' : f.files.toLocaleString('en');
      if (f.path) {
        b.title = f.path + '\nDrag onto the wall: a tile plays this folder, or the empty tiles do.';
        b.draggable = true;
        b.addEventListener('dragstart', function (e) { host.dragOut(e, [f.path]); });
        b.addEventListener('dragend', function () { openFolders(false); });
      }
      b.addEventListener('click', function () {
        openFolders(false);
        $('#libFolderBtn').focus();
        if (S.lib.folder === f.path) return;
        S.lib.folder = f.path;
        drawFolders(); changed();
      });
      folderBox.appendChild(b);
    });
  }
  function openFolders(on) {
    folderBox.hidden = !on;
    $('#libFolderBtn').setAttribute('aria-expanded', String(on));
    if (on) { var cur = folderBox.querySelector('[aria-current="true"]'); if (cur) { cur.scrollIntoView({ block: 'nearest' }); cur.focus(); } }
  }
  $('#libFolderBtn').addEventListener('click', function () { openFolders(folderBox.hidden); });
  // Clicking anywhere else closes the list; Up and Down move through it.
  document.addEventListener('pointerdown', function (e) { if (!folderBox.hidden && !folderPick.contains(e.target)) openFolders(false); }, true);
  folderBox.addEventListener('keydown', function (e) {
    var d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    var list = Array.prototype.slice.call(folderBox.querySelectorAll('.lfolder')), i = list.indexOf(document.activeElement);
    if (list.length) list[(i + d + list.length) % list.length].focus();
  });
  function showCounts() {
    $('#libCount').textContent = total ? count(total, 'file', 'files') : '';
    $('#libShown').textContent = results.length === total ? count(total, 'file', 'files') : results.length.toLocaleString('en') + ' of ' + total.toLocaleString('en');
    var msg = null;
    if (!folders.length) msg = 'empty';
    else if (!results.length) msg = filtering() ? 'nomatch' : (folders.some(function (f) { return f.scanning; }) ? 'looking' : 'nomedia');
    emptyBox.hidden = !msg;
    if (!msg) return;
    emptyBox.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = {
      empty: 'Your library is empty. Add the folders where you keep your videos, GIFs and pictures, or drop them here from Explorer.',
      nomatch: 'Nothing matches.', looking: 'Looking through your folders…', nomedia: 'No videos, GIFs or pictures in these folders yet.'
    }[msg];
    emptyBox.appendChild(p);
    if (msg === 'empty' || msg === 'nomatch') {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.innerHTML = msg === 'empty' ? '<span class="ic">' + ICON.plus + '</span>Add folder…' : 'Show everything';
      b.addEventListener('click', msg === 'empty' ? function () { $('#libAddFolder').click(); } : function () { clearAll(); changed(); });
      emptyBox.appendChild(b);
    }
  }

  /* ---------- thumbnails in even rows; only the rows on screen exist ---------- */
  function relayout() {
    laidWidth = grid.clientWidth;
    layout = J.layout(results, laidWidth, S.lib.size, GAP);
    space.style.height = layout.height + 'px';
    paint();
  }
  // A thumbnail on screen stays as it is (so it never flickers, or vanishes under the pointer) until its file's
  // details change.
  function sigOf(it) { return [it.name, it.path, it.kind, it.w, it.h, it.dur].join('|'); }
  function paint() {
    var top = grid.scrollTop, v = J.visible(layout.rows, top - 300, top + grid.clientHeight + 300), keep = new Set();
    if (v) {
      for (var r = v.first; r <= v.last; r++) {
        var row = layout.rows[r];
        for (var i = row.start; i < row.end; i++) {
          var it = results[i], b = layout.boxes[i], el = els.get(it.id), sig = sigOf(it);
          if (el && el._sig !== sig) { el.remove(); els.delete(it.id); el = null; }
          if (!el) { el = make(it); el._sig = sig; els.set(it.id, el); space.appendChild(el); }
          el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
          keep.add(it.id);
        }
      }
    }
    els.forEach(function (el, id) { if (!keep.has(id)) { el.remove(); els.delete(id); } });
    askThumbs();
  }
  var painting = false;
  grid.addEventListener('scroll', function () {
    if (painting) return;
    painting = true;
    requestAnimationFrame(function () { painting = false; paint(); });
  });
  new ResizeObserver(function () { if (host.isOpen() && grid.clientWidth !== laidWidth) relayout(); }).observe(grid);

  function clock(s) {
    s = Math.round(s);
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  var KIND_WORDS = { video: 'Video', gif: 'GIF', image: 'Picture' };
  function make(it) {
    var el = document.createElement('div'), on = sel.has(it.id);
    el.className = 'lthumb' + (on ? ' sel' : '');
    el.dataset.id = it.id;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(on));
    el.draggable = true;
    el.title = it.name + '\n' + [KIND_WORDS[it.kind], it.w ? it.w + ' × ' + it.h : '', it.dur && it.kind === 'video' ? clock(it.dur) : ''].filter(Boolean).join(' · ');
    var src = thumbs.get(it.id) || (A.hasFfmpeg === false && it.kind !== 'video' ? U.fileUrl(it.path) : null);
    if (src) addImg(el, src); else bare(el, it);
    if (it.kind === 'gif' || (it.kind === 'video' && it.dur)) {
      var badge = document.createElement('span');
      badge.className = 'lbadge';
      badge.textContent = it.kind === 'gif' ? 'GIF' : clock(it.dur);
      el.appendChild(badge);
    }
    return el;
  }
  // Without a thumbnail yet: the kind's icon and the name.
  function bare(el, it) {
    el.classList.add('bare');
    var ic = document.createElement('span'), nm = document.createElement('span');
    ic.className = 'ic'; ic.innerHTML = it.kind === 'video' ? ICON.play : ICON.file;
    nm.className = 'ltname'; nm.textContent = it.name;
    el.insertBefore(nm, el.firstChild); el.insertBefore(ic, el.firstChild);
  }
  function addImg(el, src) {
    var img = new Image();
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.addEventListener('error', function () {
      // Cleaned out of the cache meanwhile: ask again.
      var id = el.dataset.id;
      thumbs.delete(id); asked.delete(id); img.remove();
      var it = results[index.get(id)];
      if (it) { bare(el, it); askThumbs(); }
    });
    img.src = src;
    el.insertBefore(img, el.firstChild);
  }
  function setThumb(id, p) {
    var url = U.fileUrl(p);
    thumbs.set(id, url);
    var el = els.get(id);
    if (!el || !el.classList.contains('bare')) return;
    el.classList.remove('bare');
    Array.prototype.forEach.call(el.querySelectorAll('.ic, .ltname'), function (x) { x.remove(); });
    addImg(el, url);
  }
  var askTimer = 0;
  function askThumbs() {
    if (askTimer) return;
    askTimer = setTimeout(function () {
      askTimer = 0;
      var ids = [];
      els.forEach(function (el, id) { if (!thumbs.has(id) && !asked.has(id)) ids.push(id); });
      if (!ids.length) return;
      ids.forEach(function (id) { asked.add(id); });
      api.libraryThumbs(ids).then(function (m) { Object.keys(m).forEach(function (id) { setThumb(id, m[id]); }); });
    }, 80);
  }
  api.onLibraryThumbs(function (m) { Object.keys(m).forEach(function (id) { setThumb(id, m[id]); }); });

  // The library changed (a scan, details read, a folder added or removed): drawn again at most once a second.
  var changeTimer = 0;
  api.onLibrary(function () {
    if (!host.isOpen() || changeTimer) return;
    changeTimer = setTimeout(function () { changeTimer = 0; refreshFolders(); refresh(); }, 1000);
  });

  /* ---------- selecting ---------- */
  function paintSel() {
    els.forEach(function (el, id) { var on = sel.has(id); el.classList.toggle('sel', on); el.setAttribute('aria-selected', String(on)); });
  }
  function selectedPaths() {
    return results.filter(function (it) { return sel.has(it.id); }).map(function (it) { return it.path; });
  }
  function pick(e, id) {
    var i = index.get(id);
    if (e.shiftKey && anchor > -1) {
      if (!(e.ctrlKey || e.metaKey)) sel.clear();
      for (var k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) sel.add(results[k].id);
    } else if (e.ctrlKey || e.metaKey) {
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      anchor = i;
    } else {
      sel.clear(); sel.add(id); anchor = i;
    }
    paintSel();
  }
  grid.addEventListener('click', function (e) {
    var el = e.target.closest('.lthumb');
    if (el) pick(e, el.dataset.id);
    else if (!e.ctrlKey && !e.shiftKey) { sel.clear(); anchor = -1; paintSel(); }
  });
  grid.addEventListener('dblclick', function (e) {
    var el = e.target.closest('.lthumb');
    if (el) host.put([results[index.get(el.dataset.id)].path]);
  });
  grid.addEventListener('contextmenu', function (e) {
    var el = e.target.closest('.lthumb');
    if (!el) return;
    e.preventDefault();
    if (!sel.has(el.dataset.id)) pick({}, el.dataset.id);
    host.menu(selectedPaths(), e.clientX, e.clientY);
  });
  grid.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('.lthumb');
    if (!el) return;
    if (!sel.has(el.dataset.id)) pick({}, el.dataset.id);
    host.dragOut(e, selectedPaths());
  });
  root.addEventListener('dragend', function () { host.dragEnd(); });

  /* ---------- keys and width ---------- */
  // Keys in the view stay there (Delete, arrows and Space must not reach the wall's selected tile). Esc closes the
  // folder list, or clears the search, then the selection, then closes the view; Ctrl+A selects everything shown; Enter puts the selection on the wall.
  // Ctrl+L, Ctrl+Z, Ctrl+Y and F11 still work everywhere.
  root.addEventListener('keydown', function (e) {
    var k = String(e.key).toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'F11' || (ctrl && (k === 'l' || k === 'z' || k === 'y'))) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (!folderBox.hidden) { openFolders(false); $('#libFolderBtn').focus(); return; }
      if (e.target.id === 'libSearch' && e.target.value) return;   // the search box empties itself
      if (sel.size) { sel.clear(); anchor = -1; paintSel(); return; }
      host.close();
      return;
    }
    if (e.target !== grid) return;
    if (ctrl && k === 'a') { e.preventDefault(); results.forEach(function (it) { sel.add(it.id); }); paintSel(); }
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); host.put(selectedPaths()); }
  });
  $('#libResize').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    // Its free edge: the right one on the left side, the left one on the right side.
    var h = this, r = root.getBoundingClientRect(), right = S.lib.side === 'right', max = root.parentElement.clientWidth * (S.lib.place === 'panel' ? 0.6 : 1) - 40;
    h.setPointerCapture(e.pointerId);
    function move(ev) {
      S.lib.w = Math.round(U.clamp(right ? r.right - ev.clientX : ev.clientX - r.left, 260, Math.max(260, max)));
      root.style.setProperty('--libw', S.lib.w + 'px');
    }
    function up() { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); A.savePrefs(); }
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
  });

  /* ---------- folders dropped from Explorer join the library ---------- */
  function addFolders(paths) {
    var chain = Promise.resolve(), added = [], other = 0;
    paths.forEach(function (p) {
      chain = chain.then(function () { return api.addLibraryFolder(p); }).then(function (r) {
        if (r && r.status === 'added') added.push(r.path); else if (r && r.status !== 'inside') other++;
      });
    });
    return chain.then(function () {
      if (added.length) { A.toast('Added to the library: ' + added.map(nameOf).join(', ') + '.'); refreshFolders(); refresh(); }
      else if (other) A.toast('Only folders go into the library. Drop files on the wall to show them.');
      else if (paths.length) A.toast('Those folders are in the library already.');
    });
  }
  function filesDrag(e) { return !A.libDrag && Array.prototype.indexOf.call((e.dataTransfer && e.dataTransfer.types) || [], 'Files') > -1; }
  root.addEventListener('dragover', function (e) {
    if (A.libDrag) {   // its own files, back over it: nothing to drop here
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = 'none';
      if (host.overSelf) host.overSelf();
      return;
    }
    if (!filesDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    root.classList.add('drop');
    if (host.overSelf) host.overSelf();
  });
  root.addEventListener('dragleave', function (e) { if (!root.contains(e.relatedTarget)) root.classList.remove('drop'); });
  root.addEventListener('drop', function (e) {
    if (A.libDrag) { e.preventDefault(); e.stopPropagation(); return; }
    if (!filesDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    root.classList.remove('drop');
    addFolders(Array.prototype.slice.call(e.dataTransfer.files || []).map(function (f) { return api.pathOf(f); }).filter(Boolean));
  });
})(window.MW.app);
