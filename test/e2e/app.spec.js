'use strict';
// Starts the real app against a throwaway data folder and test media, with the file dialogs answered by the test.
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..', '..');

// A solid-colour PNG of the given size.
function png(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe.configure({ mode: 'serial' });

let app, page, dir, media;
const errors = [];

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-e2e-'));
  media = path.join(dir, 'My media');                 // a space in the path on purpose
  fs.mkdirSync(media);
  [[160, 90], [90, 160], [120, 90], [100, 100], [192, 80], [160, 90]].forEach(([w, h], i) => {
    fs.writeFileSync(path.join(media, 'img' + (i + 1) + '.png'), png(w, h, [40 * i, 120, 200 - 30 * i]));
  });
  fs.writeFileSync(path.join(media, 'old clip.avi'), 'not really a video');
  // The same window everywhere: GitHub's Windows runners have a 1024 × 768 screen, so the tests use that size here too.
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'window.json'), JSON.stringify({ wins: { 1: { width: 1024, height: 728 } }, open: [1] }));
  const env = Object.assign({}, process.env, { WALLPANE_USER_DATA: path.join(dir, 'data') });
  // WALLPANE_EXE runs the same tests against a built app (dist\win-unpacked\Wallpane.exe), to catch packaging mistakes.
  app = await electron.launch(process.env.WALLPANE_EXE ? { executablePath: process.env.WALLPANE_EXE, args: [], env } : { args: [root], env });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('body[data-ready="1"]');
});

test.afterAll(async () => {
  if (app) await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// The next open dialog picks `p`; the next save dialog saves to `save`.
async function answerDialogs(p, save) {
  await app.evaluate(({ dialog }, a) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [a.p] });
    if (a.save) dialog.showSaveDialog = async () => ({ canceled: false, filePath: a.save });
  }, { p, save });
}
const toast = () => page.locator('#toast');
const tiles = () => page.locator('#wall .tile');

test('starts with the sample cards', async () => {
  await expect(tiles()).toHaveCount(4);
  await expect(page.locator('#gridLabel')).toHaveText('4 × 3');
  await expect(page.locator('#readout')).toContainText('4 tiles on 12 cells');
});

test('Add > Folder as a playlist fills the empty cells and explains the AVI file', async () => {
  await answerDialogs(media);
  await page.click('#addBtn');
  await page.click('#folderPl');
  await expect(page.locator('#popAdd')).toBeHidden();
  await expect(tiles()).toHaveCount(6);
  await expect(toast()).toContainText('on 6 tiles');
  await expect(toast()).toContainText('1 AVI file cannot play here');
  // The images really load through their file:// addresses.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#wall .tile img')].filter((i) => i.naturalWidth > 0).length)).toBe(6);
});

test('Arrange > Fit to media reshapes the tiles', async () => {
  await page.click('#arrangeMenuBtn');
  await page.click('#fitMediaBtn');
  await expect(toast()).toContainText('Fitted 6 tiles');
});

test('selection is a ring with corner grips; a pinned tile has its own badge', async () => {
  const first = tiles().first();
  await first.click();
  await expect(first).toHaveClass(/\bsel\b/);
  const look = await first.evaluate((el) => {
    const cs = getComputedStyle(el), grip = el.querySelector('.rz[data-edge="nw"]');
    const g = grip.getBoundingClientRect(), t = el.getBoundingClientRect();
    return { offset: cs.outlineOffset, ring: cs.outlineColor !== 'rgba(0, 0, 0, 0)', gripOutside: g.left < t.left && g.top < t.top };
  });
  expect(look).toEqual({ offset: '3px', ring: true, gripOutside: true });
  await first.locator('[data-act="pin"]').click();
  await expect(first.locator('.pinmark')).toBeAttached();
  await expect(first).toHaveClass(/\bpinned\b/);
  await first.locator('[data-act="pin"]').click();
  await page.keyboard.press('Escape');
});

