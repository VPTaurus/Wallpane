// Right-click menus: on a tile (its media and what to do with it), and on empty wall (add media or a new tile there).
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, G = MW.geo, V = MW.view;
  var S = A.S, ICON = A.ICON, wall = A.wall;

  var menu = document.createElement('div');
  menu.className = 'pop menu ctx';
  menu.id = 'ctxMenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);

  // A submenu floats beside the menu (inside it, the menu's scrolling would cut it off).
  var sub = document.createElement('div');
  sub.className = 'pop menu ctx';
  sub.id = 'ctxSub';
  sub.hidden = true;
  sub.setAttribute('role', 'menu');
  document.body.appendChild(sub);
  var subOwner = null;   // the item whose submenu shows

  function firstIn(box) { return box.querySelector('.mi:not(:disabled)'); }
  // items: { label, hint, icon, act, disabled, danger }, { label, hint, icon, sub: [items] } for a submenu, or '-'
  // for a dividing line.
  function fill(box, items) {
    box.innerHTML = '';
    items.forEach(function (m) {
      if (m === '-') {
        if (box.lastChild && box.lastChild.tagName !== 'HR') { var hr = document.createElement('hr'); hr.className = 'div'; box.appendChild(hr); }
        return;
      }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mi' + (m.danger ? ' danger' : '') + (m.sub ? ' hassub' : ''); b.disabled = !!m.disabled;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="ic" aria-hidden="true">' + (ICON[m.icon] || '') + '</span><span><b></b>' + (m.hint ? '<small></small>' : '') + '</span>' +
        (m.sub ? '<span class="chev" aria-hidden="true">›</span>' : '');
      b.querySelector('b').textContent = m.label;
      if (m.hint) b.querySelector('small').textContent = m.hint;
      if (m.sub) {
        b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
        b.addEventListener('click', function () { openSub(b, m.sub, true); });
        b.addEventListener('pointerenter', function () { openSub(b, m.sub, false); });
      } else {
        b.addEventListener('click', function () { A.hideMenu(); m.act(); });
        if (box === menu) b.addEventListener('pointerenter', closeSub);   // another item of the menu: its submenu goes
      }
      box.appendChild(b);
    });
    if (box.lastChild && box.lastChild.tagName === 'HR') box.lastChild.remove();
  }
  // Beside the menu, on the right (on the left near the window's edge), level with its item.
  function openSub(b, items, focus) {
    if (subOwner !== b) {
      closeSub();
      subOwner = b; b.classList.add('open'); b.setAttribute('aria-expanded', 'true');
      fill(sub, items); sub.hidden = false;
      var r = b.getBoundingClientRect(), mr = menu.getBoundingClientRect(), w = sub.offsetWidth, h = sub.offsetHeight;
      sub.style.left = Math.max(8, mr.right + 4 + w <= window.innerWidth - 8 ? mr.right + 4 : mr.left - 4 - w) + 'px';
      sub.style.top = Math.max(8, Math.min(r.top - 5, window.innerHeight - h - 8)) + 'px';
    }
    if (focus && firstIn(sub)) firstIn(sub).focus();
  }
  function closeSub() {
    if (subOwner) { subOwner.classList.remove('open'); subOwner.setAttribute('aria-expanded', 'false'); }
    subOwner = null; sub.hidden = true;
  }
  A.showMenu = function (x, y, items) {
    A.closePops();
    closeSub();
    fill(menu, items);
    menu.hidden = false;
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    if (firstIn(menu)) firstIn(menu).focus();
  };
  A.hideMenu = function () { closeSub(); menu.hidden = true; };
  A.menuOpen = function () { return !menu.hidden; };
  document.addEventListener('pointerdown', function (e) { if (!menu.hidden && !menu.contains(e.target) && !sub.contains(e.target)) A.hideMenu(); }, true);
  window.addEventListener('blur', A.hideMenu);
  window.addEventListener('resize', A.hideMenu);
  // Up and down arrows move through the items; right (or Enter) opens a submenu, left or Esc closes it.
  function keys(box, e) {
    var list = Array.prototype.slice.call(box.querySelectorAll('.mi:not(:disabled)')), i = list.indexOf(document.activeElement), n = list.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (n) list[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus();
    } else if (box === menu && e.key === 'ArrowRight' && document.activeElement.classList.contains('hassub')) {
      e.preventDefault(); e.stopPropagation(); document.activeElement.click();
    } else if (box === sub && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
      e.preventDefault(); e.stopPropagation();
      var owner = subOwner; closeSub(); if (owner) owner.focus();
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); A.hideMenu(); }
  }
  menu.addEventListener('keydown', function (e) { keys(menu, e); });
  sub.addEventListener('keydown', function (e) { keys(sub, e); });

  function starText(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  // The tile's file's marks in the library (lib: { id, stars, fav, tags }), as one submenu whose hint shows them.
  function libraryGroup(it, lib) {
    var mark = function (change) { A.api.markLibrary([lib.id], change); };
    var now = [lib.stars ? starText(lib.stars) : '', lib.fav ? '♥' : '', lib.tags.join(', ')].filter(Boolean).join(' · ');
    return { label: 'Library', hint: now || 'Rating, favourite, tags', icon: 'star', sub: [
      { label: lib.fav ? 'Not a favourite' : 'Favourite', icon: 'heart', act: function () { mark({ fav: !lib.fav }); } },
      '-'
    ].concat([5, 4, 3, 2, 1, 0].map(function (n) {
      return { label: n ? starText(n) : 'No rating', icon: n === lib.stars ? 'star' : '', hint: n === lib.stars ? 'Now' : '', act: function () { mark({ stars: n }); } };
    }), ['-', { label: 'Tags…', icon: 'hash', hint: 'In Properties', act: function () { A.openProps(it, '#libSec'); } }]) };
  }
  // A tile's menu: what is used most at the top (a missing file's Locate, a video's sound, repeat and looped part, a
  // playlist's own), the rest in submenus (Library when its file is in the library, Display, File, Tile), then
  // Properties and Remove.
  function tileMenu(it, x, y, lib) {
    var media = A.hasMedia(it), video = media && it.kind === 'video', items = [];
    if (it.kind === 'empty') {
      items.push({ label: 'Choose media…', icon: 'file', act: function () { A.chooseMedia(it); } },
        { label: 'Play a folder here…', hint: 'This tile plays its files in turn', icon: 'folder', act: function () { A.ownFolder(it); } }, '-');
    }
    if (it.missing) items.push({ label: 'Locate file…', icon: 'file', act: function () { A.relinkOne(it); } }, '-');
    if (video) {
      items.push({ label: it.muted ? 'Sound on' : 'Sound off', icon: it.muted ? 'vol' : 'mute', act: function () { it.muted = !it.muted; A.render(); A.refreshInspector(); } });
      if (!it.pl) items.push({ label: it.loop ? 'Play it once' : 'Repeat this video', icon: 'loop', act: function () { it.loop = !it.loop; A.render(); A.refreshInspector(); } });
      if (!it.pl && MW.play.hasLoop(it)) {
        items.push({ label: 'Stop looping the part', hint: MW.play.fmtTime(it.loopA || 0, true) + ' to ' + (it.loopB == null ? 'the end' : MW.play.fmtTime(it.loopB, true)), icon: 'loop', act: function () { A.setLoop(it, null, null); } });
        if (A.hasFfmpeg && it.path) {
          items.push({ label: 'Make a GIF of the part…', hint: 'Saved as a file where you choose', icon: 'film', act: function () { A.makeGif(it); } },
            { label: 'Save the part as MP4…', hint: 'Copied as it is, or re-encoded to start on the part', icon: 'cut', act: function () { A.cutPart(it); } });
        }
      } else if (!it.pl) items.push({ label: 'Loop a part…', hint: 'Speed, volume and loop in Properties', icon: 'loop', act: function () { A.openProps(it, '#pbSec'); } });
    }
    if (it.pl && S.playlists[it.pl]) {
      items.push({ label: 'Previous file', icon: 'prev', disabled: !!it.pinned || !(it._back && it._back.length), act: function () { A.goBack(it); } },
        { label: 'Next file', icon: 'next', disabled: !!it.pinned, act: function () { A.advance(it); } },
        { label: it.pinned ? 'Carry on with the playlist' : 'Stay on this file', icon: 'pin', act: function () { A.setPinned(it, !it.pinned); } },
        { label: 'Playlist settings…', hint: 'Order, timing, crossfade for this folder', icon: 'playlist', act: function () { A.openProps(it, '#plSec'); } });
    }
    items.push('-');
    if (lib) items.push(libraryGroup(it, lib));
    if (media) {
      var display = [{ label: 'Reposition and zoom', hint: 'Drag the media; scroll to zoom', icon: 'move', act: function () { A.startRepos(it); } }];
      if (!V.isDefault(it)) display.push({ label: 'Reset position and zoom', icon: 'reset', act: function () { A.resetView(it); } });
      display.push({ label: it.fit === 'cover' ? 'Show the whole frame' : 'Fill the tile', icon: 'fit', act: function () { it.fit = it.fit === 'cover' ? 'contain' : 'cover'; it.fitSet = true; A.render(); A.refreshInspector(); } },
        { label: 'Fit tile to media', hint: 'No bars, nothing cropped' + (S.mode === 'free' ? '' : '; switches to Free (pixels)'), icon: 'fit', act: function () { A.fitTilesToMedia([it]); } });
      items.push({ label: 'Display', hint: 'Position, zoom, fit', icon: 'fit', sub: display });
    }
    var file = [];
    if (it.kind !== 'empty' && !it.missing) file.push({ label: 'Replace media…', icon: 'file', act: function () { A.chooseMedia(it); } });
    if (it.kind !== 'empty') file.push({ label: 'Play a folder…', hint: 'This tile plays a folder of its own', icon: 'folder', act: function () { A.ownFolder(it); } });
    if (it.path && !it.missing) file.push({ label: 'Show in Explorer', icon: 'folder', act: function () { A.api.revealFile(it.path); } });
    if (video && A.hasFfmpeg && it.path) file.push({ label: 'Save this frame…', hint: 'A picture of it at the video\'s full size', icon: 'camera', act: function () { A.snapshot(it); } });
    if (video && A.hasFfmpeg && it.path) file.push({ label: 'Make playable', hint: 'A converted copy, for a video that plays badly or not at all', icon: 'wand', act: function () { A.makePlayable(it); } });
    if (file.length) items.push({ label: 'File', hint: 'Replace, another folder, Explorer', icon: 'folder', sub: file });
    items.push({ label: 'Tile', hint: 'Duplicate, split', icon: 'tile', sub: [
      { label: 'Duplicate', icon: 'copy', act: function () { A.duplicateTile(it); } },
      { label: 'Split side by side', icon: 'splitv', disabled: !A.canSplit(it, 'v'), act: function () { A.splitTile(it, 'v'); } },
      { label: 'Split top and bottom', icon: 'splith', disabled: !A.canSplit(it, 'h'), act: function () { A.splitTile(it, 'h'); } }] },
    '-',
    { label: 'Properties…', hint: 'Everything about this tile · Alt+Enter', icon: 'sliders', act: function () { A.openProps(it); } },
    { label: 'Remove from wall', icon: 'trash', danger: true, act: function () { A.removeItem(it.id); } });
    A.showMenu(x, y, items);
  }

  function wallMenu(e) {
    var target;
    if (S.mode === 'free') target = { x: e.clientX, y: e.clientY, free: true };
    else {
      var slot = e.target.closest('.slot');
      target = slot ? { col: +slot.dataset.col, row: +slot.dataset.row } : A.cellAt(e.clientX, e.clientY);
      if (G.itemAt(S.items, target.col, target.row)) target = null;   // between tiles: no particular cell
    }
    A.showMenu(e.clientX, e.clientY, [
      { label: 'Add media here…', icon: 'file', act: function () { A.api.openFiles(true).then(function (res) { if (A.picked(res)) A.addFiles(res, target); }); } },
      { label: 'Add a folder here…', hint: 'A tile for each file', icon: 'folder', act: function () { A.api.openFolder().then(function (res) { if (A.picked(res)) A.addFiles(res, target); }); } },
      { label: 'New empty tile', hint: 'Size it first, add media later', icon: 'tile', act: function () { A.newEmptyTile(target); } }
    ].concat(A.hasFfmpeg ? ['-', { label: 'Save the wall as a video…', hint: 'One MP4, every tile in its place', icon: 'film', act: A.openWallVideo }] : []));
  }

  wall.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('clean')) {
      A.showMenu(e.clientX, e.clientY, [{ label: 'Exit wall mode', hint: 'Esc or F11', icon: 'tv', act: function () { A.setClean(false); } }]);
      return;
    }
    var t = e.target.closest('.tile');
    var it = t && !t._dead ? A.itemById(+t.dataset.id) : null;
    if (it) { A.select(it.id); A.libraryMarksOf(it).then(function (lib) { tileMenu(it, e.clientX, e.clientY, lib); }); }
    else wallMenu(e);
  });
})(window.MW.app);
