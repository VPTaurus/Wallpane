'use strict';
// Checks the joins between files that no single test sees: page scripts, the A.* functions the ui/ files share,
// the API the preload exposes, and the IPC channels the main process answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const all = (re, s) => [...s.matchAll(re)].map((m) => m[1]);
const uiFiles = fs.readdirSync(path.join(root, 'renderer', 'ui')).map((f) => 'renderer/ui/' + f);
const ui = uiFiles.map(read).join('\n');

test('index.html loads every page script, and only scripts that exist', () => {
  const srcs = all(/<script src="([^"]+)"><\/script>/g, read('renderer/index.html'));
  for (const s of srcs) assert.ok(fs.existsSync(path.join(root, 'renderer', s)), s + ' is missing');
  const onDisk = ['lib', 'ui'].flatMap((d) => fs.readdirSync(path.join(root, 'renderer', d)).map((f) => d + '/' + f));
  assert.deepEqual(onDisk.filter((f) => !srcs.includes(f)), [], 'scripts not loaded by index.html');
  assert.equal(srcs[srcs.length - 1], 'ui/boot.js', 'boot.js must load last');
  assert.ok(srcs.indexOf('ui/core.js') > srcs.indexOf('lib/records.js'), 'lib/ before ui/');
});

test('every A.something the ui/ files use is defined by one of them', () => {
  const builtIn = ['api', '$', 'S', 'wall', 'inspector', 'tileEls', 'drag', 'winId', 'wallPaused', 'isFs', 'userLayouts'];
  const defined = new Set(builtIn.concat(all(/\bA\.(\w+)\s*=(?!=)/g, ui)));
  const used = new Set(all(/\bA\.(\w+)/g, ui));
  assert.deepEqual([...used].filter((n) => !defined.has(n)), []);
});

test('every wall API the page calls is exposed by the preload, and every preload channel has a handler', () => {
  const preload = read('preload.js');
  const exposed = new Set(all(/^\s{2}(\w+): /gm, preload));
  const called = new Set(all(/\b(?:A\.)?api\.(\w+)\(/g, ui));
  assert.deepEqual([...called].filter((n) => !exposed.has(n)), []);
  const channels = all(/ipcRenderer\.(?:invoke|sendSync)\('([^']+)'/g, preload);
  const main = read('main.js');
  const handled = new Set(all(/(?:handle|ipcMain\.on)\('([^']+)'/g, main));
  assert.deepEqual(channels.filter((c) => !handled.has(c)), []);
  for (const ev of all(/ipcRenderer\.on\('([^']+)'/g, preload)) assert.ok(main.includes("send('" + ev + "'"), ev + ' is never sent');
});