test('Free layout: a folder added one tile per file', async () => {
  await page.click('#settingsBtn');
  await page.click('#clearBtn');
  await expect(page.locator('#clearBtn')).toContainText('Click again');
  await page.click('#clearBtn');
  await expect(tiles()).toHaveCount(0);
  await page.click('#modeSeg [data-mode="free"]');
  await expect(page.locator('#modeSeg [data-mode="free"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gridLabel')).toHaveText('Free');
  await answerDialogs(media);
  await page.click('#addBtn');
  await page.click('#folderTiles');
  await expect(tiles()).toHaveCount(6);
  const overlaps = await page.evaluate(() => {
    const r = [...document.querySelectorAll('#wall .tile')].map((t) => t.getBoundingClientRect());
    let n = 0;
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) {
      if (r[a].left < r[b].right - 1 && r[b].left < r[a].right - 1 && r[a].top < r[b].bottom - 1 && r[b].top < r[a].bottom - 1) n++;
    }
    return n;
  });
  expect(overlaps).toBe(0);
});

test('Fit tile to media gives a tile the exact shape of its image', async () => {
  const tall = page.locator('#wall .tile', { hasText: 'img2.png' });   // 90 x 160
  await tall.click({ button: 'right' });
  await menuItem('Fit tile to media').click();
  await expect(toast()).toContainText('exact shape of its media');
  const box = await tall.boundingBox();
  expect(Math.abs(box.width / box.height - 90 / 160)).toBeLessThan(0.01);
  await page.click('#arrangeMenuBtn');
  await expect(page.locator('#arrangeBtn')).toBeDisabled();
  await page.click('#fitMediaBtn');
  await expect(toast()).toContainText('6 tiles now have the exact shape');
  await page.click('#modeSeg [data-mode="grid"]');
  await expect(toast()).toContainText('Back on the grid');
});

test('presets: save, export and import', async () => {
  await page.click('#presetBtn');
  await page.fill('#presetName', 'E2E wall');
  await page.click('#saveBtn');
  await expect(toast()).toContainText('Saved "E2E wall"');
  const file = path.join(dir, 'export.json');
  await answerDialogs(file, file);
  await page.click('#exportBtn');
  await expect(toast()).toContainText('Exported to');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(data.app).toBe('wallpane');
  expect(data.presets.map((p) => p.name)).toEqual(['E2E wall']);
  await page.click('#importBtn');
  await expect(toast()).toContainText('Imported 1 preset');
});

test('keyboard: Tab selects a tile, Delete removes it, Ctrl+Z brings it back', async () => {
  await page.keyboard.press('Escape');
  await page.locator('#wall .tile').first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#wall .tile.sel')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(tiles()).toHaveCount(5);
  await page.keyboard.press('Control+z');
  await expect(tiles()).toHaveCount(6);
});

test('wall mode goes full screen and keeps the display awake until it ends', async () => {
  await app.evaluate(({ powerSaveBlocker }) => {
    const start = powerSaveBlocker.start.bind(powerSaveBlocker), stop = powerSaveBlocker.stop.bind(powerSaveBlocker);
    globalThis.__blocks = [];
    powerSaveBlocker.start = (type) => { globalThis.__blocks.push('start ' + type); return start(type); };
    powerSaveBlocker.stop = (id) => { globalThis.__blocks.push('stop'); return stop(id); };
  });
  await page.click('#cleanBtn');
  await expect(page.locator('body')).toHaveClass(/clean/);
  await expect.poll(() => app.evaluate(() => globalThis.__blocks)).toEqual(['start prevent-display-sleep']);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/clean/);
  await expect.poll(() => app.evaluate(() => globalThis.__blocks)).toEqual(['start prevent-display-sleep', 'stop']);
});

test('Settings: start in wall mode is saved; starting with Windows is offered only in a built app', async () => {
  await page.click('#settingsBtn');
  // Never clicked here: that would add a real startup entry to this PC.
  if (process.env.WALLPANE_EXE) await expect(page.locator('#setLogin')).toBeEnabled();
  else {
    await expect(page.locator('#setLogin')).toBeDisabled();
    await expect(page.locator('#loginNote')).toContainText('installed or portable app');
  }
  await page.click('#setStartWall');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'prefs.json'), 'utf8')).startWall).toBe(true);
  await page.keyboard.press('Escape');
});

// Tile boxes on screen, and whether any two overlap.
async function layout() {
  return page.evaluate(() => {
    const r = [...document.querySelectorAll('#wall .tile')].map((t) => { const b = t.getBoundingClientRect(); return { id: t.dataset.id, x: b.left, y: b.top, w: b.width, h: b.height }; });
    let overlaps = 0;
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) {
      if (r[a].x < r[b].x + r[b].w - 1 && r[b].x < r[a].x + r[a].w - 1 && r[a].y < r[b].y + r[b].h - 1 && r[b].y < r[a].y + r[a].h - 1) overlaps++;
    }
    return { tiles: r, overlaps };
  });
}
const menuItem = (label) => page.locator('#ctxMenu .mi', { hasText: label });

