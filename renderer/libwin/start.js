// The library window's start: its settings from libwin.json, then the view, filled.
(function (A) {
  'use strict';
  if (!A || !A.libView) return;
  Promise.all([A.api.storeGet('libwin'), A.api.appInfo()]).then(function (got) {
    A.hasFfmpeg = !!(got[1] && got[1].ffmpeg);
    A.S.lib = A.libView.cleanPrefs(got[0]);
    A.libView.show();
    A.$('#libSearch').focus();
    document.body.dataset.ready = '1';   // for the end-to-end tests
  });
  // Shown again after being hidden: what changed meanwhile.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && A.S.lib) A.libView.show(); });
})(window.MW.app);
