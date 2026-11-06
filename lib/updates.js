'use strict';
// Settings › General › Check for updates: the one time Wallpane goes online, and only when that button is clicked.
// It asks GitHub which release is the newest and says whether it is newer than this copy. Nothing is downloaded: the
// page offers the release page in the browser.

// The newest release of the repository behind https://github.com/<owner>/<repo> (package.json's homepage), from
// GitHub's API; null for any other address.
function latestUrl(homepage) {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)\/?$/.exec(String(homepage || ''));
  return m ? 'https://api.github.com/repos/' + m[1] + '/' + m[2] + '/releases/latest' : null;
}

// "v1.7.1" or "1.7.1" -> [1, 7, 1]; null when it is not a version. A pre-release ("1.8.0-beta.1") is no version here:
// GitHub's latest release is never one anyway.
function parts(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// Whether version a is newer than version b.
function newer(a, b) {
  const x = parts(a), y = parts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// Asks once. fetch is Electron's net.fetch (or any fetch, for tests). Answers
//   { ok: true, current, latest, newer }   or   { ok: false, reason: 'offline' | 'busy' | 'none' }
// offline: GitHub could not be reached; busy: GitHub said not now (it allows 60 questions an hour from one address);
// none: no release could be read.
async function check({ fetch, url, current, timeoutMs = 15000 }) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Wallpane/' + current },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 403 || res.status === 429 || res.status >= 500) return { ok: false, reason: 'busy' };
  if (!res.ok) return { ok: false, reason: 'none' };
  let body;
  try { body = await res.json(); } catch { return { ok: false, reason: 'none' }; }
  const tag = body && typeof body.tag_name === 'string' ? body.tag_name.trim() : '';
  if (!parts(tag)) return { ok: false, reason: 'none' };
  const latest = tag.replace(/^v/, '');
  return { ok: true, current, latest, newer: newer(latest, current) };
}

module.exports = { latestUrl, parts, newer, check };
