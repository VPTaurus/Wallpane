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
