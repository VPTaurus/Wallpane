// Background music: a folder of the user's own music plays behind the wall, one track after another (in name order
// or shuffled) with its own volume. It keeps playing in wall mode, pauses with the emergency hide, and starts again on
// the next start if it was playing. Each window has its own (Settings are per window).
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, PL = MW.pl;
  var S = A.S, $ = A.$, api = A.api, ICON = A.ICON;
  var audio = document.createElement('audio'), list = [], order = [], pos = -1, fails = 0;
  audio.preload = 'auto';
  audio.hidden = true;
  document.body.appendChild(audio);   // in the page, so the emergency hide can pause and resume it like a video
  A.musicEl = audio;

  function current() { return pos > -1 && pos < order.length ? list[order[pos]] : null; }
  function title(f) { return f ? f.name.replace(/\.[^.]+$/, '') : ''; }
  // A track by its place in the order; past either end a new round starts (reshuffled when shuffling).
  function playAt(p) {
    if (!list.length) return;
    if (p >= order.length || p < 0) { order = PL.makeOrder(list.length, S.music.shuffle); p = p < 0 ? order.length - 1 : 0; }
    pos = p;
    audio.src = U.fileUrl(list[order[pos]].path);
    audio.volume = S.music.vol;
    audio.play().catch(function () {});
    S.music.on = true; A.savePrefs(); show();
  }
  function next() { playAt(pos + 1); }
  audio.addEventListener('ended', next);
  audio.addEventListener('playing', function () { fails = 0; show(); });
  audio.addEventListener('pause', show);
  // A track that cannot play is skipped; when none of them can, the music stops with a word why.
  audio.addEventListener('error', function () {
    if (!audio.getAttribute('src')) return;
    if (++fails >= list.length) { stop(); A.toast('None of the music in that folder plays here.'); return; }
    next();
  });

  // The folder's tracks, from a dialog or read again at start. Returns false when it holds no music.
  function useFolder(res, play) {
    list = (res && res.entries) || [];
    if (!list.length) {
      A.toast('No music found there. Wallpane plays MP3, M4A, AAC, WAV, OGG, Opus and FLAC files.');
      show();
      return false;
    }
    S.music.root = res.root;
    order = PL.makeOrder(list.length, S.music.shuffle); pos = -1;
    if (play) playAt(0); else { A.savePrefs(); show(); }
    return true;
  }
  function stop() {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    list = []; order = []; pos = -1;
    S.music.root = null; S.music.on = false; A.savePrefs(); show();
  }
  function chooseFolder() {
    api.chooseMusicFolder().then(function (res) {
      if (res && useFolder(res, true)) A.toast('Playing ' + list.length + (list.length === 1 ? ' track' : ' tracks') + ' from "' + U.baseName(res.root) + '".');
    });
  }

  function show() {
    var f = current(), playing = !!f && !audio.paused;
    $('#musicName').textContent = f ? title(f) : (list.length ? list.length + ' tracks ready' : 'No music yet');
    $('#musicInfo').textContent = S.music.root
      ? U.baseName(S.music.root) + ' · ' + list.length + (list.length === 1 ? ' track' : ' tracks') + (f ? ' · ' + (pos + 1) + ' of ' + order.length : '')
      : 'Choose a folder of your own music to play behind the wall.';
    var b = $('#musicPlay');
    b.innerHTML = '<span class="ic" aria-hidden="true">' + (playing ? ICON.pause : ICON.play) + '</span>';
    b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); b.title = playing ? 'Pause' : 'Play';
    $('#musicPrev').disabled = $('#musicNext').disabled = !list.length;
    $('#musicStop').disabled = !S.music.root;
    $('#musicVol').value = Math.round(S.music.vol * 100);
    $('#musicShuffle').checked = S.music.shuffle;
    $('#musicBtn').classList.toggle('on', playing);
    $('#musicBtn').title = playing ? 'Background music: ' + title(f) : 'Background music';
  }
  A.refreshMusic = show;

  $('#musicFolderBtn').addEventListener('click', chooseFolder);
  $('#musicStop').addEventListener('click', stop);
  $('#musicNext').addEventListener('click', next);
  // Back to the start of the track, or to the one before when it has only just begun.
  $('#musicPrev').addEventListener('click', function () {
    if (audio.currentTime > 3) audio.currentTime = 0; else playAt(pos - 1);
  });
  $('#musicPlay').addEventListener('click', function () {
    if (!list.length) { chooseFolder(); return; }
    if (!audio.paused) { audio.pause(); S.music.on = false; A.savePrefs(); return; }
    if (pos < 0) { playAt(0); return; }
    audio.play().catch(function () {}); S.music.on = true; A.savePrefs();
  });
  $('#musicVol').addEventListener('input', function () { S.music.vol = this.value / 100; audio.volume = S.music.vol; });
  $('#musicVol').addEventListener('change', function () { A.savePrefs(); });
  // Shuffling on or off starts a new order with the track that is playing first.
  $('#musicShuffle').addEventListener('change', function () {
    S.music.shuffle = this.checked;
    var f = current();
    order = PL.makeOrder(list.length, S.music.shuffle);
    if (f) { var i = list.indexOf(f); order.splice(order.indexOf(i), 1); order.unshift(i); pos = 0; }
    A.savePrefs(); show();
  });

  // At start: the folder from last time, playing again if it was playing.
  A.startMusic = function () {
    show();
    if (!S.music.root) return;
    var root = S.music.root;
    api.musicFiles(root).then(function (res) {
      // A drive that is not there yet: say so, and keep the folder for next time.
      if (!res.entries || !res.entries.length) { A.toast('Background music: "' + U.baseName(root) + '" has no music right now.'); return; }
      useFolder(Object.assign({}, res, { root: root }), S.music.on);
    });
  };
})(window.MW.app);