test('right-click on empty wall makes an empty tile, which then takes media', async () => {
  const before = await tiles().count();
  await page.locator('#wall .slot').first().click({ button: 'right' });
  await expect(page.locator('#ctxMenu')).toBeVisible();
  await menuItem('New empty tile').click();
  await expect(page.locator('#wall .tile.is-empty')).toHaveCount(1);
  await answerDialogs(path.join(media, 'img1.png'));
  await page.click('#wall .tile.is-empty [data-act="choose"]');
  await expect(page.locator('#wall .tile.is-empty')).toHaveCount(0);
  await expect(tiles()).toHaveCount(before + 1);
});

test('Rows and columns: 3 tiles in the first row and 4 in the second', async () => {
  await page.click('#arrangeMenuBtn');
  await page.click('#rowsBtn');
  await expect(page.locator('#popB')).toBeVisible();
  while (await page.locator('#bLines .bline').count() > 2) await page.locator('#bLines [data-b="del"]').last().click();
  await page.locator('#bLines input[data-i="0"]').fill('3');
  await page.locator('#bLines input[data-i="0"]').press('Tab');
  await page.locator('#bLines input[data-i="1"]').fill('4');
  await page.locator('#bLines input[data-i="1"]').press('Tab');
  await expect(page.locator('#bNote')).toContainText('7 tiles in all');
  await page.click('#bApply');
  await expect(page.locator('#gridLabel')).toHaveText('12 × 2');
  const { tiles: t, overlaps } = await layout();
  expect(overlaps).toBe(0);
  const rows = [...new Set(t.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
  expect(rows.length).toBe(2);
  expect(t.filter((b) => Math.round(b.y) === rows[0]).length).toBe(3);
  expect(t.filter((b) => Math.round(b.y) === rows[1]).length).toBe(4);
});

test('on a full grid, a tile grows over an empty tile, which gives way', async () => {
  // Split the first tile: its right half becomes an empty tile and the 12 x 2 grid stays full.
  const first = tiles().first();
  await first.click({ button: 'right' });
  await menuItem('Split side by side').click();
  await expect(page.locator('#wall .tile.is-empty')).toHaveCount(1);
  const before = await layout();
  const a = await first.boundingBox(), cell = a.width / 2;   // the first tile is now 2 of 12 cells wide
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width - 4 + cell, a.y + a.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#wall .tile.is-empty')).toHaveCount(0);
  const after = await layout();
  expect(after.overlaps).toBe(0);
  expect(after.tiles.length).toBe(before.tiles.length - 1);
  expect((await first.boundingBox()).width).toBeGreaterThan(a.width + cell * 0.8);
});

test('Properties card: opens beside the tile from the right-click menu, Esc closes it; help lists the keys', async () => {
  const tile = tiles().nth(2);
  await tile.click({ button: 'right' });
  await menuItem('Properties').click();
  const card = page.locator('#inspector');
  await expect(card).toBeVisible();
  await expect(card.locator('#fW')).toBeVisible();
  await expect(card.locator('#insZoom')).toBeVisible();
  // Typing a width in cells resizes the tile.
  const w0 = (await tile.boundingBox()).width;
  await card.locator('#fW').fill('2');
  await card.locator('#fW').press('Enter');
  await expect.poll(async () => (await tile.boundingBox()).width).toBeGreaterThan(w0 * 0.55);
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await tile.click();
  await page.keyboard.press('Alt+Enter');
  await expect(card).toBeVisible();
  await page.click('#insClose');
  await expect(card).toBeHidden();
  await page.click('#helpBtn');
  await expect(page.locator('#popH')).toContainText('Alt');
  await expect(page.locator('#aboutLine')).toContainText('Wallpane');
  await expect(page.locator('#aboutLine')).toContainText('GPL');
  await expect(page.locator('#aboutLinks')).toContainText('Source code');
  await page.keyboard.press('Escape');
});

test('Free (pixels): resizing pushes the neighbour along; dragging never gets stuck', async () => {
  await page.click('#modeSeg [data-mode="free"]');
  const first = await layout();
  const top = first.tiles.filter((b) => b.y === Math.min(...first.tiles.map((x) => x.y))).sort((a, b) => a.x - b.x);
  const [a, b] = top;
  // Drag the right edge of the first tile 80 px to the right: the second tile is pushed (and squeezed at the wall).
  await page.mouse.move(a.x + a.w - 4, a.y + a.h / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.w + 40, a.y + a.h / 2, { steps: 4 });
  await page.mouse.move(a.x + a.w + 76, a.y + a.h / 2, { steps: 4 });
  await page.mouse.up();
  const after = await layout();
  expect(after.overlaps).toBe(0);
  const a2 = after.tiles.find((x) => x.id === a.id), b2 = after.tiles.find((x) => x.id === b.id);
  expect(a2.w).toBeGreaterThan(a.w + 60);
  expect(b2.x).toBeGreaterThan(b.x + 60);
  // Drag that tile into the bottom row: it follows the pointer, and lands somewhere valid (pushing others or swapping).
  const target = after.tiles.reduce((m, x) => (x.y > m.y ? x : m));
  await page.mouse.move(a2.x + a2.w / 2, a2.y + a2.h / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.w / 2, target.y + target.h / 2, { steps: 12 });
  await page.mouse.up();
  const moved = await layout();
  expect(moved.overlaps).toBe(0);
  expect(moved.tiles.length).toBe(after.tiles.length);
  const a3 = moved.tiles.find((x) => x.id === a.id);
  expect(Math.abs(a3.y - a2.y) + Math.abs(a3.x - a2.x)).toBeGreaterThan(20);
});

test('scroll to zoom the selected tile; reposition and reset from the right-click menu', async () => {
  const tile = tiles().nth(1), img = tile.locator('img');
  await tile.click();
  const box = await tile.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(() => img.evaluate((e) => e.style.transform)).toContain('scale(');
  await tile.click({ button: 'right' });
  await menuItem('Reposition and zoom').click();
  await expect(tile).toHaveClass(/\brepos\b/);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => img.evaluate((e) => e.style.objectPosition)).not.toBe('50.00% 50.00%');
  await page.keyboard.press('Escape');
  await expect(tile).not.toHaveClass(/\brepos\b/);
  await tile.click({ button: 'right' });
  await menuItem('Reset position and zoom').click();
  await expect.poll(() => img.evaluate((e) => e.style.transform)).toBe('');
});

test('split a tile from the right-click menu; the new half is an empty tile', async () => {
  const count = await tiles().count();
  await tiles().first().click({ button: 'right' });
  await menuItem('Split side by side').click();
  await expect(tiles()).toHaveCount(count + 1);
  await expect(page.locator('#wall .tile.is-empty')).toHaveCount(1);
  expect((await layout()).overlaps).toBe(0);
});

test('a tile playing its own folder: playlist settings in its Properties', async () => {
  const id = await page.locator('#wall .tile.is-image').first().getAttribute('data-id');
  // The element is rebuilt when the media changes; during a crossfade the old one (.leaving) is still there for a moment.
  const tile = () => page.locator('#wall .tile[data-id="' + id + '"]:not(.leaving)');
  await answerDialogs(media);
  await tile().click({ button: 'right' });
  await menuItem('Own folder').click();
  await expect(toast()).toContainText('This tile now plays');
  await tile().click({ button: 'right' });
  await menuItem('Playlist settings').click();
  const card = page.locator('#inspector');
  await expect(card.locator('#plSec')).toContainText('6 files');
  await card.locator('#pSecs').fill('3');
  await card.locator('#pSecs').press('Enter');
  await card.locator('#pOrder').selectOption('shuffle');
  await card.locator('#pFade').selectOption('1');
  await card.locator('#pMax').fill('20');
  await card.locator('#pMax').press('Enter');
  const settings = () => page.evaluate(() => { const A = window.MW.app, p = A.S.playlists[A.selected().pl]; return { secs: p.secs, shuffle: p.shuffle, fade: p.fade, maxClip: p.maxClip, keepView: p.keepView }; });
  expect(await settings()).toEqual({ secs: 3, shuffle: true, fade: 1, maxClip: 20, keepView: false });
  // The playlist moves on by itself after 3 seconds; the card stays open and shows the new file's name.
  const name0 = await card.locator('.ins-name').textContent();
  await expect.poll(() => card.locator('.ins-name').textContent(), { timeout: 8000 }).not.toBe(name0);
  await expect(card.locator('#pSecs')).toHaveValue('3');
  // Keep zoom and position: zoom in, and the next file comes up zoomed the same way.
  await card.locator('#pView').selectOption('keep');
  const b = await tile().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -500);
  const zoom = () => page.evaluate(() => window.MW.app.selected().zoom || 1);
  await expect.poll(zoom).toBeGreaterThan(1.5);
  const z1 = await zoom(), name1 = await card.locator('.ins-name').textContent();
  await expect.poll(() => card.locator('.ins-name').textContent(), { timeout: 8000 }).not.toBe(name1);
  expect(await zoom()).toBeCloseTo(z1, 5);
  await expect.poll(() => tile().locator('img').evaluate((e) => e.style.transform)).toContain('scale(');
  await card.locator('#plLeave').click();
  await expect(card.locator('#plSec')).toHaveCount(0);
  expect(await page.evaluate(() => window.MW.app.selected().pl)).toBeNull();
  await page.keyboard.press('Escape');
});

