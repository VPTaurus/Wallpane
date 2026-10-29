// Saving and loading: wall presets, layouts, export and import, and the wall that comes back on the next start.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, G = MW.geo, F = MW.free, REC = MW.rec;
  var S = A.S, $ = A.$, esc = U.esc, api = A.api;

  /* ---------- wall records: grid, placement, settings and the path of each file ---------- */
  A.currentRecord = function (name) {
    return {
      name: name, savedAt: Date.now(), cols: S.cols, rows: S.rows, gap: S.gap, aspect: S.aspect, fit: S.fit, presetName: S.presetName, mode: S.mode,
      playlists: A.usedPlaylists(), fillPl: (S.fillPl && S.playlists[S.fillPl]) ? S.fillPl : null,
      items: S.items.filter(function (i) { return !i.sample && !i._gone && (i.path || i.kind === 'empty'); }).map(function (i) {
        var v = MW.view.of(i);
        return { path: i.path, name: i.name, kind: i.kind, col: i.col, row: i.row, w: i.w, h: i.h, fit: i.fit, muted: i.muted, loop: i.loop, pl: i.pl || null, pinned: !!i.pinned, fitSet: !!i.fitSet, fx: i.fx, fy: i.fy, fw: i.fw, fh: i.fh, mx: v.mx, my: v.my, zoom: v.zoom };
      })
    };
  };
  // Puts a cleaned record on the wall. Resolves with the number of files that were not found.
  A.applyRecord = async function (rec, label) {
    var items = rec.items.map(function (i) {
      return { id: S.nid++, name: i.name, path: i.path, kind: i.kind, url: null, col: i.col, row: i.row, w: i.w, h: i.h, fit: i.fit, muted: i.muted, loop: i.loop, sample: false, missing: false, pl: (i.pl && rec.playlists && rec.playlists[i.pl]) ? i.pl : null, pinned: !!i.pinned, fitSet: !!i.fitSet, fx: i.fx, fy: i.fy, fw: i.fw, fh: i.fh, mx: i.mx, my: i.my, zoom: i.zoom, shown: 0 };
    });
    var withMedia = items.filter(function (i) { return i.kind !== 'empty'; });
    var ex = withMedia.length ? await api.exists(withMedia.map(function (i) { return i.path; })) : [];
    var missing = 0;
    withMedia.forEach(function (it, n) { if (ex[n]) it.url = U.fileUrl(it.path); else { it.missing = true; missing++; } });
    S.items = items; S.sel = null; S.presetName = label || null; S.mode = rec.mode === 'free' ? 'free' : 'grid'; S.playlists = rec.playlists || {}; S.fillPl = (rec.fillPl && S.playlists[rec.fillPl]) ? rec.fillPl : null;
    S.cols = rec.cols; S.rows = rec.rows; S.gap = rec.gap; S.aspect = rec.aspect; S.fit = rec.fit;
    if (S.mode === 'free') F.toFree(S.items, S.cols, S.rows, S.gap, A.wallPx(), true);
    else if (!G.validLayout(S.items, S.cols, S.rows)) {
      var plan = G.arrange(S.items, S.cols, S.rows);
      while (!plan && S.rows < 12) { S.rows++; plan = G.arrange(S.items, S.cols, S.rows); }
      if (plan) G.applyGeo(S.items, plan);
    }
    A.clearHistory();
    A.savePrefs(); A.render(); A.refreshInspector();
    return missing;
  };

  /* ---------- presets ---------- */
  function listPresets() {
    return api.storeGet('presets').then(function (list) {
      var out = [];
      (Array.isArray(list) ? list : []).forEach(function (r) { var c = REC.cleanRecord(r, true); if (c) out.push(c); });
      return out.sort(function (a, b) { return b.savedAt - a.savedAt; });
    });
  }
  A.refreshPresetList = function () {
    var box = $('#plist');
    api.storeInfo().then(function (info) { $('#storeNote').textContent = 'Stored in ' + info.dir; });
    listPresets().then(function (list) {
      if (!list.length) { box.innerHTML = '<p class="note">No presets yet. Arrange a wall, name it above and press Save.</p>'; return; }
      box.innerHTML = list.map(function (p) {
        var n = p.items.length;
        return '<div class="prow" data-name="' + esc(p.name) + '"><div class="pinfo"><div class="pname">' + esc(p.name) + '</div>' +
          '<div class="pmeta">' + p.cols + ' × ' + p.rows + ' · ' + n + (n === 1 ? ' item' : ' items') + '</div></div>' +
          '<button class="btn" data-pa="load">Load</button><button class="btn" data-pa="del" aria-label="Delete preset ' + esc(p.name) + '">Delete</button></div>';
      }).join('');
    });
  };
  // Two clicks to delete: the first arms the button for three seconds.
  function armed(b) {
    if (b.dataset.armed) return true;
    b.dataset.armed = '1'; b.textContent = 'Sure?'; b.classList.add('warn');
    setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; b.classList.remove('warn'); } }, 3000);
    return false;
  }
  $('#saveForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#presetName').value.trim().slice(0, 48);
    if (!name) { A.toast('Give the preset a name first.'); $('#presetName').focus(); return; }
    var rec = A.currentRecord(name);
    if (!rec.items.length) { A.toast('Add some of your own media first. Sample tiles are not saved.'); return; }
    var btn = $('#saveBtn'); btn.disabled = true;
    listPresets().then(function (list) {
      var existed = list.some(function (p) { return p.name === name; });
      var next = list.filter(function (p) { return p.name !== name; });
      next.unshift(rec);
      return api.storeSet('presets', next).then(function (ok) {
        if (!ok) { A.toast('Could not save the preset. The data folder is not writable.'); return; }
        S.presetName = name; A.render();
        A.toast((existed ? 'Updated "' : 'Saved "') + name + '".');
        A.refreshPresetList();
      });
    }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; A.toast('Could not save the preset.'); });
  });
  $('#plist').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pa]');
    if (!b) return;
    var name = b.closest('.prow').dataset.name;
    if (b.dataset.pa === 'load') {
      b.disabled = true; b.textContent = 'Loading…';
      listPresets().then(function (list) {
        var rec = list.filter(function (p) { return p.name === name; })[0];
        if (!rec) { A.toast('That preset no longer exists.'); A.refreshPresetList(); return; }
        return A.applyRecord(rec, name).then(function (missing) {
          A.closePops();
          A.toast(missing
            ? 'Loaded "' + name + '". ' + missing + (missing === 1 ? ' file was' : ' files were') + ' not found. Use Locate file on a tile.'
            : 'Loaded "' + name + '".');
        });
      }).then(null, function () { A.toast('Could not load that preset.'); A.refreshPresetList(); });
      return;
    }
    if (!armed(b)) return;
    listPresets().then(function (list) {
      return api.storeSet('presets', list.filter(function (p) { return p.name !== name; }));
    }).then(function () {
      if (S.presetName === name) { S.presetName = null; A.render(); }
      A.refreshPresetList();
    });
  });
  $('#revealBtn').addEventListener('click', function () { api.revealStore(); });
  $('#exportBtn').addEventListener('click', function () {
    listPresets().then(function (list) {
      var text = JSON.stringify({ app: 'wallpane', version: 1, presets: list, layouts: A.userLayouts }, null, 2);
      return api.exportData(text);
    }).then(function (file) { if (file) A.toast('Exported to ' + file); });
  });
  $('#importBtn').addEventListener('click', function () {
    api.importData().then(function (res) {
      if (!res) return;
      if (res.error) { A.toast(res.error); return; }
      var d = res.data;
      // Exports from before the rename say 'media-wall'.
      if (!d || (d.app !== 'wallpane' && d.app !== 'media-wall')) { A.toast('That file is not a Wallpane export.'); return; }
      return listPresets().then(function (list) {
        var added = 0;
        (Array.isArray(d.presets) ? d.presets : []).forEach(function (r) {
          var c = REC.cleanRecord(r, true);
          if (!c) return;
          list = list.filter(function (p) { return p.name !== c.name; });
          list.unshift(c); added++;
        });
        var addedL = 0, mine = A.userLayouts.slice();
        (Array.isArray(d.layouts) ? d.layouts : []).forEach(function (raw) {
          var L = REC.cleanLayout(raw);
          if (!L) return;
          mine = mine.filter(function (x) { return x.name !== L.name; });
          mine.unshift(L); addedL++;
        });
        return Promise.all([api.storeSet('presets', list), api.storeSet('layouts', mine.slice(0, 40))]).then(function () {
          A.userLayouts = mine.slice(0, 40);
          A.refreshPresetList();
          A.toast('Imported ' + added + (added === 1 ? ' preset' : ' presets') + ' and ' + addedL + (addedL === 1 ? ' layout.' : ' layouts.'));
        });
      });
    });
  });

  /* ---------- layouts: frames only, no media. Applying one moves the current tiles into the frames. ---------- */
  var LAYOUTS = [
    { name: 'Single', cols: 1, rows: 1, f: G.gridFrames(1, 1) },
    { name: 'Side by side', cols: 2, rows: 1, f: G.gridFrames(2, 1) },
    { name: 'Stacked', cols: 1, rows: 2, f: G.gridFrames(1, 2) },
    { name: 'Quad', cols: 2, rows: 2, f: G.gridFrames(2, 2) },
    { name: '3 × 3', cols: 3, rows: 3, f: G.gridFrames(3, 3) },
    { name: '4 × 3', cols: 4, rows: 3, f: G.gridFrames(4, 3) },
    { name: 'Hero left', cols: 3, rows: 3, f: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]] },
    { name: 'Hero + column', cols: 4, rows: 3, f: [[0, 0, 3, 3], [3, 0, 1, 1], [3, 1, 1, 1], [3, 2, 1, 1]] },
    { name: 'Hero + strip', cols: 4, rows: 3, f: [[0, 0, 4, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1]] },
    { name: 'Two big', cols: 4, rows: 3, f: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1]] },
    { name: 'Banner + row', cols: 3, rows: 2, f: [[0, 0, 3, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] },
    { name: 'Mosaic', cols: 4, rows: 4, f: [[0, 0, 2, 2], [2, 0, 2, 1], [2, 1, 1, 1], [3, 1, 1, 1], [0, 2, 1, 2], [1, 2, 2, 1], [3, 2, 1, 2], [1, 3, 2, 1]] }
  ];
  A.loadUserLayouts = function (raw) {
    A.userLayouts = (Array.isArray(raw) ? raw : []).map(REC.cleanLayout).filter(Boolean);
  };
  function storeUserLayouts(a) {
    A.userLayouts = a;
    return api.storeSet('layouts', a).then(function (ok) { if (!ok) A.toast('Could not save the layout. The data folder is not writable.'); return ok; });
  }
  function layoutThumb(L) {
    var cells = L.f.map(function (f) { return '<i style="grid-column:' + (f[0] + 1) + ' / span ' + f[2] + ';grid-row:' + (f[1] + 1) + ' / span ' + f[3] + '"></i>'; }).join('');
    return '<span class="lthumb" style="grid-template-columns:repeat(' + L.cols + ',1fr);grid-template-rows:repeat(' + L.rows + ',1fr)">' + cells + '</span>';
  }
  function applyLayout(L) {
    var slots = G.layoutSlots(L);
    if (S.items.length > slots.length) {
      A.toast('This layout has ' + slots.length + ' cells but the wall has ' + S.items.length + ' tiles. Remove some tiles or pick a bigger layout.');
      return false;
    }
    A.pushHistory();
    S.items.slice().sort(U.readingOrder).forEach(function (it, i) { var g = slots[i]; it.col = g.col; it.row = g.row; it.w = g.w; it.h = g.h; });
    S.cols = L.cols; S.rows = L.rows;
    A.savePrefs(); A.render(); A.refreshInspector();
    return true;
  }
  A.renderLayouts = function () {
    $('#lgrid').innerHTML = LAYOUTS.map(function (L, i) {
      return '<button class="lbtn" data-i="' + i + '" aria-label="Apply layout ' + esc(L.name) + '">' + layoutThumb(L) + '<span class="lname">' + esc(L.name) + '</span></button>';
    }).join('');
    var mine = A.userLayouts;
    $('#ulist').innerHTML = mine.length ? mine.map(function (L, i) {
      return '<div class="prow" data-i="' + i + '">' + layoutThumb(L) + '<div class="pinfo"><div class="pname">' + esc(L.name) + '</div><div class="pmeta">' + L.cols + ' × ' + L.rows + ' · ' + L.f.length + ' frames</div></div>' +
        '<button class="btn" data-la="apply">Apply</button><button class="btn" data-la="del" aria-label="Delete layout ' + esc(L.name) + '">Delete</button></div>';
    }).join('') : '<p class="note">None yet. Arrange the wall the way you like, name it below and press Save current.</p>';
  };
  $('#lgrid').addEventListener('click', function (e) {
    var b = e.target.closest('.lbtn');
    if (b && applyLayout(LAYOUTS[+b.dataset.i])) A.closePops();
  });
  $('#ulist').addEventListener('click', function (e) {
    var b = e.target.closest('[data-la]');
    if (!b) return;
    var idx = +b.closest('.prow').dataset.i, L = A.userLayouts[idx];
    if (!L) return;
    if (b.dataset.la === 'apply') { if (applyLayout(L)) A.closePops(); return; }
    if (!armed(b)) return;
    var next = A.userLayouts.slice(); next.splice(idx, 1);
    storeUserLayouts(next).then(A.renderLayouts);
  });
  $('#layoutForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#layoutName').value.trim().slice(0, 40);
    if (!name) { A.toast('Give the layout a name first.'); $('#layoutName').focus(); return; }
    if (!S.items.length) { A.toast('Place some tiles first. A layout is made from the current frames.'); return; }
    var L = { name: name, cols: S.cols, rows: S.rows, f: S.items.slice().sort(U.readingOrder).map(function (i) { return [i.col, i.row, i.w, i.h]; }) };
    var mine = A.userLayouts.filter(function (x) { return x.name !== name; });
    mine.unshift(L);
    storeUserLayouts(mine.slice(0, 40)).then(function (ok) {
      if (!ok) return;
      $('#layoutName').value = ''; A.renderLayouts(); A.toast('Saved layout "' + name + '".');
    });
  });

  /* ---------- keeping the wall between runs ---------- */
  var sessionTimer = 0;
  function sessionWorthSaving() { return !(S.items.length && S.items.every(function (i) { return i.sample; })); }
  A.scheduleSession = function () {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(function () { if (sessionWorthSaving()) api.storeSet('session', A.currentRecord('')); }, 700);
  };
  window.addEventListener('beforeunload', function () {
    clearTimeout(sessionTimer);
    if (sessionWorthSaving()) api.storeSetSync('session', A.currentRecord(''));
  });
})(window.MW.app);
