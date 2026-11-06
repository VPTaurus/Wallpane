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
//   play(what, onTile)  a library folder ({ dir }), collection ({ coll, name }) or list of files ({ files, name }) plays
//                       on the wall as a playlist; playHint says where. tile() gives the selected tile (the page only),
//                       and then onTile plays it there.
// It gives A.libView: { show() (fill it as it opens), refresh(), cleanPrefs(saved) }.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, J = MW.justify, U = MW.util;
  var $ = A.$, api = A.api, S = A.S, ICON = A.ICON, host = A.libHost;

  function count(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function nameOf(p) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }

  // The view's settings, from what was saved (anything odd falls back to the default).
  // folder or coll: what it shows (one library folder, or one collection); sort for folders, csort in a collection.
  // tags: only files with every one of these tags (the tag chips; tag, one tag shown instead of a folder before 1.7.1,
  // becomes one). fav, stars: only favourites, only files with at least so many stars.
  // side: right by default, beside the Library button; sideSet: chosen by hand (before 1.6.1 the left was saved
  // without a choice, so such a wall follows the default).
  var DEFAULTS = { place: 'drawer', side: 'right', sideSet: false, open: false, w: 400, size: 110, sort: 'name', csort: 'order', rev: false, kinds: [], shape: '', length: '', res: '', copy: false, fav: false, stars: 0, folder: null, coll: null, tags: [] };
  var SORTS = ['added', 'changed', 'length', 'size', 'rating', 'random'];
  function cleanPrefs(l) {
    var one = function (v, list) { return list.indexOf(v) > -1 ? v : ''; };
    if (!l || typeof l !== 'object') return Object.assign({}, DEFAULTS);
    return {
      place: one(l.place, ['panel', 'window']) || 'drawer', side: l.sideSet === true && l.side === 'left' ? 'left' : 'right', sideSet: l.sideSet === true, open: l.open === true,
      w: U.clamp(+l.w || 400, 260, 4000), size: U.clamp(+l.size || 110, 60, 240),
      sort: one(l.sort, SORTS) || 'name', csort: one(l.csort, SORTS.concat('name')) || 'order', rev: l.rev === true,
      kinds: (Array.isArray(l.kinds) ? l.kinds : []).filter(function (k) { return ['video', 'gif', 'image'].indexOf(k) > -1; }),
      shape: one(l.shape, ['landscape', 'portrait', 'square']), length: one(l.length, ['short', 'medium', 'long']),
      res: one(l.res, ['sd', 'hd', 'fhd', '4k']), copy: l.copy === true, fav: l.fav === true, stars: U.clamp(Math.round(+l.stars) || 0, 0, 5),
      folder: typeof l.folder === 'string' && l.folder ? l.folder : null,
      coll: typeof l.coll === 'string' && l.coll ? l.coll : null,
      tags: (Array.isArray(l.tags) ? l.tags : typeof l.tag === 'string' && l.tag ? [l.tag] : []).filter(function (t) { return typeof t === 'string' && t; }).slice(0, 50)
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
    '<div class="ltagchips" id="libTags" role="group" aria-label="Only files with these tags" hidden></div>' +
    '<div class="lfilt" id="libFilt" hidden>' +
      '<select id="libShape" aria-label="Shape"><option value="">Any shape</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square</option></select>' +
      '<select id="libLength" aria-label="Length"><option value="">Any length</option><option value="short">Under 30 s</option><option value="medium">30 s to 5 min</option><option value="long">Over 5 min</option></select>' +
      '<select id="libRes" aria-label="Resolution"><option value="">Any resolution</option><option value="sd">Below HD</option><option value="hd">HD</option><option value="fhd">Full HD</option><option value="4k">4K and up</option></select>' +
      '<select id="libStars" aria-label="Rating"><option value="0">Any rating</option><option value="1">★ and up</option><option value="2">★★ and up</option><option value="3">★★★ and up</option><option value="4">★★★★ and up</option><option value="5">★★★★★</option></select>' +
      '<label class="check"><input type="checkbox" id="libFav"><span>Favourites only</span></label>' +
      '<label class="check"><input type="checkbox" id="libCopy"><span>Needs a playable copy</span></label>' +
      '<button class="btn" id="libFiltClear" type="button">Clear filters</button></div>' +
    '<div class="lfolderpick" id="libFolderPick">' +
      '<button type="button" class="lfolderbtn" id="libFolderBtn" aria-haspopup="true" aria-expanded="false" aria-controls="libFolderList" title="Show one library folder, or all of them">' +
        '<span class="ic" id="libFolderIc"></span><span class="lfname" id="libFolderName"></span><span class="lnumr" id="libFolderNum"></span><span class="ic">' + ICON.chev + '</span></button>' +
      '<button type="button" class="btn ib" id="libPlay" aria-label="Play this folder on the wall as a playlist" hidden><span class="ic">' + ICON.playlist + '</span></button>' +
      '<div class="lfolders" id="libFolderList" role="list" aria-label="Library folders" hidden></div></div>' +
    '<div class="ltagbox" id="libTagBox" role="dialog" aria-labelledby="libTagTitle" hidden>' +
      '<div class="ltbhead"><span class="ic">' + ICON.hash + '</span><b id="libTagTitle"></b><button class="btn ib" id="libTagClose" type="button" aria-label="Done with tags" title="Done (Esc)"><span class="ic">' + ICON.x + '</span></button></div>' +
      '<div class="ltbchips" id="libTagHave" data-empty="No tags yet."></div>' +
      '<input id="libTagInput" type="text" list="libTagNames" maxlength="40" spellcheck="false" autocomplete="off" placeholder="Type a tag, then Enter" aria-label="A tag to give them">' +
      '<datalist id="libTagNames"></datalist>' +
      '<span class="ltblab" id="libTagOtherLab">Other tags</span><div class="ltbchips" id="libTagOther"></div></div>' +
    '<div class="lgrid" id="libGrid" tabindex="0" role="listbox" aria-label="Files" aria-multiselectable="true"><div class="lspace" id="libSpace"></div><div class="lempty" id="libEmpty" hidden></div></div>' +
    '<div class="lfoot"><span class="lshown" id="libShown"></span><span class="sp"></span>' +
      '<select id="libSort" aria-label="Sort by"><option value="order">Collection order</option><option value="name">Name</option><option value="added">Date added</option><option value="changed">Date changed</option><option value="length">Length</option><option value="size">File size</option><option value="rating">Rating</option><option value="random">Random</option></select>' +
      '<button class="btn ib" id="libRev" type="button" aria-pressed="false" aria-label="Reverse the order" title="Reverse the order"><span class="ic">' + ICON.sortdir + '</span></button>' +
      '<button class="btn ib" id="libShuffle" type="button" aria-label="Shuffle again" title="Shuffle again" hidden><span class="ic">' + ICON.shuffle + '</span></button>' +
      '<input type="range" id="libSize" min="60" max="240" step="10" aria-label="Thumbnail size" title="Thumbnail size"></div>' +
    '<div class="lresize" id="libResize" title="Drag to make the library wider or narrower"></div>';

  var grid = $('#libGrid'), space = $('#libSpace'), emptyBox = $('#libEmpty'), folderBox = $('#libFolderList'), folderPick = $('#libFolderPick');
  var GAP = 4;
  var results = [], index = new Map(), total = 0, folders = [], colls = [], tagList = [], layout = { rows: [], boxes: [], height: 0 };
  var els = new Map();       // id -> thumbnail element on screen
  var thumbs = new Map();    // id -> thumbnail URL
  var asked = new Set();     // ids whose thumbnails were asked for
  var sel = new Set(), anchor = -1;
  var seq = 0, text = '', seed = 1, laidWidth = 0;

  function sortNow() { return S.lib.coll ? S.lib.csort : S.lib.sort; }
  function query() {
    var l = S.lib;
    return { text: text, folder: l.coll ? null : l.folder, collection: l.coll, tags: l.tags, kinds: l.kinds, shape: l.shape, length: l.length, res: l.res, needsCopy: l.copy, fav: l.fav, stars: l.stars, sort: sortNow(), reverse: l.rev, seed: seed };
  }
  function filtering() { var l = S.lib; return !!(text.trim() || l.kinds.length || l.shape || l.length || l.res || l.copy || l.fav || l.stars || l.folder || l.coll || l.tags.length); }
  function collNow() { return S.lib.coll ? colls.filter(function (c) { return c.id === S.lib.coll; })[0] || null : null; }
  // A tag chip is on: the view shows only files with that tag (and the other tags on).
  function tagOn(name) { var k = String(name).toLowerCase(); return S.lib.tags.some(function (t) { return t.toLowerCase() === k; }); }
  function setTag(name, on) {
    var k = String(name).toLowerCase();
    S.lib.tags = S.lib.tags.filter(function (t) { return t.toLowerCase() !== k; }).concat(on ? [name] : []);
  }
  // Dragging inside a collection changes its order: when it shows in its own order, not reversed.
  function canReorder() { return !!S.lib.coll && S.lib.csort === 'order' && !S.lib.rev; }
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
      playTitle();
    });
  }
  function refreshFolders() {
    if (!host.isOpen()) return;
    Promise.all([api.libraryFolders(), api.libraryCollections(), api.libraryTags()]).then(function (got) {
      folders = got[0]; colls = got[1] || []; tagList = got[2] || [];
      var gone = (S.lib.folder && !folders.some(function (f) { return f.path === S.lib.folder; })) || (S.lib.coll && !collNow());
      if (gone) { S.lib.folder = null; S.lib.coll = null; showSortButtons(); refresh(); }
      // A tag no file has any more lets go; one renamed elsewhere goes by its new spelling.
      var left = S.lib.tags.map(function (t) { var k = t.toLowerCase(); return (tagList.filter(function (x) { return x.name.toLowerCase() === k; })[0] || {}).name; }).filter(Boolean);
      if (left.join('\n') !== S.lib.tags.join('\n')) { S.lib.tags = left; A.savePrefs(); refresh(); }
      drawTagChips();
      if (!editing) drawFolders();   // never under a name being typed
      showCounts();
    });
  }
  // As the view opens: its settings into the controls, and everything fetched afresh (thumbnails may have been made
  // again or cleaned since).
  function show() {
    var l = S.lib;
    Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', String(l.kinds.indexOf(b.dataset.kind) > -1)); });
    $('#libShape').value = l.shape; $('#libLength').value = l.length; $('#libRes').value = l.res; $('#libCopy').checked = l.copy;
    $('#libStars').value = String(l.stars); $('#libFav').checked = l.fav;
    $('#libRev').setAttribute('aria-pressed', String(l.rev)); $('#libSize').value = l.size;
    showFilterCount(); showSortButtons();
    root.style.setProperty('--libw', l.w + 'px');
    thumbs.clear(); asked.clear();
    refreshFolders(); refresh();
  }
  A.libView = { show: show, refresh: function () { refreshFolders(); refresh(); }, cleanPrefs: cleanPrefs };
  if (S.lib) S.lib = cleanPrefs(S.lib);   // the page's starting settings, completed with any newer ones

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
  function changed() { A.savePrefs(); grid.scrollTop = 0; refresh(); playTitle(); }
  // The kinds of file picked (Videos / GIFs / Pictures), or null for all: a folder or collection played on the wall
  // plays only those. kindsText says so after a hint.
  function kindsNow() { return S.lib.kinds.length ? S.lib.kinds.slice() : null; }
  function kindsText() {
    var k = kindsNow(), w = k && ['video', 'gif', 'image'].filter(function (x) { return k.indexOf(x) > -1; }).map(function (x) { return { video: 'videos', gif: 'GIFs', image: 'pictures' }[x]; });
    return w ? ' · ' + w.join(' and ').replace(/^./, function (s) { return s.toUpperCase(); }) + ' only' : '';
  }
  // Filters beyond which folder or collection shows and the kinds of file: search words, tags, shape, length,
  // resolution, needs a copy, favourites, rating.
  function narrowed() { var l = S.lib; return !!(text.trim() || l.tags.length || l.shape || l.length || l.res || l.copy || l.fav || l.stars); }
  // What the view shows is one whole folder or collection (the kinds aside): Play then plays that, and follows it.
  function wholeNow() { return !narrowed() && (collNow() || S.lib.folder) ? true : false; }
  // "Holidays · Beach, Sunset": the folder or collection shown and the tags on, the name a playlist of them gets.
  function viewName() {
    var c = collNow(), base = c ? c.name : S.lib.folder ? nameOf(S.lib.folder) : S.lib.tags.length ? '' : 'Library';
    return [base, S.lib.tags.join(', ')].filter(Boolean).join(' · ');
  }
  // The tag chips: every tag in use, a click turning it on or off; with several on, only files with all of them show,
  // in the folder or collection shown and with the other filters. Right-click to rename or delete one.
  function drawTagChips() {
    var box = $('#libTags');
    box.hidden = !tagList.length;
    box.innerHTML = '';
    tagList.forEach(function (x) {
      var b = document.createElement('button'), on = tagOn(x.name);
      b.type = 'button'; b.className = 'chip'; b.dataset.tag = x.name;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = x.name;
      b.title = x.name + ': ' + count(x.files, 'file', 'files') + '\n' + (on ? 'Click to show files without it too' : 'Click to show only files with this tag') + '\nRight-click to rename or delete it';
      b.addEventListener('click', function () { setTag(x.name, !tagOn(x.name)); drawTagChips(); drawFolders(); changed(); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); tagMenu(x, e.clientX, e.clientY); });
      box.appendChild(b);
    });
  }
  // The button beside the folder row plays what the library shows: while that is one whole folder or collection, it
  // (as its menu does); else the very files shown, in their order.
  function playTitle() {
    var c = collNow(), whole = wholeNow(), n = results.length;
    var label = whole ? 'Play this ' + (c ? 'collection' : 'folder') + ' on the wall as a playlist' : 'Play the ' + count(n, 'file', 'files') + ' shown on the wall as a playlist';
    $('#libPlay').title = label + ': ' + host.playHint + (whole ? kindsText() : '');
    $('#libPlay').setAttribute('aria-label', label);
    $('#libPlay').disabled = !n;
  }
  // Plays on the wall as a playlist: target { dir } or { coll, name } (a folder's or collection's menu), or null for what
  // the library shows (the button). With no filters but the kinds, the folder or collection itself, which the playlist
  // then follows, playing only those kinds; else the files the library finds with the filters as they are, in its
  // order, as a list of their own (one that does not follow).
  function playWhat(target, onTile) {
    var k = kindsNow(), c = collNow();
    if (!narrowed() && (target || wholeNow())) {
      host.play(Object.assign({ kinds: k }, target || (c ? { coll: c.id, name: c.name } : { dir: S.lib.folder })), onTile);
      return;
    }
    var q = query();
    if (target) { q.folder = target.dir || null; q.collection = target.coll || null; q.tag = null; }
    (target ? api.queryLibrary(q) : Promise.resolve({ items: results })).then(function (r) {
      host.play({ files: r.items.map(function (e) { return { path: e.path, name: e.name, kind: e.kind }; }), name: target ? target.name || nameOf(target.dir) : viewName() }, onTile);
    });
  }
  Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.kind, on = S.lib.kinds.indexOf(k) < 0;
      S.lib.kinds = on ? S.lib.kinds.concat(k) : S.lib.kinds.filter(function (x) { return x !== k; });
      b.setAttribute('aria-pressed', String(on));
      changed();
    });
  });
  function showFilterCount() {
    var l = S.lib, n = (l.shape ? 1 : 0) + (l.length ? 1 : 0) + (l.res ? 1 : 0) + (l.copy ? 1 : 0) + (l.fav ? 1 : 0) + (l.stars ? 1 : 0), el = $('#libFiltN');
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
  $('#libFav').addEventListener('change', function () { S.lib.fav = this.checked; showFilterCount(); changed(); });
  $('#libStars').addEventListener('change', function () { S.lib.stars = +this.value || 0; showFilterCount(); changed(); });
  $('#libFiltClear').addEventListener('click', function () {
    S.lib.shape = ''; S.lib.length = ''; S.lib.res = ''; S.lib.copy = false; S.lib.fav = false; S.lib.stars = 0;
    $('#libShape').value = ''; $('#libLength').value = ''; $('#libRes').value = ''; $('#libCopy').checked = false; $('#libFav').checked = false; $('#libStars').value = '0';
    showFilterCount(); changed();
  });
  function clearAll() {
    $('#libSearch').value = ''; text = '';
    S.lib.kinds = []; S.lib.folder = null; S.lib.coll = null; S.lib.tags = [];
    Array.prototype.forEach.call(root.querySelectorAll('.lkinds .chip'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('#libFiltClear').click();
    showSortButtons(); drawTagChips(); drawFolders();
  }
  // The sort list offers "Collection order" only in a collection, which keeps its own sort.
  function showSortButtons() {
    var s = $('#libSort'), rnd = sortNow() === 'random';
    s.querySelector('[value="order"]').hidden = !S.lib.coll;
    s.value = sortNow();
    $('#libShuffle').hidden = !rnd; $('#libRev').hidden = rnd;
  }
  $('#libSort').addEventListener('change', function () {
    if (S.lib.coll) S.lib.csort = this.value; else S.lib.sort = this.value;
    showSortButtons(); changed();
  });
  $('#libRev').addEventListener('click', function () { S.lib.rev = !S.lib.rev; this.setAttribute('aria-pressed', String(S.lib.rev)); changed(); });
  $('#libShuffle').addEventListener('click', function () { seed++; grid.scrollTop = 0; refresh(); });
  var sizeSave = 0;
  $('#libSize').addEventListener('input', function () {
    S.lib.size = +this.value;
    relayout();
    clearTimeout(sizeSave); sizeSave = setTimeout(A.savePrefs, 400);
  });

  /* ---------- the folders, collections and tags: one row that says which shows, and opens the list of them ---------- */
  function folderLabel(f) { return f.path ? nameOf(f.path) + (f.available === false ? ' (not found)' : '') : 'All folders'; }
  // What is being named in the list: a collection's id ('new' for a new one), 'tag:' and a tag's name, or null.
  var editing = null;
  function show1(folder, coll) {
    openFolders(false);
    $('#libFolderBtn').focus();
    if (S.lib.folder === folder && S.lib.coll === coll) return;
    S.lib.folder = folder; S.lib.coll = coll;
    showSortButtons(); drawFolders(); changed();
  }
  function row(icon, label, num, current, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'lfolder' + (cls ? ' ' + cls : '');
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-current', String(!!current));
    b.innerHTML = '<span class="ic" aria-hidden="true">' + ICON[icon] + '</span><span class="lfname"></span><span class="lnumr"></span>';
    b.querySelector('.lfname').textContent = label;
    b.querySelector('.lnumr').textContent = num;
    folderBox.appendChild(b);
    return b;
  }
  // A name box in the list, for a new collection or a new name (of a collection or a tag). Enter keeps it, Esc lets it be.
  function nameBox(value, done, what) {
    var box = document.createElement('input');
    box.type = 'text'; box.className = 'lfinput'; box.value = value; box.maxLength = what === 'tag' ? 40 : 60; box.spellcheck = false;
    box.placeholder = what === 'tag' ? 'Name of the tag' : 'Name of the collection';
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); editing = null; done(box.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing = null; drawFolders(); $('#libFolderBtn').focus(); }
    });
    // Clicking away keeps a name typed; an empty new one is let be.
    box.addEventListener('blur', function () {
      if (!editing) return;
      editing = null;
      if (box.value.trim() || value) done(box.value); else drawFolders();
    });
    folderBox.appendChild(box);
    setTimeout(function () { box.focus(); box.select(); }, 0);
  }
  function drawFolders() {
    folderBox.innerHTML = '';
    folderPick.hidden = !folders.length;
    if (!folders.length) { openFolders(false); return; }
    var all = { path: null, files: folders.reduce(function (s, f) { return s + f.files; }, 0) };
    var c = collNow(), f1 = folders.filter(function (f) { return f.path === S.lib.folder; })[0], now = c ? null : f1 || all;
    $('#libFolderIc').innerHTML = c ? ICON.playlist : now.path ? ICON.folder : ICON.library;
    $('#libFolderName').textContent = c ? c.name : folderLabel(now);
    $('#libFolderNum').textContent = c ? c.files.toLocaleString('en') : now.scanning ? '…' : now.files.toLocaleString('en');
    $('#libFolderBtn').classList.toggle('off', !!now && now.available === false);
    $('#libFolderBtn').classList.toggle('one', !!(c || now.path));
    // Beside it: what the library shows plays on the wall as a playlist (playWhat).
    $('#libPlay').hidden = !host.play;
    playTitle();
    [all].concat(folders).forEach(function (f) {
      var b = row(f.path ? 'folder' : 'library', folderLabel(f), f.scanning ? '…' : f.files.toLocaleString('en'), !S.lib.coll && S.lib.folder === f.path, f.available === false ? 'off' : '');
      if (f.path) {
        b.title = f.path + '\nDrag onto the wall: a tile plays this folder, or the empty tiles do.' + (host.play ? '\nRight-click to play it on the wall as a playlist.' : '');
        b.draggable = true;
        b.addEventListener('dragstart', function (e) { host.dragOut(e, [f.path], {}); });
        b.addEventListener('dragend', function () { openFolders(false); });
        if (host.play) b.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); folderMenu(f, e.clientX, e.clientY); });
      }
      b.addEventListener('click', function () { show1(f.path, null); });
    });
    var head = document.createElement('div');
    head.className = 'lfhead'; head.textContent = 'Collections';
    folderBox.appendChild(head);
    colls.forEach(function (x) {
      if (editing === x.id) { nameBox(x.name, function (v) { api.editCollection('rename', x.id, v).then(refreshFolders); }); return; }
      var b = row('playlist', x.name, x.files.toLocaleString('en'), S.lib.coll === x.id, 'coll');
      b.dataset.coll = x.id;
      b.title = x.name + '\nDrop files here to add them.' + (host.dragCollections ? ' Drag it onto the wall: a tile plays it, and follows it as it changes.' : '') +
        '\nRight-click to ' + (host.play ? 'play it on the wall as a playlist, ' : '') + 'rename or delete it.';
      if (host.dragCollections) {
        b.draggable = true;
        b.addEventListener('dragstart', function (e) { host.dragOut(e, null, { coll: x.id, name: x.name }); });
        b.addEventListener('dragend', function () { openFolders(false); });
      }
      b.addEventListener('click', function () { show1(null, x.id); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); collMenu(x, e.clientX, e.clientY); });
    });
    if (editing === 'new') {
      nameBox('', function (v) {
        api.editCollection('make', v, []).then(function (c2) { colls.push(c2); show1(null, c2.id); refreshFolders(); });
      });
    } else {
      var add = row('plus', 'New collection', '', false, 'newcoll');
      add.addEventListener('click', function () { editing = 'new'; drawFolders(); });
    }
    // Tags: the same as the tag chips (a click turns one on or off, with the folder or collection kept); right-click to
    // rename or delete one, renamed right here. New tags are given to files (Tags…).
    if (!tagList.length) return;
    var th = document.createElement('div');
    th.className = 'lfhead'; th.textContent = 'Tags';
    folderBox.appendChild(th);
    tagList.forEach(function (x) {
      if (editing === 'tag:' + x.name) {
        nameBox(x.name, function (v) {
          api.editTag('rename', x.name, v).then(function () {
            if (tagOn(x.name)) { setTag(x.name, false); setTag(v.replace(/\s+/g, ' ').trim() || x.name, true); A.savePrefs(); }
            refreshFolders(); refresh();
          });
        }, 'tag');
        return;
      }
      var b = row('hash', x.name, x.files.toLocaleString('en'), tagOn(x.name), 'tag');
      b.dataset.tag = x.name;
      b.title = x.name + '\n' + (tagOn(x.name) ? 'Click to show files without it too' : 'Click to show only files with this tag') + ', as its chip does.\nRight-click to rename or delete it.';
      b.addEventListener('click', function () {
        setTag(x.name, !tagOn(x.name));
        openFolders(false); $('#libFolderBtn').focus();
        drawTagChips(); drawFolders(); changed();
      });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); tagMenu(x, e.clientX, e.clientY); });
    });
  }
  // The items that play a folder ({ dir }: all its files, its subfolders' too) or a collection ({ coll, name }) on the
  // wall as a playlist, or on the selected tile, as the library's filters would show it (playWhat). no: why they cannot
  // (the folder is not found, the collection is empty).
  function playItems(what, no) {
    var tile = host.tile ? host.tile() : null, kind = what.coll ? 'collection' : 'folder', how = narrowed() ? ' · As the library filters it' : kindsText();
    return [
      { label: 'Play on the wall as a playlist', icon: 'playlist', hint: no || host.playHint + how, disabled: !!no, act: function () { openFolders(false); playWhat(what, false); } }
    ].concat(host.tile ? [
      { label: 'Play on the selected tile', icon: 'tile', hint: no ? '' : tile ? 'It plays the ' + kind + ' in turn' + how : 'Select a tile on the wall first', disabled: !!no || !tile, act: function () { openFolders(false); playWhat(what, true); } }
    ] : []);
  }
  function folderMenu(f, px, py) {
    var gone = f.available === false;
    A.showMenu(px, py, playItems({ dir: f.path }, gone ? 'The folder is not found' : '').concat([
      '-',
      { label: 'Show in Explorer', icon: 'folder', disabled: gone, act: function () { api.revealFile(f.path); } }
    ]));
  }
  $('#libPlay').addEventListener('click', function () { if (results.length) playWhat(null, false); });
  function tagMenu(x, px, py) {
    A.showMenu(px, py, [
      { label: 'Rename', icon: 'file', hint: 'Into a tag in use, the two become one', act: function () { editing = 'tag:' + x.name; openFolders(true); drawFolders(); } },
      { label: 'Delete…', icon: 'trash', hint: 'It comes off its files, which stay', act: function () {
        A.showMenu(px, py, [
          { label: 'Delete the tag "' + x.name + '"', icon: 'trash', hint: 'It comes off ' + count(x.files, 'file', 'files') + '; the files stay where they are', act: function () {
            api.editTag('drop', x.name).then(function () {
              if (tagOn(x.name)) { setTag(x.name, false); changed(); }
              A.toast('The tag "' + x.name + '" is deleted. Its files are still there.');
              refreshFolders(); refresh();
            });
          } },
          { label: 'Keep it', icon: 'x', act: function () {} }
        ]);
      } }
    ]);
  }
  function collMenu(x, px, py) {
    A.showMenu(px, py, (host.play ? playItems({ coll: x.id, name: x.name }, x.files ? '' : 'It has no files yet').concat('-') : []).concat([
      { label: 'Rename', icon: 'file', act: function () { editing = x.id; openFolders(true); drawFolders(); } },
      { label: 'Delete…', icon: 'trash', hint: 'Its files stay where they are', act: function () {
        A.showMenu(px, py, [
          { label: 'Delete "' + x.name + '"', icon: 'trash', hint: 'Its ' + count(x.files, 'file stays', 'files stay') + ' in the library and on the wall', act: function () {
            api.editCollection('drop', x.id).then(function () {
              if (S.lib.coll === x.id) { S.lib.coll = null; showSortButtons(); changed(); }
              A.toast('"' + x.name + '" is deleted. Its files are still there.');
              refreshFolders();
            });
          } },
          { label: 'Keep it', icon: 'x', act: function () {} }
        ]);
      } }
    ]));
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
    var msg = null, c = collNow();
    if (!folders.length) msg = 'empty';
    else if (!results.length && c && !c.files) msg = 'emptycoll';
    else if (!results.length) msg = filtering() ? 'nomatch' : (folders.some(function (f) { return f.scanning; }) ? 'looking' : 'nomedia');
    emptyBox.hidden = !msg;
    if (!msg) return;
    emptyBox.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = {
      empty: 'Your library is empty. Add the folders where you keep your videos, GIFs and pictures, or drop them here from Explorer.',
      emptycoll: '"' + (c && c.name) + '" is empty. Right-click files and choose Add to "' + (c && c.name) + '", or drag them onto it in the list above.',
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
  // Rows done again (another width, thumbnail size, or details) keep the first thumbnail on screen where it was, so the
  // view never jumps while scrolled down.
  var keep = null;   // { id, off }: the first thumbnail on screen, and how far it is scrolled past
  function relayout() {
    laidWidth = grid.clientWidth;
    layout = J.layout(results, laidWidth, S.lib.size, GAP);
    space.style.height = layout.height + 'px';
    var i = keep ? index.get(keep.id) : undefined;
    if (i !== undefined && layout.boxes[i] && grid.scrollTop > 0) grid.scrollTop = layout.boxes[i].y + Math.min(keep.off, layout.boxes[i].h);
    paint();
  }
  // A thumbnail on screen stays as it is (so it never flickers, or vanishes under the pointer) until its file's
  // details change.
  function sigOf(it) { return [it.name, it.path, it.kind, it.w, it.h, it.dur, it.stars, it.fav].join('|'); }
  function paint() {
    var top = grid.scrollTop, v = J.visible(layout.rows, top - 300, top + grid.clientHeight + 300), shown = new Set();
    var at = top > 0 ? J.visible(layout.rows, top, top) : null, first = at && layout.rows[at.first];
    keep = first && results[first.start] ? { id: results[first.start].id, off: top - first.y } : null;
    if (v) {
      for (var r = v.first; r <= v.last; r++) {
        var row = layout.rows[r];
        for (var i = row.start; i < row.end; i++) {
          var it = results[i], b = layout.boxes[i], el = els.get(it.id), sig = sigOf(it);
          if (el && el._sig !== sig) { el.remove(); els.delete(it.id); el = null; }
          if (!el) { el = make(it); el._sig = sig; els.set(it.id, el); space.appendChild(el); }
          el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
          shown.add(it.id);
        }
      }
    }
    els.forEach(function (el, id) { if (!shown.has(id)) { el.remove(); els.delete(id); } });
    askThumbs();
  }
  // Scroll events come at most once a frame, and drawing the rows on screen is quick: drawn at once.
  grid.addEventListener('scroll', paint);
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
    // Your marks: a heart in the top corner, the stars along the foot.
    if (it.fav) { var h = document.createElement('span'); h.className = 'lfav'; h.textContent = '♥'; h.title = 'Favourite'; el.appendChild(h); }
    if (it.stars) { var st = document.createElement('span'); st.className = 'lstars'; st.textContent = '★★★★★'.slice(0, it.stars); st.title = it.stars + (it.stars === 1 ? ' star' : ' stars'); el.appendChild(st); }
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

  /* ---------- hover previews ---------- */
  // While the pointer rests on a video's thumbnail, it plays a few seconds of the video (a small clip lib/previews.js
  // makes the first time; a thin bar runs along the thumbnail's foot meanwhile); a GIF's plays the GIF. Settings ›
  // Library can turn them off (the main process then answers with nothing).
  var HOVER = 400, hoverEl = null, hoverTimer = 0, preview = null;
  function stopPreview() {
    clearTimeout(hoverTimer); hoverTimer = 0;
    if (hoverEl) hoverEl.classList.remove('lwait');
    hoverEl = null;
    if (!preview) return;
    if (preview.tagName === 'VIDEO') { preview.removeAttribute('src'); preview.load(); }   // stops decoding at once
    preview.remove(); preview = null;
  }
  function startPreview(el) {
    stopPreview();
    var it = results[index.get(el.dataset.id)];
    if (!it || (it.kind !== 'video' && it.kind !== 'gif')) return;
    hoverEl = el;
    hoverTimer = setTimeout(function () {
      hoverTimer = 0;
      if (it.kind === 'video') el.classList.add('lwait');
      api.libraryPreview(it.id).then(function (r) {
        if (hoverEl !== el) return;
        el.classList.remove('lwait');
        if (!r || !el.isConnected) return;
        var m = r.kind === 'gif' ? new Image() : document.createElement('video');
        m.className = 'lprev'; m.draggable = false;
        if (m.tagName === 'VIDEO') { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; } else m.alt = '';
        m.addEventListener('error', function () { if (preview === m) { m.remove(); preview = null; } });
        m.src = U.fileUrl(r.path);
        el.insertBefore(m, el.querySelector('.lbadge'));
        preview = m;
      });
    }, HOVER);
  }
  grid.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('.lthumb');
    if (el === hoverEl) return;
    if (el && e.pointerType !== 'touch' && !A.libDrag) startPreview(el); else stopPreview();
  });
  grid.addEventListener('pointerleave', stopPreview);
  grid.addEventListener('pointerdown', function (e) { if (e.button !== 0) stopPreview(); });

  // The library changed (a scan, details read, a folder added or removed): drawn again at most once a second, and not
  // while something is being dragged out of the view: drawing it again would take away the row or thumbnail being
  // dragged, and with it the drag's end (the drawer would stay faded and let every click through to the wall).
  var changeTimer = 0;
  api.onLibrary(function () {
    if (!host.isOpen() || changeTimer) return;
    changeTimer = setTimeout(function again() {
      if (A.libDrag) { changeTimer = setTimeout(again, 300); return; }
      changeTimer = 0; refreshFolders(); refresh();
    }, 1000);
  });

  /* ---------- selecting ---------- */
  function paintSel() {
    els.forEach(function (el, id) { var on = sel.has(id); el.classList.toggle('sel', on); el.setAttribute('aria-selected', String(on)); });
  }
  function selectedPaths() {
    return results.filter(function (it) { return sel.has(it.id); }).map(function (it) { return it.path; });
  }
  function selectedIds() {
    return results.filter(function (it) { return sel.has(it.id); }).map(function (it) { return it.id; });
  }

  /* ---------- collections: adding, taking out, the order ---------- */
  function addToColl(c, ids) {
    api.editCollection('add', c.id, ids).then(function (n) {
      A.toast(n > 0 ? count(n, 'file', 'files') + ' added to "' + c.name + '".' : 'Those are in "' + c.name + '" already.');
      refreshFolders();
    });
  }
  function newCollWith(ids) {
    var n = 1, base = 'New collection', name = base;
    while (colls.some(function (c) { return c.name === name; })) name = base + ' ' + (++n);
    api.editCollection('make', name, ids).then(function (c) {
      A.toast('"' + c.name + '" holds ' + count(c.files, 'file', 'files') + ' now. Rename it in the list of folders and collections (right-click it).');
      refreshFolders();
    });
  }
  function takeOut(ids) {
    var c = collNow();
    if (!c || !ids.length) return;
    api.editCollection('take', c.id, ids).then(function (n) {
      if (n > 0) A.toast(count(n, 'file', 'files') + ' taken out of "' + c.name + '". The files themselves are still there.');
      sel.clear(); refreshFolders(); refresh();
    });
  }
  function moveTo(ids, before) {
    var c = collNow();
    if (c) api.editCollection('move', c.id, ids, before).then(function () { refresh(); });
  }
  // The collection items of a file's right-click menu.
  function collItems(ids) {
    var c = collNow(), out = [];
    colls.filter(function (x) { return x !== c; }).forEach(function (x) {
      out.push({ label: 'Add to "' + x.name + '"', icon: 'playlist', act: function () { addToColl(x, ids); } });
    });
    out.push({ label: 'Add to a new collection', icon: 'plus', act: function () { newCollWith(ids); } });
    if (c) {
      out.push('-', { label: 'Take out of "' + c.name + '"', icon: 'minus', hint: 'The files stay where they are (Delete)', act: function () { takeOut(ids); } });
      if (canReorder() && results.length > 1) {
        out.push({ label: 'Move to the start', icon: 'prev', act: function () { moveTo(ids, results[0].id); } },
          { label: 'Move to the end', icon: 'next', act: function () { moveTo(ids, null); } });
      }
    }
    return out;
  }
  /* ---------- your marks: stars, the favourite heart, tags ---------- */
  function itemsOf(ids) { return ids.map(function (id) { return results[index.get(id)]; }).filter(Boolean); }
  function allFav(ids) { var its = itemsOf(ids); return its.length > 0 && its.every(function (it) { return it.fav; }); }
  function markFiles(ids, change) {
    if (!ids.length) return Promise.resolve(0);
    return api.markLibrary(ids, change).then(function (n) { refresh(); refreshFolders(); return n; });
  }
  function starText(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  // The marks part of the files' right-click menu.
  function markItems(ids) {
    var its = itemsOf(ids), fav = allFav(ids);
    var now = its.length && its.every(function (it) { return it.stars === its[0].stars; }) ? its[0].stars : -1;
    return [
      { label: fav ? 'Not a favourite' : 'Favourite', icon: 'heart', hint: 'F', act: function () { markFiles(ids, { fav: !fav }); } },
      { label: 'Rating', icon: 'star', hint: now > 0 ? starText(now) : now === 0 ? 'None yet · keys 1 to 5' : 'Not the same for all', sub: [5, 4, 3, 2, 1, 0].map(function (n) {
        return { label: n ? starText(n) : 'No rating', hint: (n === now ? 'Now · ' : '') + 'Key ' + n, act: function () { markFiles(ids, { stars: n }); } };
      }) },
      { label: 'Tags…', icon: 'hash', hint: 'T', act: function () { openTags(ids); } }
    ];
  }

  // Tags…: the tags of the files it is for (dashed: only some of them have it; a click gives it to all, × takes it off
  // all), a field to type one (Enter gives it to all), and the other tags in use (a click gives it to all).
  var tagBox = $('#libTagBox'), tagFiles = [];   // [{ id, path, name }] the box is for
  function openTags(ids) {
    tagFiles = itemsOf(ids).map(function (it) { return { id: it.id, path: it.path, name: it.name }; });
    if (!tagFiles.length) return;
    tagBox.hidden = false;
    drawTags();
    $('#libTagInput').value = '';
    $('#libTagInput').focus();
  }
  function closeTags() {
    if (tagBox.hidden) return;
    tagBox.hidden = true; tagFiles = [];
    grid.focus();
  }
  function tagChip(name, cls, title, onClick, onX) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (cls ? ' ' + cls : ''); b.title = title;
    b.appendChild(document.createTextNode(name));
    if (onX) { var x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-hidden', 'true'); b.appendChild(x); }
    b.addEventListener('click', function (e) { if (onX && e.target.classList.contains('x')) onX(); else onClick(); });
    return b;
  }
  function giveTags(change) {
    markFiles(tagFiles.map(function (f) { return f.id; }), change).then(drawTags);
  }
  function drawTags() {
    var mine = tagFiles;
    if (!mine.length) return;
    Promise.all([api.libraryAbout(mine.map(function (f) { return f.path; })), api.libraryTags()]).then(function (got) {
      if (mine !== tagFiles) return;
      var about = got[0], all = got[1] || [], n = mine.length, have = new Map();
      mine.forEach(function (f) {
        ((about[f.path] || {}).tags || []).forEach(function (t) { var k = t.toLowerCase(); if (!have.has(k)) have.set(k, { name: t, n: 0 }); have.get(k).n++; });
      });
      $('#libTagTitle').textContent = 'Tags of ' + (n === 1 ? mine[0].name : count(n, 'file', 'files'));
      var hb = $('#libTagHave'), ob = $('#libTagOther'), dl = $('#libTagNames');
      hb.innerHTML = ''; ob.innerHTML = ''; dl.innerHTML = '';
      have.forEach(function (t) {
        var part = t.n < n;
        hb.appendChild(tagChip(t.name + (part ? ' (' + t.n + ')' : ''), part ? 'part' : '',
          part ? t.n + ' of ' + n + ' have it. Click to give it to all; × takes it off all.' : '× takes it off',
          function () { if (part) giveTags({ addTags: [t.name] }); }, function () { giveTags({ dropTags: [t.name] }); }));
      });
      all.forEach(function (t) {
        var o = document.createElement('option'); o.value = t.name; dl.appendChild(o);
        if (!have.has(t.name.toLowerCase())) ob.appendChild(tagChip(t.name, '', 'Give it to ' + (n === 1 ? 'this file' : 'all ' + n), function () { giveTags({ addTags: [t.name] }); }));
      });
      ob.hidden = $('#libTagOtherLab').hidden = !ob.childNodes.length;
    });
  }
  $('#libTagInput').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var v = this.value.replace(/\s+/g, ' ').trim();
    this.value = '';
    if (v) giveTags({ addTags: [v] });
  });
  $('#libTagClose').addEventListener('click', closeTags);

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
    host.menu(selectedPaths(), e.clientX, e.clientY, ['-'].concat(markItems(selectedIds()), '-', collItems(selectedIds())));
  });
  // A drag of files carries their paths for the wall and their ids for collections (info.reorder: within this one).
  grid.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('.lthumb');
    if (!el) return;
    stopPreview();
    if (!sel.has(el.dataset.id)) pick({}, el.dataset.id);
    host.dragOut(e, selectedPaths(), { ids: selectedIds(), reorder: canReorder() });
  });
  root.addEventListener('dragend', function () { host.dragEnd(); setMark(null); openFolders(false); });

  // Inside a collection in its own order: dropped before or after the thumbnail under the pointer (or at the end).
  var mark = null;
  function setMark(el, after) {
    if (mark) mark.classList.remove('dropbefore', 'dropafter');
    mark = el;
    if (el) el.classList.add(after ? 'dropafter' : 'dropbefore');
  }
  function reordering() { return !!(A.libDrag && A.libDrag.reorder && canReorder()); }
  grid.addEventListener('dragover', function (e) {
    if (!reordering()) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (host.overSelf) host.overSelf();
    var el = e.target.closest && e.target.closest('.lthumb');
    if (!el || A.libDrag.ids.indexOf(el.dataset.id) > -1) { setMark(null); return; }
    var b = el.getBoundingClientRect();
    setMark(el, e.clientX > b.left + b.width / 2);
  });
  grid.addEventListener('dragleave', function (e) { if (!grid.contains(e.relatedTarget)) setMark(null); });
  grid.addEventListener('drop', function (e) {
    if (!reordering()) return;
    e.preventDefault(); e.stopPropagation();
    var el = mark, after = !!(el && el.classList.contains('dropafter')), ids = A.libDrag.ids, before = null;
    setMark(null);
    if (el) {
      var i = index.get(el.dataset.id) + (after ? 1 : 0);
      while (i < results.length && ids.indexOf(results[i].id) > -1) i++;
      before = i < results.length ? results[i].id : null;
    } else if (e.target.closest && e.target.closest('.lthumb')) return;   // on the moved files themselves
    moveTo(ids, before);
  });

  // Files dragged onto a collection in the list join it. Held over the row above, the list opens.
  var springTimer = 0;
  function filesDragged() { return !!(A.libDrag && A.libDrag.ids && A.libDrag.ids.length); }
  $('#libFolderBtn').addEventListener('dragover', function (e) {
    if (!filesDragged()) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'none';
    if (!springTimer && folderBox.hidden) springTimer = setTimeout(function () { springTimer = 0; openFolders(true); }, 450);
  });
  $('#libFolderBtn').addEventListener('dragleave', function () { clearTimeout(springTimer); springTimer = 0; });
  folderBox.addEventListener('dragover', function (e) {
    var b = e.target.closest && e.target.closest('.lfolder.coll');
    if (!filesDragged()) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = b && b.dataset.coll !== S.lib.coll ? 'copy' : 'none';
    Array.prototype.forEach.call(folderBox.querySelectorAll('.lfolder.coll'), function (x) { x.classList.toggle('droptarget', x === b && b.dataset.coll !== S.lib.coll); });
  });
  folderBox.addEventListener('drop', function (e) {
    var b = e.target.closest && e.target.closest('.lfolder.coll');
    if (!filesDragged()) return;
    e.preventDefault(); e.stopPropagation();
    var c = b && colls.filter(function (x) { return x.id === b.dataset.coll; })[0];
    if (c && c.id !== S.lib.coll) addToColl(c, A.libDrag.ids);
    openFolders(false);
  });

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
      if (!tagBox.hidden) { closeTags(); return; }
      if (e.target.id === 'libSearch' && e.target.value) return;   // the search box empties itself
      if (sel.size) { sel.clear(); anchor = -1; paintSel(); return; }
      host.close();
      return;
    }
    if (e.target !== grid) return;
    if (ctrl && k === 'a') { e.preventDefault(); results.forEach(function (it) { sel.add(it.id); }); paintSel(); }
    else if (e.key === 'Enter' && sel.size) { e.preventDefault(); host.put(selectedPaths()); }
    else if (e.key === 'Delete' && sel.size && S.lib.coll) { e.preventDefault(); takeOut(selectedIds()); }
    // Your marks on the selected files: 1 to 5 stars (0: none), F the heart, T their tags.
    else if (sel.size && !ctrl && !e.altKey && /^[0-5]$/.test(e.key)) { e.preventDefault(); markFiles(selectedIds(), { stars: +e.key }); }
    else if (sel.size && !ctrl && !e.altKey && k === 'f') { e.preventDefault(); markFiles(selectedIds(), { fav: !allFav(selectedIds()) }); }
    else if (sel.size && !ctrl && !e.altKey && k === 't') { e.preventDefault(); openTags(selectedIds()); }
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