test('video controls: speed, volume, a looped part, and keys', async () => {
  // Record a 3-second WebM right in the page (canvas + MediaRecorder), so the test needs no video file of its own.
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const g = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start();
    const t0 = performance.now();
    await new Promise((done) => (function draw() {
      const t = performance.now() - t0;
      g.fillStyle = 'hsl(' + Math.round(t / 10) % 360 + ',70%,50%)'; g.fillRect(0, 0, 160, 90);
      if (t < 3000) requestAnimationFrame(draw); else done();
    })());
    rec.stop(); await stopped;
    const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  });
  const clip = path.join(dir, 'clip.webm');
  fs.writeFileSync(clip, Buffer.from(b64, 'base64'));
  await answerDialogs(clip);
  await page.click('#addBtn');
  await page.click('#addFiles');
  const tile = page.locator('#wall .tile.is-video').first(), video = tile.locator('video');
  await expect(tile).toBeVisible();
  // A recorded WebM doesn't say how long it is; the app finds out by itself.
  await expect.poll(() => video.evaluate((v) => v.duration), { timeout: 10000 }).toBeGreaterThan(2);
  await expect(tile.locator('.vbar .vseek')).toBeAttached();
  // From the right-click menu (on a narrow tile, a click near its top may land on one of the tile's buttons).
  await tile.click({ button: 'right' });
  await menuItem('Loop a part').click();                      // opens Properties at Playback
  const card = page.locator('#inspector');
  await card.locator('#insSpeed').selectOption('2');
  await expect.poll(() => video.evaluate((v) => v.playbackRate)).toBe(2);
  await card.locator('#insVol').fill('50');
  await expect.poll(() => video.evaluate((v) => v.volume)).toBeCloseTo(0.5, 2);
  // Loop 0.5 s to 1.5 s: the video stays in that part.
  await card.locator('#insLoopA').fill('0.5');
  await card.locator('#insLoopA').press('Tab');
  await card.locator('#insLoopB').fill('1.5');
  await card.locator('#insLoopB').press('Tab');
  await expect(tile.locator('.vloop')).toBeVisible();
  await card.locator('#insSpeed').selectOption('1');
  await video.evaluate((v) => v.play());
  const times = [];
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(200); times.push(await video.evaluate((v) => v.currentTime)); }
  expect(Math.min(...times)).toBeGreaterThanOrEqual(0.45);
  expect(Math.max(...times)).toBeLessThan(1.7);
  // Keys on the selected video: Space pauses, > speeds up, \ stops looping the part.
  await page.keyboard.press('Escape');                       // close Properties, keep the tile selected
  await page.locator('body').press('Space');
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
  await page.locator('body').press('Shift+Period');
  await expect.poll(() => video.evaluate((v) => v.playbackRate)).toBe(1.25);
  await page.locator('body').press('Backslash');
  await expect(tile.locator('.vloop')).toBeHidden();
  await page.keyboard.press('Escape');
});

