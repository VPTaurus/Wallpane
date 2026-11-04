'use strict';
// Check for updates: GitHub's address, comparing versions, and the answers to each kind of reply.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../lib/updates');

test('the newest-release address comes from the GitHub homepage, nothing else', () => {
  assert.equal(U.latestUrl('https://github.com/VPTaurus/wallpane'), 'https://api.github.com/repos/VPTaurus/wallpane/releases/latest');
  assert.equal(U.latestUrl('https://github.com/VPTaurus/wallpane/'), 'https://api.github.com/repos/VPTaurus/wallpane/releases/latest');
  assert.equal(U.latestUrl('https://example.com/VPTaurus/wallpane'), null);
  assert.equal(U.latestUrl('http://github.com/VPTaurus/wallpane'), null);
  assert.equal(U.latestUrl(undefined), null);
});

test('versions compare part by part, with or without a v', () => {
  assert.equal(U.newer('1.7.1', '1.7.0'), true);
  assert.equal(U.newer('v1.10.0', '1.9.9'), true);
  assert.equal(U.newer('2.0.0', '1.99.99'), true);
  assert.equal(U.newer('1.7.0', '1.7.0'), false);
  assert.equal(U.newer('1.6.8', '1.7.0'), false);
  assert.equal(U.newer('1.8.0-beta.1', '1.7.0'), false);   // not a version here
  assert.equal(U.newer('', '1.7.0'), false);
  assert.deepEqual(U.parts('v1.7.0'), [1, 7, 0]);
  assert.equal(U.parts('1.7'), null);
});

// A stand-in for fetch: answers once with status and body (or throws), and keeps what it was asked.
function fake(status, body) {
  const f = async (url, opts) => {
    f.url = url; f.opts = opts;
    if (status === 'throw') throw new TypeError('net::ERR_INTERNET_DISCONNECTED');
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body === 'bad') throw new SyntaxError('bad'); return body; } };
  };
  return f;
}
const ask = (f, current = '1.7.0') => U.check({ fetch: f, url: 'https://api.github.com/repos/o/r/releases/latest', current });

test('a newer release, the same one, and an older one', async () => {
  const f = fake(200, { tag_name: 'v1.7.1' });
  assert.deepEqual(await ask(f), { ok: true, current: '1.7.0', latest: '1.7.1', newer: true });
  assert.equal(f.url, 'https://api.github.com/repos/o/r/releases/latest');
  assert.equal(f.opts.headers['User-Agent'], 'Wallpane/1.7.0');
  assert.ok(f.opts.signal);   // gives up after a while
  assert.deepEqual(await ask(fake(200, { tag_name: 'v1.7.0' })), { ok: true, current: '1.7.0', latest: '1.7.0', newer: false });
  assert.deepEqual(await ask(fake(200, { tag_name: '1.6.8' })), { ok: true, current: '1.7.0', latest: '1.6.8', newer: false });
});

test('no connection, GitHub busy, and answers that cannot be read', async () => {
  assert.deepEqual(await ask(fake('throw')), { ok: false, reason: 'offline' });
  assert.deepEqual(await ask(fake(403, { message: 'API rate limit exceeded' })), { ok: false, reason: 'busy' });
  assert.deepEqual(await ask(fake(429, {})), { ok: false, reason: 'busy' });
  assert.deepEqual(await ask(fake(502, {})), { ok: false, reason: 'busy' });
  assert.deepEqual(await ask(fake(404, { message: 'Not Found' })), { ok: false, reason: 'none' });
  assert.deepEqual(await ask(fake(200, 'bad')), { ok: false, reason: 'none' });
  assert.deepEqual(await ask(fake(200, { tag_name: 'nightly' })), { ok: false, reason: 'none' });
  assert.deepEqual(await ask(fake(200, null)), { ok: false, reason: 'none' });
});
