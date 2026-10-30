// Emergency hide: one key (Ctrl+Shift+H unless Settings say otherwise) covers every wall window with a spreadsheet,
// a black screen or a picture, or makes the windows go away. Sound stops at once (the main process mutes the window)
// and videos pause; the same key brings everything back as it was. The key works from any program: the main process
// owns it. While hidden, the page takes no keys, drops or right-clicks, so nothing on the wall can change by accident.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, K = MW.hotkey;
  var api = A.api, $ = A.$;
  var cfg = { key: 'Ctrl+Shift+H', cover: 'sheet', image: null, mouse: '', ok: false, on: false };
  var BUTTON = { middle: 1, back: 3, forward: 4 };   // PointerEvent.button for each mouse setting
  var hidden = false, was = null, title = '', recording = false;

  var cover = document.createElement('div');
  cover.className = 'cover'; cover.id = 'cover'; cover.hidden = true;
  document.body.appendChild(cover);

  function hide() {
    if (hidden) return;
    hidden = true;
    var players = A.videos().concat(A.musicEl ? [A.musicEl] : []);   // the background music too
    was = { playing: players.filter(function (v) { return !v.paused; }), paused: A.wallPaused };
    A.wallPaused = true;   // image playlists stop moving on too
    players.forEach(function (v) { v.pause(); });
    A.hideMenu();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    cover.className = 'cover ' + cfg.cover;
    cover.innerHTML = '';
    if (cfg.cover === 'sheet') cover.appendChild(sheet());
    else if (cfg.cover === 'image' && cfg.image) {
      var img = document.createElement('img');
      img.alt = ''; img.src = U.fileUrl(cfg.image);
      cover.appendChild(img);
    }
    cover.hidden = false;
    title = document.title;
    document.title = cfg.cover === 'sheet' ? 'Budget 2026.xlsx' : 'Untitled';
    A.updateTransport();
  }
  function show() {
    if (!hidden) return;
    hidden = false;
    cover.hidden = true; cover.innerHTML = '';
    document.title = title;
    A.wallPaused = was ? was.paused : false;
    if (was) was.playing.forEach(function (v) { if (v.isConnected) v.play().catch(function () {}); });
    was = null;
    A.render(); A.updateTransport();
  }

  function apply(s) {
    if (!s) return;
    cfg = s;
    if (s.on) hide(); else show();
    if (!$('#popS').hidden) showSettings();
    // The key in Settings > Keys follows the one set here.
    var dt = $('#keysHideKey');
    dt.innerHTML = '';
    K.label(cfg.key).split(' + ').forEach(function (p, i) {
      if (i) dt.appendChild(document.createTextNode(' '));
      var kb = document.createElement('kbd'); kb.textContent = p; dt.appendChild(kb);
    });
  }
  api.onHide(apply);
  api.hideState().then(apply);

  /* ---------- while hidden: no keys, drops or menus reach the wall ---------- */
  window.addEventListener('keydown', function (e) {
    if (recording) { record(e); return; }
    // The key itself, for when Windows gave it to another program: it then works while Wallpane is the active window.
    if (K.matches(e, cfg.key)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) api.toggleHide(); return; }
    if (!hidden) return;
    e.stopImmediatePropagation();
    if (!/^(?:Control|Shift|Alt|Meta)$/.test(e.key)) e.preventDefault();
    // The spreadsheet answers the keys a spreadsheet would: arrows, Tab and Enter move the selected cell.
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Tab: [1, 0], Enter: [0, 1] }[e.key];
    if (d && e.shiftKey && (e.key === 'Tab' || e.key === 'Enter')) d = [-d[0], -d[1]];
    if (d && cover._move) cover._move(d[0], d[1]);
  }, true);
  ['keyup', 'keypress', 'paste', 'contextmenu', 'dragenter', 'dragover', 'drop'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (!hidden && !(recording && /^key/.test(t))) return;
      e.stopImmediatePropagation();
      if (t !== 'keyup') e.preventDefault();
    }, true);
  });
  // The mouse button, while the pointer is over this window (hidden or not). Its click goes no further: no middle-click
  // scrolling, and no back or forward.
  function isHideButton(e) { return !!cfg.mouse && e.button === BUTTON[cfg.mouse]; }
  window.addEventListener('pointerdown', function (e) {
    if (!isHideButton(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    api.toggleHide();
  }, true);
  ['mousedown', 'mouseup', 'pointerup', 'auxclick'].forEach(function (t) {
    window.addEventListener(t, function (e) { if (isHideButton(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  });

  /* ---------- the spreadsheet cover: a plain budget table, the same every time ---------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LINES = [['Salaries', 48000], ['Contractors', 9500], ['Rent', 7200], ['Utilities', 1400], ['Software', 3100], ['Hardware', 2200],
    ['Travel', 2600], ['Training', 1200], ['Marketing', 5400], ['Events', 1800], ['Office supplies', 650], ['Insurance', 980],
    ['Legal', 1500], ['Accounting', 1100], ['Telecom', 720], ['Maintenance', 860], ['Recruiting', 2300], ['Subscriptions', 540], ['Other', 400]];
  var COLS = 'ABCDEFGHIJKLMNOP', ROWS = 60;
  function sheet() {
    var seed = 2026, nf = new Intl.NumberFormat('en-US'), data = {};
    function rnd() {   // small seeded generator, so the numbers never change between hides
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function put(ref, v, cls, f) { data[ref] = { v: String(v), cls: cls || '', f: f }; }
    put('A1', 'Department budget 2026', 'b big');
    put('A2', 'All figures in EUR', 'm');
    put('A4', 'Category', 'b h');
    MONTHS.forEach(function (m, i) { put(COLS[i + 1] + '4', m, 'b h n'); });
    put('N4', 'Total', 'b h n'); put('O4', 'vs 2025', 'b h n');
    var sums = [], last = 4 + LINES.length, i;
    for (i = 0; i < 13; i++) sums[i] = 0;
    LINES.forEach(function (l, k) {
      var r = 5 + k, tot = 0;
      put('A' + r, l[0]);
      for (var c = 0; c < 12; c++) {
        var x = Math.round(l[1] * (0.86 + rnd() * 0.28) / 10) * 10;
        tot += x; sums[c] += x;
        put(COLS[c + 1] + r, nf.format(x), 'n', String(x));
      }
      sums[12] += tot;
      put('N' + r, nf.format(tot), 'n b', '=SUM(B' + r + ':M' + r + ')');
      var d = rnd() * 16 - 6;
      put('O' + r, (d > 0 ? '+' : '') + d.toFixed(1) + '%', 'n' + (d < 0 ? ' neg' : ''), '=N' + r + '/Y2025!N' + r + '-1');
    });
    put('A' + (last + 1), 'Total', 'b t');
    for (i = 0; i < 13; i++) put(COLS[i + 1] + (last + 1), nf.format(sums[i]), 'n b t', '=SUM(' + COLS[i + 1] + '5:' + COLS[i + 1] + last + ')');
    put('A' + (last + 3), 'Approved by finance on 14 Oct', 'm');

    var h = '<table><colgroup><col class="c0"><col class="ca">' + new Array(COLS.length).join('<col>') + '</colgroup><thead><tr><th></th>';
    for (i = 0; i < COLS.length; i++) h += '<th>' + COLS[i] + '</th>';
    h += '</tr></thead><tbody>';
    for (var r = 1; r <= ROWS; r++) {
      h += '<tr><th>' + r + '</th>';
      for (i = 0; i < COLS.length; i++) {
        var ref = COLS[i] + r, d2 = data[ref];
        h += '<td data-ref="' + ref + '"' + (d2 && d2.cls ? ' class="' + d2.cls + '"' : '') + '>' + (d2 ? U.esc(d2.v) : '') + '</td>';
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
    var el = document.createElement('div');
    el.className = 'sh';
    el.innerHTML =
      '<div class="sh-top"><span class="sh-ico" aria-hidden="true"></span><div><div class="sh-doc">Budget 2026</div>' +
      '<div class="sh-menu"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span><span>Tools</span><span>Help</span></div></div>' +
      '<span class="sh-saved">All changes saved</span></div>' +
      '<div class="sh-tools"><i></i><i></i><i></i><b></b><span class="sh-box">100%</span><b></b><span class="sh-box w">Arial</span><span class="sh-box">10</span><b></b>' +
      '<span class="sh-btn">B</span><span class="sh-btn it">I</span><span class="sh-btn un">U</span><b></b><i></i><i></i><i></i><b></b><i></i><i></i></div>' +
      '<div class="sh-fx"><span class="sh-ref"></span><span class="sh-fxl">fx</span><span class="sh-val"></span></div>' +
      '<div class="sh-grid">' + h + '</div>' +
      '<div class="sh-tabs"><span class="on">Summary</span><span>Q3</span><span>Q4</span><span>Y2025</span><span>Notes</span></div>';
    var refEl = el.querySelector('.sh-ref'), valEl = el.querySelector('.sh-val'), cur = null;
    function pick(td) {
      if (!td) return;
      if (cur) cur.classList.remove('sel');
      cur = td; td.classList.add('sel');
      var d = data[td.dataset.ref];
      refEl.textContent = td.dataset.ref; valEl.textContent = d ? (d.f || d.v) : '';
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    el.addEventListener('mousedown', function (e) { pick(e.target.closest('td')); });
    cover._move = function (dc, dr) {
      var ref = cur ? cur.dataset.ref : 'B5', c = clampIdx(COLS.indexOf(ref[0]) + dc, COLS.length), r = Math.max(1, Math.min(ROWS, +ref.slice(1) + dr));
      pick(el.querySelector('td[data-ref="' + COLS[c] + r + '"]'));
    };
    setTimeout(function () { pick(el.querySelector('td[data-ref="B5"]')); }, 0);
    return el;
  }
  function clampIdx(i, n) { return Math.max(0, Math.min(n - 1, i)); }

  /* ---------- Settings: the key, and what the windows show ---------- */
  function hideNote(text) {
    var k = K.label(cfg.key);
    $('#hideNote').textContent = text || (cfg.ok
      ? 'Press ' + k + ' in any program: every wall window ' + (cfg.cover === 'away' ? 'goes away' : 'is covered') + ', its sound goes off and videos pause. Press it again to come back. Starting Wallpane again also brings it back.'
      : 'Another program already uses ' + k + ', so it works only while Wallpane is the active window. Click the key to pick another.') +
      (!text && cfg.mouse && cfg.cover === 'away' ? ' With Nothing shown there is no window to click, so only the key brings them back.' : '');
  }
  function showSettings() {
    var b = $('#hideKey');
    if (!recording) { b.textContent = K.label(cfg.key); b.classList.remove('rec'); }
    b.classList.toggle('bad', !cfg.ok);
    Array.prototype.forEach.call(document.querySelectorAll('#hideQuick [data-key]'), function (q) {
      q.setAttribute('aria-pressed', String(K.normalize(q.dataset.key) === cfg.key));
    });
    $('#hideMouse').value = cfg.mouse || '';
    $('#hideMouseNote').hidden = !cfg.mouse;
    $('#hideCover').value = cfg.cover;
    $('#hideImageBtn').hidden = cfg.cover !== 'image';
    $('#hideImageBtn').textContent = cfg.image ? 'Picture: ' + U.baseName(cfg.image) : 'Choose picture…';
    if (!recording) hideNote();
  }
  A.refreshHideSettings = function () { api.hideState().then(function (s) { cfg = s; showSettings(); }); };
  function startRecord() {
    recording = true;
    var b = $('#hideKey');
    b.classList.add('rec'); b.textContent = 'Press the new keys…';
    hideNote('Hold two of Ctrl, Alt, Shift and Win (one of them not Shift) and press a letter or number. F-keys and Scroll Lock also work alone. Esc cancels.');
    api.suspendHideKey(true);
  }
  function stopRecord() {
    if (!recording) return;
    recording = false;
    api.suspendHideKey(false).then(function (s) { cfg = s; showSettings(); });
  }
  function record(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if ($('#popS').hidden) { stopRecord(); return; }
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { stopRecord(); return; }
    var r = K.fromEvent(e);
    if (!r) return;   // only modifiers so far
    if (r.error) { hideNote(r.error); return; }
    recording = false;
    api.setHide({ key: r.accel }).then(function (s) {
      cfg = s;
      return api.suspendHideKey(false);
    }).then(function (s) {
      var err = cfg.error;
      cfg = s; showSettings();
      if (err) hideNote(err); else A.toast('Emergency hide key: ' + K.label(s.key));
    });
  }
  // One-press keys, picked with a click: a media key may never reach the page, so it could not be recorded by pressing it.
  Array.prototype.forEach.call(document.querySelectorAll('#hideQuick [data-key]'), function (q) {
    q.addEventListener('click', function () {
      api.setHide({ key: q.dataset.key }).then(function (s) {
        cfg = s; showSettings();
        if (s.error) hideNote(s.error); else A.toast('Emergency hide key: ' + K.label(s.key));
      });
    });
  });
  $('#hideMouse').addEventListener('change', function () {
    api.setHide({ mouse: this.value }).then(function (s) { cfg = s; showSettings(); });
  });
  $('#hideKey').addEventListener('click', function () { if (recording) stopRecord(); else startRecord(); });
  $('#hideKey').addEventListener('blur', stopRecord);
  $('#hideCover').addEventListener('change', function () {
    var v = this.value;
    var next = v === 'image' && !cfg.image ? api.pickHideImage() : api.setHide({ cover: v });
    next.then(function (s) { cfg = s; showSettings(); });
  });
  $('#hideImageBtn').addEventListener('click', function () { api.pickHideImage().then(function (s) { cfg = s; showSettings(); }); });
  $('#hideTry').addEventListener('click', function () { A.closePops(); api.toggleHide(); });
})(window.MW.app);