test('emergency hide: the key covers the wall with a spreadsheet, silences it, and brings it all back', async () => {
  const video = page.locator('#wall .tile.is-video video').first();
  await video.evaluate((v) => v.play());
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  const count = await tiles().count();
  const muted = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isAudioMuted());
  await tiles().first().click({ button: 'right' });            // selects it (Delete would remove it)
  await page.keyboard.press('Escape');                         // closes the menu, keeps the tile selected
  await page.keyboard.press('Control+Shift+H');
  const cover = page.locator('#cover');
  await expect(cover).toBeVisible();
  await expect(cover.locator('.sh-grid')).toContainText('Department budget 2026');
  await expect(page).toHaveTitle('Budget 2026.xlsx');
  await expect.poll(muted).toBe(true);
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
  // While hidden, keys don't reach the wall (Delete would remove the selected tile); the spreadsheet takes the arrows.
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  await expect(cover.locator('.sh-ref')).toHaveText('C5');
  await page.keyboard.press('Control+Shift+H');
  await expect(cover).toBeHidden();
  await expect(page).not.toHaveTitle('Budget 2026.xlsx');
  await expect.poll(muted).toBe(false);
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  expect(await tiles().count()).toBe(count);
});

test('emergency hide settings: a new key, a black screen, and windows that go away', async () => {
  await page.keyboard.press('Escape');
  await page.click('#settingsBtn');
  const key = page.locator('#hideKey');
  await expect(key).toHaveText('Ctrl + Shift + H');
  // A key other programs need is refused; Esc stops recording.
  await key.click();
  await expect(key).toHaveText('Press the new keys…');
  await page.keyboard.press('Control+H');
  await expect(page.locator('#hideNote')).toContainText('two modifier');
  await page.keyboard.press('Escape');
  await expect(key).toHaveText('Ctrl + Shift + H');
  await key.click();
  await page.keyboard.press('Control+Shift+J');
  await expect(key).toHaveText('Ctrl + Shift + J');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'hide.json'), 'utf8')).key).toBe('Ctrl+Shift+J');
  await expect(page.locator('#helpHideKey')).toHaveText('Ctrl Shift J');   // Help shows the new key
  // Black screen, from Hide now.
  await page.locator('#hideCover').selectOption('black');
  await page.click('#hideTry');
  await expect(page.locator('#cover')).toHaveClass(/\bblack\b/);
  await expect(page.locator('#cover')).toBeVisible();
  await page.keyboard.press('Control+Shift+H');                 // the old key does nothing now
  await expect(page.locator('#cover')).toBeVisible();
  await page.keyboard.press('Control+Shift+J');
  await expect(page.locator('#cover')).toBeHidden();
  // The windows go away and come back.
  await page.click('#settingsBtn');
  await page.locator('#hideCover').selectOption('away');
  const visible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  await page.click('#hideTry');
  await expect.poll(visible).toBe(false);
  await page.evaluate(() => window.wall.toggleHide());
  await expect.poll(visible).toBe(true);
  await page.click('#settingsBtn');
  await page.locator('#hideCover').selectOption('sheet');
  await page.keyboard.press('Escape');
});

