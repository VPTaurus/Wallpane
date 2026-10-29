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
  const env = Object.assign({}, process.env, { MEDIA_WALL_USER_DATA: path.join(dir, 'data') });
  // MEDIA_WALL_EXE runs the same tests against a built app (dist\win-unpacked\Media Wall.exe), to catch packaging mistakes.
  app = await electron.launch(process.env.MEDIA_WALL_EXE ? { executablePath: process.env.MEDIA_WALL_EXE, args: [], env } : { args: [root], env });
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
  await expect(page.locator('#readout')).toContainText('4 × 3');
});

test('Add folder > As a playlist fills the empty cells and explains the AVI file', async () => {
  await answerDialogs(media);
  await page.click('#folderBtn');
  await page.click('#folderPl');
  await expect(tiles()).toHaveCount(6);
  await expect(toast()).toContainText('on 6 tiles');
  await expect(toast()).toContainText('1 AVI file cannot play here');
  // The images really load through their file:// addresses.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#wall .tile img')].filter((i) => i.naturalWidth > 0).length)).toBe(6);
});

test('Fit to media reshapes the tiles', async () => {
  await page.click('#fitMediaBtn');
  await expect(toast()).toContainText('Fitted 6 tiles');
});

test('Free layout: a folder added one tile per file', async () => {
  await page.click('#clearBtn');
  await page.click('#clearBtn');
  await expect(tiles()).toHaveCount(0);
  await page.selectOption('#modeSel', 'free');
  await answerDialogs(media);
  await page.click('#folderBtn');
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
  await page.selectOption('#modeSel', 'grid');
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
  expect(data.app).toBe('media-wall');
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
  if (process.env.MEDIA_WALL_EXE) await expect(page.locator('#setLogin')).toBeEnabled();
  else {
    await expect(page.locator('#setLogin')).toBeDisabled();
    await expect(page.locator('#loginNote')).toContainText('installed or portable app');
  }
  await page.click('#setStartWall');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'prefs.json'), 'utf8')).startWall).toBe(true);
  await page.keyboard.press('Escape');
});

test('no page errors along the way', async () => {
  expect(errors).toEqual([]);
});
