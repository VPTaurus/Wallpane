'use strict';
// The wall's playlists and windows, each test with its own Wallpane: a folder bigger than a Free wall, Previous,
// files shaped like their tiles after Fill the wall, and a minimized window resting.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const { png } = require('./media');
const { start, root } = require('./launch');

const ff = FF.create(path.join(root, 'vendor', 'ffmpeg'));

let dir;
test.beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-wall-e2e-')); });
test.afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const tiles = (page) => page.locator('#wall .tile:not(.leaving)');
const toast = (page) => page.locator('#toast');
const label = (page, id) => page.locator('#wall .tile[data-id="' + id + '"]').getAttribute('aria-label');
async function tileButton(page, id, act) {
  const t = page.locator('#wall .tile[data-id="' + id + '"]');
  await t.hover();
  await t.locator('[data-act="' + act + '"]').click();
}

test('Free (pixels): a folder bigger than the wall plays in turn on the tiles it fills, with Next and Previous', async () => {
  const media = path.join(dir, 'Lots');
  fs.mkdirSync(media);
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(media, 'pic ' + String(i).padStart(2, '0') + '.png'), png(160, 90, [6 * i, 120, 200]));
  const { app, page, errors, answer } = await start(dir);
  try {
    await page.click('#modeSeg [data-mode="free"]');
    await answer(media);
    await page.click('#addBtn');
    await page.click('#folderTiles');
    await expect(toast(page)).toContainText('There are 40 files, so');
    const n = await tiles(page).count();
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(40);

    const id = await tiles(page).first().getAttribute('data-id');
    const first = await label(page, id);
    await expect(page.locator('#wall .tile[data-id="' + id + '"] [data-act="prev"]')).toHaveCount(0);   // nothing earlier yet
    await tileButton(page, id, 'next');
    await expect.poll(() => label(page, id)).not.toBe(first);
    const second = await label(page, id);
    expect(second).toMatch(/^pic (\d\d)\.png/);
    expect(Number(second.slice(4, 6))).toBeGreaterThanOrEqual(n);   // one that did not fit on the wall
    await tileButton(page, id, 'prev');
    await expect.poll(() => label(page, id)).toBe(first);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('after Fill the wall, a tall tile of a playlist moves on to tall files, a wide one to wide files', async () => {
  const media = path.join(dir, 'Mixed');
  fs.mkdirSync(media);
  for (let i = 0; i < 30; i++) {
    const tall = i % 2 === 1;
    fs.writeFileSync(path.join(media, 'f' + String(i).padStart(2, '0') + (tall ? ' tall' : ' wide') + '.png'), tall ? png(90, 160, [200, 60, 4 * i]) : png(160, 90, [4 * i, 60, 200]));
  }
  const { app, page, errors, answer } = await start(dir);
  try {
    await page.click('#modeSeg [data-mode="free"]');
    await answer(media);
    await page.click('#addBtn');
    await page.click('#folderTiles');
    await expect(toast(page)).toContainText('There are 30 files, so');
    await page.waitForFunction(() => [...document.querySelectorAll('#wall .tile img')].every((i) => i.complete && i.naturalWidth));
    await page.click('#arrangeMenuBtn');
    await page.click('#fillWallBtn');
    await expect(toast(page)).toContainText('Its playlists now pick files shaped like their tiles first.');

    for (const kind of ['tall', 'wide']) {
      const id = await page.evaluate((k) => {
        const t = [...document.querySelectorAll('#wall .tile')].find((el) => el.getAttribute('aria-label').includes(' ' + k));
        return t && t.dataset.id;
      }, kind);
      expect(id).toBeTruthy();
      for (let step = 0; step < 3; step++) {
        const was = await label(page, id);
        await tileButton(page, id, 'next');
        await expect.poll(() => label(page, id)).not.toBe(was);
        expect(await label(page, id)).toContain(' ' + kind + '.png');
      }
    }
    // The playlist says so in its settings, where it can be turned off.
    await page.locator('#wall .tile').first().click({ button: 'right' });
    await page.locator('#ctxMenu .mi', { hasText: 'Playlist settings' }).click();
    await expect(page.locator('#pShape')).toHaveValue('tile');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('the top bar opens another wall window', async () => {
  const { app, page, errors } = await start(dir);
  try {
    const opened = app.waitForEvent('window');
    await page.click('#newWinBtn');
    const w2 = await opened;
    await w2.waitForSelector('body[data-ready="1"]');
    await expect(w2).toHaveTitle('Wallpane · Wall 2');
    await expect(w2.locator('#readout')).toContainText('Wall 2');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('the start: an empty wall offers the last one, which comes back, or stays in Saved walls', async () => {
  const media = path.join(dir, 'pics');
  fs.mkdirSync(media);
  const files = ['one.png', 'two.png'].map((n, i) => { const p = path.join(media, n); fs.writeFileSync(p, png(160, 90, [120 * i, 80, 160])); return p; });
  const apps = [];
  const open = async () => { const s = await start(dir); apps.push(s.app); return s; };
  const restart = async (s) => { await s.page.waitForTimeout(1000); expect(s.errors).toEqual([]); await s.app.close(); return open(); };
  const addFiles = async (s, list) => { await s.answer(list); await s.page.click('#addBtn'); await s.page.click('#addFiles'); };
  const startWith = async (s, v) => { await s.page.click('#settingsBtn'); await s.page.click('#tabGeneral'); await s.page.selectOption('#setStartWith', v); await s.page.keyboard.press('Escape'); };
  try {
    let s = await open();
    await addFiles(s, files);
    await expect(tiles(s.page)).toHaveCount(2);

    // Offered, and restored.
    s = await restart(s);
    await expect(tiles(s.page)).toHaveCount(0);
    await expect(s.page.locator('#lastWall')).toBeVisible();
    await expect(s.page.locator('#lastWallInfo')).toContainText('2 files');
    await expect(s.page.locator('#lastWallMap i.media')).toHaveCount(2);
    await s.page.click('#lastWallRestore');
    await expect(tiles(s.page)).toHaveCount(2);
    await expect(s.page.locator('#lastWall')).toBeHidden();

    // Offered, and something else put on the wall: the last wall goes to Saved walls.
    s = await restart(s);
    await expect(s.page.locator('#lastWall')).toBeVisible();
    await addFiles(s, [files[0]]);
    await expect(tiles(s.page)).toHaveCount(1);
    await expect(s.page.locator('#lastWall')).toBeHidden();
    await s.page.click('#presetBtn');
    await expect(s.page.locator('#plist')).toContainText('Last wall');
    await expect(s.page.locator('#plist')).toContainText('2 items');
    await s.page.keyboard.press('Escape');

    // "Open the last wall": no offer, the wall as it was.
    await startWith(s, 'last');
    s = await restart(s);
    await expect(tiles(s.page)).toHaveCount(1);
    await expect(s.page.locator('#lastWall')).toBeHidden();

    // Back to offering; Start empty; then the empty wall is what comes back, without an offer.
    await startWith(s, 'offer');
    s = await restart(s);
    await expect(s.page.locator('#lastWall')).toBeVisible();
    await s.page.click('#lastWallEmpty');
    await expect(toast(s.page)).toContainText('Your last wall is in Saved walls as "Last wall".');
    await expect(tiles(s.page)).toHaveCount(0);
    s = await restart(s);
    await expect(s.page.locator('#lastWall')).toBeHidden();
    await expect(tiles(s.page)).toHaveCount(0);
    expect(s.errors).toEqual([]);
  } finally { for (const a of apps) await a.close().catch(() => {}); }
});

test('a full wall says so, or with the setting takes the file anyway and fills the wall again; one Ctrl+Z undoes it', async () => {
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'window.json'), JSON.stringify({ wins: { 1: { width: 1024, height: 728 } }, open: [1] }));
  fs.writeFileSync(path.join(data, 'prefs.json'), JSON.stringify({ cols: 2, rows: 2 }));
  const wide = [0, 1, 2, 3].map((i) => { const p = path.join(dir, 'wide ' + i + '.png'); fs.writeFileSync(p, png(160, 90, [40 * i, 90, 160])); return p; });
  const tall = path.join(dir, 'tall.png');
  fs.writeFileSync(tall, png(90, 160, [200, 60, 60]));
  const { app, page, errors, answer } = await start(dir);
  const add = async (p) => { await answer(p); await page.click('#addBtn'); await page.click('#addFiles'); };
  const freeMode = () => page.locator('#modeSeg [data-mode="free"]').getAttribute('aria-pressed');
  try {
    await add(wide);
    await expect(tiles(page)).toHaveCount(4);
    await add(tall);
    await expect(toast(page)).toContainText('did not fit');
    await expect(toast(page)).toContainText('When the wall is full');
    await expect(tiles(page)).toHaveCount(4);

    await page.click('#settingsBtn');
    await page.click('#tabGeneral');
    await page.selectOption('#setFullWall', 'fill');
    await page.keyboard.press('Escape');
    await add(tall);
    await expect(toast(page)).toContainText('The wall was full, so a new tile joined it.');
    await expect(tiles(page)).toHaveCount(5);
    expect(await freeMode()).toBe('true');
    const box = await page.locator('#wall .tile[aria-label^="tall.png"]').boundingBox();
    expect(box.height).toBeGreaterThan(box.width);   // shaped like its picture

    await page.keyboard.press('Control+z');
    await expect(tiles(page)).toHaveCount(4);
    expect(await freeMode()).toBe('false');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('minimized, the wall pauses, and plays on when the window is back', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  const win = (how) => app.evaluate(({ BrowserWindow }, h) => { BrowserWindow.getAllWindows()[0][h](); }, how);
  const playing = () => page.evaluate(() => { const v = document.querySelector('#wall video'); return !!v && !v.paused; });
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(playing).toBe(true);
    await win('minimize');
    await expect.poll(playing).toBe(false);
    await win('restore');
    await expect.poll(playing).toBe(true);

    // With the setting off, it keeps playing.
    await page.click('#settingsBtn');
    await page.click('#tabGeneral');
    await page.locator('#setPauseMin').uncheck();
    await page.keyboard.press('Escape');
    await win('minimize');
    await page.waitForTimeout(800);
    expect(await playing()).toBe(true);
    await win('restore');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('over a video tile\'s timeline: the time under the pointer, and the frame there from a strip made once', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'twenty.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  const peek = page.locator('#wall .vpeek');
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    const tile = page.locator('#wall .tile[aria-label^="twenty.mp4"]');
    await expect.poll(() => tile.locator('video').evaluate((v) => v.duration)).toBeGreaterThan(19);
    await tile.hover();
    const box = await tile.locator('.vtrack').boundingBox();
    const at = (f) => page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
    await at(0.75);
    await expect(peek).toBeVisible();
    await expect(peek.locator('span')).toHaveText('0:15');
    // Once the strip is there, the frame shows: the 16th of 20, in the second row (10 to a row).
    await expect.poll(async () => { await at(0.76); await at(0.75); return peek.locator('.vpic').evaluate((p) => !p.hidden && p.style.backgroundImage); }, { timeout: 20000 }).toMatch(/strip20\.webp/);
    const [x, y, w, h] = await peek.locator('.vpic').evaluate((p) => p.style.backgroundPosition.split(' ').map(parseFloat).concat(p.getBoundingClientRect().width, p.getBoundingClientRect().height));
    expect(Math.abs(x + 5 * w)).toBeLessThan(0.5);   // column 6
    expect(Math.abs(y + h)).toBeLessThan(0.5);       // row 2
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    await expect(peek).toBeHidden();
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('a big video on a small tile plays from a lighter copy, paused or playing as it was; a 720p one keeps its file', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const make = (name, size) => ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=' + size + ':rate=25:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(dir, name)], { timeoutMs: 60000 });
  await make('big.mp4', '1920x1080');
  await make('small.mp4', '1280x720');
  const { app, page, errors, answer } = await start(dir);
  const video = (name) => page.locator('#wall .tile[aria-label^="' + name + '"] video');
  const src = (name) => video(name).getAttribute('src');
  const state = (name) => video(name).evaluate((v) => ({ paused: v.paused, t: v.currentTime }));
  try {
    await answer([path.join(dir, 'big.mp4'), path.join(dir, 'small.mp4')]);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(() => src('big.mp4'), { timeout: 60000 }).toMatch(/proxies/);
    await expect.poll(async () => (await state('big.mp4')).paused).toBe(false);
    expect(await src('small.mp4')).not.toMatch(/proxies/);
    const kinds = await page.evaluate(() => window.wall.jobs().then((l) => l.map((j) => j.kind)));
    expect(kinds.filter((k) => k === 'proxy')).toHaveLength(1);

    // Paused, then the setting off: the original again, still paused, from about the same moment.
    const id = await page.locator('#wall .tile[aria-label^="big.mp4"]').getAttribute('data-id');
    await tileButton(page, id, 'play');
    await expect.poll(async () => (await state('big.mp4')).paused).toBe(true);
    const t = (await state('big.mp4')).t;
    await page.click('#settingsBtn');
    await page.click('#tabGeneral');
    await page.selectOption('#setProxies', 'off');
    await page.keyboard.press('Escape');
    await expect.poll(() => src('big.mp4')).not.toMatch(/proxies/);
    await page.waitForTimeout(800);
    const after = await state('big.mp4');
    expect(after.paused).toBe(true);
    expect(Math.abs(after.t - t)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