test('time in the bar: clock, stopwatch with laps, and a timer that rings', async () => {
  await expect(page.locator('#clock')).toHaveText(/^\d{1,2}:\d{2}/);
  await page.click('#timeBtn');
  await expect(page.locator('#popT')).toBeVisible();
  await expect(page.locator('#bigClock')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  // The 24-hour choice is saved with the window's settings.
  await page.locator('#clock24').setChecked(false);
  await expect(page.locator('#clock')).toHaveText(/[AP]M$/);
  await page.locator('#clock24').setChecked(true);
  await expect(page.locator('#clock')).not.toHaveText(/M$/);
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'prefs.json'), 'utf8')).clock24).toBe(true);
  // Stopwatch
  await page.click('#swGo');
  await expect(page.locator('#swChip')).toBeVisible();
  await expect(page.locator('#swTime')).not.toHaveText('0:00.0');
  await page.click('#swLap');
  await expect(page.locator('#swLaps li')).toHaveCount(1);
  await page.click('#swGo');                                   // pause
  const held = await page.locator('#swTime').textContent();
  await page.waitForTimeout(300);
  await expect(page.locator('#swTime')).toHaveText(held);
  await page.click('#swReset');
  await expect(page.locator('#swTime')).toHaveText('0:00.0');
  await expect(page.locator('#swChip')).toBeHidden();
  // Timer: 2 seconds
  await page.locator('#tmSet').fill('0:02');
  await page.click('#tmGo');
  await expect(page.locator('#tmChip')).toBeVisible();
  await expect(page.locator('#tmChip')).toHaveClass(/\bdone\b/, { timeout: 6000 });
  await expect(toast()).toContainText('is up');
  await page.click('#tmReset');
  await expect(page.locator('#tmChip')).toBeHidden();
  await expect(page.locator('#tmTime')).toHaveText('0:02');
  await page.keyboard.press('Escape');
});

test('no page errors along the way', async () => {
  expect(errors).toEqual([]);
});
