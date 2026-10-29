// Startup: settings, the last wall (or sample test cards on the very first start), and wall mode if Settings ask for it.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, S = A.S, $ = A.$, api = A.api;

  /* ---------- sample test cards, shown until real media is added ---------- */
  function sampleCard(n) {
    var c = document.createElement('canvas'); c.width = 960; c.height = 540;
    var x = c.getContext('2d'), W = 960, H = 540, i;
    if (n === 0) {
      var bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'], bw = W / 7;
      bars.forEach(function (col, k) { x.fillStyle = col; x.fillRect(k * bw, 0, bw + 1, 360); });
      ['#0000c8', '#101010', '#c800c8', '#101010', '#00c8c8', '#101010', '#c8c8c8'].forEach(function (col, k) { x.fillStyle = col; x.fillRect(k * bw, 360, bw + 1, 45); });
      var g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
      x.fillStyle = g; x.fillRect(0, 405, W, 135);
    } else if (n === 1) {
      x.fillStyle = '#1b2430'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#3a4a60'; x.lineWidth = 1;
      for (i = 0; i <= W; i += 60) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, H); x.stroke(); }
      for (i = 0; i <= H; i += 60) { x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(W, i + 0.5); x.stroke(); }
      x.strokeStyle = '#e6edf7'; x.lineWidth = 3;
      x.beginPath(); x.arc(W / 2, H / 2, 240, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(0, 0); x.lineTo(W, H); x.moveTo(W, 0); x.lineTo(0, H); x.stroke();
    } else if (n === 2) {
      for (i = 0; i < 11; i++) {
        var v = Math.round(i * 25.5); x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(i * (W / 11), 0, W / 11 + 1, H);
        x.fillStyle = v > 127 ? '#000' : '#fff'; x.font = '500 26px monospace'; x.fillText(String(i * 10), i * (W / 11) + 12, 60);
      }
    } else {
      var cols = ['#e29a24', '#2b6fb5', '#d9d9d9', '#1c1f26'];
      for (var yy = 0; yy < 9; yy++) for (var xx = 0; xx < 16; xx++) { x.fillStyle = cols[(xx + yy * 2) % 4]; x.fillRect(xx * 60, yy * 60, 60, 60); }
    }
    x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(16, H - 56, 340, 40);
    x.fillStyle = '#fff'; x.font = '500 22px monospace'; x.fillText('SAMPLE ' + (n + 1) + ' · 960 × 540', 28, H - 28);
    return c.toDataURL('image/png');
  }
  function addSamples() {
    [
      { name: 'Color bars', col: 0, row: 0, w: 2, h: 2 },
      { name: 'Crosshair grid', col: 2, row: 0, w: 2, h: 1 },
      { name: 'Gray ramp', col: 2, row: 1, w: 1, h: 1 },
      { name: 'Checker', col: 3, row: 1, w: 1, h: 1 }
    ].forEach(function (s, n) {
      S.items.push({ id: S.nid++, name: s.name, path: '', kind: 'image', url: sampleCard(n), col: s.col, row: s.row, w: s.w, h: s.h, fit: S.fit, muted: true, loop: true, sample: true, missing: false });
    });
  }

  async function boot() {
    var got = await Promise.all([api.storeGet('prefs'), api.storeGet('session'), api.storeGet('layouts'), api.displays(), api.windowInfo()]);
    A.winId = (got[4] && got[4].id) || 1;
    if (A.winId > 1) document.title = 'Wallpane · Wall ' + A.winId;
    A.render();
    A.applyPrefs(got[0]);
    A.loadUserLayouts(got[2]);
    var displays = Array.isArray(got[3]) ? got[3] : [];
    var sel = $('#display');
    displays.forEach(function (d) {
      var o = document.createElement('option'); o.value = String(d.id); o.textContent = d.label; sel.appendChild(o);
    });
    if (S.display != null && !displays.some(function (d) { return d.id === S.display; })) S.display = null;
    var rec = got[1] ? MW.rec.cleanRecord(got[1], false) : null;
    if (rec && (rec.items.length || (got[1] && Array.isArray(got[1].items)))) {
      var missing = await A.applyRecord(rec, rec.presetName);
      if (missing) A.toast(missing + (missing === 1 ? ' file from your last wall was' : ' files from your last wall were') + ' not found. Use Locate file on a tile.');
    } else {
      if (S.cols >= 4 && S.rows >= 2) addSamples();
      A.render(); A.refreshInspector();
    }
    if (S.startWall) A.setClean(true);
    document.body.dataset.ready = '1';   // for the end-to-end tests
  }
  A.render();
  A.refreshInspector();
  boot();
})(window.MW.app);
