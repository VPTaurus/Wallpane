// The library in the page:
// - the drawer over the wall (Library in the bar, Ctrl+L): search, kinds and filters, the library folders, thumbnails in
//   even rows (only the rows on screen exist in the page), sorting, selecting, and dragging onto the wall (which then
//   does what a drop from Explorer does; Shift makes a tile play several files in turn);
// - Settings › Library: the library folders, with Add folder…, Look again and Remove.
// The library itself (lib/library.js), its folders (lib/libraryfolders.js) and thumbnails (lib/thumbs.js) live in the
// main process.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, J = MW.justify, U = MW.util;
  var $ = A.$, api = A.api, S = A.S, ICON = A.ICON;

  function count(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function nameOf(p) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }
  function status(f) {
    if (f.scanning) return 'Looking through it…';
    if (f.available === false) return 'Not found. Is its drive connected? Its ' + count(f.files, 'file stays', 'files stay') + ' in the library meanwhile.';
    return count(f.files, 'file', 'files') + (f.pending ? ' · reading the details of ' + f.pending.toLocaleString('en') : '');
  }
  // Adds folders to the library one after another, and says how it went.
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

  /* ---------- Settings › Library ---------- */
  // Remove takes two clicks: the first arms it for three seconds. Kept here, as the list is drawn again often.
  var armed = null, disarm = 0;
  function show(list) {
    var box = $('#libFolders');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="note">No folders yet. Add the folders where you keep your videos, GIFs and pictures.</p>'; return; }
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'jrow lrow' + (f.available === false ? ' off' : '') + (f.scanning ? ' busy' : '');
      row.innerHTML = '<span class="ic" aria-hidden="true">' + ICON.folder + '</span><div class="jtext"><b></b><small class="lpath"></small><small class="lstat"></small></div>' +
        '<button class="btn warn" type="button"><span class="lbl"></span></button>';
      row.querySelector('b').textContent = nameOf(f.path);
      row.querySelector('.lpath').textContent = f.path;
      row.querySelector('.lstat').textContent = status(f);
      var b = row.querySelector('button'), on = armed === f.path;
      b.querySelector('.lbl').textContent = on ? 'Click again to remove' : 'Remove';
      b.classList.toggle('armed', on);
      b.title = 'Take ' + nameOf(f.path) + ' out of the library (its files stay where they are)';
      b.addEventListener('click', function () {
        clearTimeout(disarm);
        if (armed !== f.path) {
          armed = f.path;
          disarm = setTimeout(function () { armed = null; A.refreshLibrary(); }, 3000);
          show(list);
          return;
        }
        armed = null;
        api.removeLibraryFolder(f.path).then(function (n) {
          A.refreshLibrary();
          if (n >= 0) A.toast(nameOf(f.path) + ' is out of the library (' + count(n, 'file', 'files') + '). The files themselves are still there.');
        });
      });
      box.appendChild(row);
    });
  }
  A.refreshLibrary = function () { api.libraryFolders().then(show); };

  $('#libAdd').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    api.addLibraryFolder().then(function (r) {
      b.disabled = false;
      if (!r) return;
      api.libraryFolders().then(function (list) {
        show(list);
        if (r.status === 'inside') { A.toast('That folder is in the library already, as part of ' + nameOf(r.path) + '.'); return; }
        if (r.status !== 'added') { A.toast('That folder is not there any more.'); return; }
        var f = list.filter(function (x) { return x.path === r.path; })[0];
        A.toast('Added ' + nameOf(r.path) + ': ' + count(f ? f.files : 0, 'video, GIF or picture', 'videos, GIFs and pictures') + '.' +
          (r.took.length ? ' It takes in ' + count(r.took.length, 'library folder', 'library folders') + ' inside it.' : ''));
      });
    }, function () { b.disabled = false; });
  });
  $('#libRescan').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    api.rescanLibrary().then(function (list) { b.disabled = false; show(list); }, function () { b.disabled = false; });
  });

  /* ---------- the drawer ---------- */
  var drawer = $('#lib'), grid = $('#libGrid'), space = $('#libSpace'), emptyBox = $('#libEmpty'), folderBox = $('#libFolderList');
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
    if (drawer.hidden) return;
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
    if (drawer.hidden) return;
    api.libraryFolders().then(function (list) {
      folders = list;
      if (S.lib.folder && !list.some(function (f) { return f.path === S.lib.folder; })) { S.lib.folder = null; refresh(); }
      drawFolders();
      showCounts();
    });
  }

  A.libraryOpen = function () { return !drawer.hidden; };
  // Opens or closes the drawer (on: true or false; nothing turns it round). Opening puts the cursor in the search.
  A.toggleLibrary = function (on) {
    on = on === undefined ? drawer.hidden : !!on;
    if (on && document.body.classList.contains('clean')) return;
    var was = !drawer.hidden;
    drawer.hidden = !on;
    $('#libBtn').setAttribute('aria-pressed', String(on));
    if (S.lib.open !== on) { S.lib.open = on; A.savePrefs(); }
    if (on && !was) {
      thumbs.clear(); asked.clear();   // thumbnails may have been made again or cleaned since
      drawer.style.setProperty('--libw', S.lib.w + 'px');
      refreshFolders(); refresh();
    }
    if (on) $('#libSearch').focus();
  };
  // After the saved settings are read: the drawer as it was left.
  A.initLibrary = function () {
    var l = S.lib;
    Array.prototype.forEach.call(document.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', String(l.kinds.indexOf(b.dataset.kind) > -1)); });
    $('#libShape').value = l.shape; $('#libLength').value = l.length; $('#libRes').value = l.res; $('#libCopy').checked = l.copy;
    $('#libSort').value = l.sort; $('#libRev').setAttribute('aria-pressed', String(l.rev)); $('#libSize').value = l.size;
    showFilterCount(); showSortButtons();
    if (l.open) A.toggleLibrary(true);
  };
  $('#libBtn').addEventListener('click', function () { A.closePops(); A.toggleLibrary(); });
  $('#libClose').addEventListener('click', function () { A.toggleLibrary(false); });
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
  Array.prototype.forEach.call(document.querySelectorAll('.lkinds .chip'), function (b) {
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
    Array.prototype.forEach.call(document.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', 'false'); });
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

  /* ---------- the folders ---------- */
  function drawFolders() {
    folderBox.innerHTML = '';
    folderBox.hidden = !folders.length;
    if (!folders.length) return;
    var all = folders.reduce(function (s, f) { return s + f.files; }, 0);
    [{ path: null, files: all }].concat(folders).forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lfolder' + (f.available === false ? ' off' : '');
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-current', String(S.lib.folder === f.path));
      b.innerHTML = '<span class="ic" aria-hidden="true">' + (f.path ? ICON.folder : ICON.library) + '</span><span class="lfname"></span><span class="lnumr"></span>';
      b.querySelector('.lfname').textContent = f.path ? nameOf(f.path) + (f.available === false ? ' (not found)' : '') : 'All folders';
      b.querySelector('.lnumr').textContent = f.scanning ? '…' : f.files.toLocaleString('en');
      if (f.path) {
        b.title = f.path + '\nDrag onto the wall: a tile plays this folder, or the empty tiles do.';
        b.draggable = true;
        b.addEventListener('dragstart', function (e) { dragOut(e, [f.path]); });
      }
      b.addEventListener('click', function () {
        if (S.lib.folder === f.path) return;
        S.lib.folder = f.path;
        drawFolders(); changed();
      });
      folderBox.appendChild(b);
    });
  }
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
  new ResizeObserver(function () { if (!drawer.hidden && grid.clientWidth !== laidWidth) relayout(); }).observe(grid);

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
    if (!$('#popS').hidden && !$('#secLibrary').hidden) A.refreshLibrary();
    if (drawer.hidden || changeTimer) return;
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
    if (el) putOnWall([results[index.get(el.dataset.id)].path]);
  });
  grid.addEventListener('contextmenu', function (e) {
    var el = e.target.closest('.lthumb');
    if (!el) return;
    e.preventDefault();
    if (!sel.has(el.dataset.id)) pick({}, el.dataset.id);
    var paths = selectedPaths(), n = paths.length, it = A.selected(), tile = it && !it.sample ? it : null;
    A.showMenu(e.clientX, e.clientY, [
      { label: n > 1 ? 'Put these ' + n + ' on the wall' : 'Put on the wall', icon: 'plus', hint: n === 1 && tile ? 'On the selected tile' : 'Into the empty tiles first, then new ones', act: function () { putOnWall(paths); } },
      { label: n > 1 ? 'Play them in turn on the selected tile' : 'Show on the selected tile', icon: n > 1 ? 'playlist' : 'tile', disabled: !tile, hint: tile ? '' : 'Select a tile on the wall first', act: function () { onTile(tile, paths); } },
      '-',
      { label: 'Show in Explorer', icon: 'folder', disabled: n !== 1, act: function () { api.revealFile(paths[0]); } }
    ]);
  });

  /* ---------- to the wall ---------- */
  // Double-click, Enter or the menu: one file goes on the selected tile; otherwise into the empty tiles, then new ones.
  function putOnWall(paths) {
    if (!paths.length) return;
    var it = A.selected();
    if (paths.length === 1 && it && !it.sample) { onTile(it, paths); return; }
    api.expand(paths).then(function (res) { A.addFiles(res, null); });
  }
  // One file shows on the tile; several play there in turn.
  function onTile(it, paths) {
    api.expand(paths).then(function (res) {
      var f = res.entries[0];
      if (!f) { A.toast(A.noMediaMessage(res)); return; }
      if (res.entries.length > 1) { res.title = count(res.entries.length, 'file', 'files') + ' from the library'; A.assignFolder(it, res); return; }
      A.pushHistory(); A.replaceMedia(it, f);
      if (it.pl) { it.pinned = true; it.loop = true; }
      A.render(); A.refreshInspector();
      A.toast(f.name + ' is on the selected tile now. Ctrl+Z undoes it.');
    });
  }
  // Dragging files or a folder out: the wall takes them as it takes a drop from Explorer (ui/media.js). The drawer
  // fades and lets the drop through, so a tile under it can take it too.
  function dragOut(e, paths) {
    e.dataTransfer.setData(A.LIB_TYPE, JSON.stringify(paths));
    e.dataTransfer.effectAllowed = 'copy';
    A.libDrag = { n: paths.length };
    setTimeout(function () { drawer.classList.add('out'); }, 0);
  }
  grid.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('.lthumb');
    if (!el) return;
    if (!sel.has(el.dataset.id)) pick({}, el.dataset.id);
    dragOut(e, selectedPaths());
  });
  drawer.addEventListener('dragend', function () { drawer.classList.remove('out'); A.libDrag = null; });

  // Folders dropped from Explorer onto the drawer join the library.
  function filesDrag(e) { return !A.libDrag && Array.prototype.indexOf.call((e.dataTransfer && e.dataTransfer.types) || [], 'Files') > -1; }
  drawer.addEventListener('dragover', function (e) {
    if (!filesDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    drawer.classList.add('drop');
    A.hideGhost(); A.wall.classList.remove('hot');
  });
  drawer.addEventListener('dragleave', function (e) { if (!drawer.contains(e.relatedTarget)) drawer.classList.remove('drop'); });
  drawer.addEventListener('drop', function (e) {
    if (!filesDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    drawer.classList.remove('drop');
    addFolders(Array.prototype.slice.call(e.dataTransfer.files || []).map(function (f) { return api.pathOf(f); }).filter(Boolean));
  });

  /* ---------- keys and width ---------- */
  // Keys in the drawer stay there (Delete, arrows and Space must not reach the wall's selected tile). Esc clears the
  // search, then the selection, then closes the drawer; Ctrl+A selects everything shown; Enter puts the selection on
  // the wall. Ctrl+L, Ctrl+Z, Ctrl+Y and F11 still work everywhere.
  drawer.addEventListener('keydown', function (e) {
    var k = String(e.key).toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'F11' || (ctrl && (k === 'l' || k === 'z' || k === 'y'))) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (e.target.id === 'libSearch' && e.target.value) return;   // the search box empties itself
      if (sel.size) { sel.clear(); anchor = -1; paintSel(); return; }
      A.toggleLibrary(false);
      return;
    }
    if (e.target !== grid) return;
    if (ctrl && k === 'a') { e.preventDefault(); results.forEach(function (it) { sel.add(it.id); }); paintSel(); }
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); putOnWall(selectedPaths()); }
  });
  $('#libResize').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var h = this, left = drawer.getBoundingClientRect().left, max = drawer.parentElement.clientWidth - 40;
    h.setPointerCapture(e.pointerId);
    function move(ev) {
      S.lib.w = Math.round(U.clamp(ev.clientX - left, 260, Math.max(260, max)));
      drawer.style.setProperty('--libw', S.lib.w + 'px');
    }
    function up() { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); A.savePrefs(); }
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
  });
})(window.MW.app);
