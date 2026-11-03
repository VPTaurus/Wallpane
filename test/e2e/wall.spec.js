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
const { pressSide } = require('../mouseinput');

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
    await expect(toast(page)).toContainText('Settings › Tiles › Full wall');
    await expect(tiles(page)).toHaveCount(4);

    await page.click('#settingsBtn');
    await page.click('#tabTiles');
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
    await page.click('#tabVideo');
    await page.locator('#setPauseMin').uncheck();
    await page.keyboard.press('Escape');
    await win('minimize');
    await page.waitForTimeout(800);
    expect(await playing()).toBe(true);
    await win('restore');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('layouts keep their frames: leftover frames become empty tiles; applied while placed freely, the tiles go back on the grid', async () => {
  const pic = path.join(dir, 'pic.png');
  fs.writeFileSync(pic, png(160, 90, [200, 120, 40]));
  const { app, page, errors, answer } = await start(dir);
  const items = () => page.evaluate(() => window.MW.app.S.items.map((i) => (i.kind === 'empty' ? 'empty' : i.name) + ' ' + i.w + '×' + i.h));
  const layout = async (name) => { await page.click('#arrangeMenuBtn'); await page.click('#layoutBtn'); await page.locator('#lgrid .lbtn', { hasText: name }).click(); };
  try {
    await answer(pic);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect(tiles(page)).toHaveCount(1);
    // Each ready-made layout shows its frames (in 1.5.0 and 1.6.0 the library's thumbnail style broke these pictures).
    await page.click('#arrangeMenuBtn'); await page.click('#layoutBtn');
    const pic6 = await page.locator('#lgrid .lbtn', { hasText: 'Two big' }).locator('.laythumb i').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; }));
    expect(pic6).toEqual([true, true, true, true, true, true]);
    await page.keyboard.press('Escape');
    // Two big: two 2×2 frames and four 1×1. One picture: the second big frame stays a 2×2 frame, as an empty tile.
    await layout('Two big');
    await expect(toast(page)).toContainText('5 frames are empty tiles');
    expect((await items()).sort()).toEqual(['empty 1×1', 'empty 1×1', 'empty 1×1', 'empty 1×1', 'empty 2×2', 'pic.png 2×2']);
    // Placed freely, Layouts still works and puts the tiles back on the grid: 3 × 3 takes the six and adds three.
    await page.click('#modeSeg [data-mode="free"]');
    await layout('3 × 3');
    await expect(toast(page)).toContainText('on the grid again');
    await expect(page.locator('#gridLabel')).toHaveText('3 × 3');
    expect(await items()).toHaveLength(9);
    // Fill the wall takes only tiles with media: the eight empty ones make way (and one Ctrl+Z brings them back).
    await page.click('#arrangeMenuBtn'); await page.click('#fillWallBtn');
    await expect(toast(page)).toContainText('8 empty tiles made way');
    expect((await items()).map((s) => s.split(' ')[0])).toEqual(['pic.png']);
    await page.keyboard.press('Control+z');
    expect(await items()).toHaveLength(9);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('a single video has Repeat, a picture has neither Repeat nor Pin, a playlist tile has Pin', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4'), pic = path.join(dir, 'pic.png'), folder = path.join(dir, 'Two');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  fs.writeFileSync(pic, png(160, 90, [200, 120, 40]));
  fs.mkdirSync(folder);
  for (let i = 0; i < 2; i++) fs.writeFileSync(path.join(folder, 'p' + i + '.png'), png(160, 90, [40, 80 * i, 200]));
  const { app, page, errors, answer } = await start(dir);
  const tile = (name) => page.locator('#wall .tile[aria-label^="' + name + '"]');
  try {
    await answer([clip, pic]);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect(tile('clip.mp4').locator('[data-act="loop"]')).toHaveAttribute('aria-label', 'Repeat this video');
    // Its menu: what is used most at the top, the rest in Display, File and Tile; → opens one, ← closes it.
    await tile('clip.mp4').click({ button: 'right' });
    expect(await page.locator('#ctxMenu .mi').count()).toBeLessThanOrEqual(8);
    await page.locator('#ctxMenu .mi.hassub', { hasText: 'Display' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#ctxSub')).toBeVisible();
    await expect(page.locator('#ctxSub .mi').first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#ctxSub')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(tile('pic.png').locator('[data-act="loop"]')).toHaveCount(0);
    await expect(tile('pic.png').locator('[data-act="pin"]')).toHaveCount(0);
    // A folder on the picture's tile: a playlist, with Pin (Stay on this file) and no Repeat.
    const id = await tile('pic.png').getAttribute('data-id');
    await page.evaluate(([i, f]) => window.wall.expand([f]).then((res) => window.MW.app.assignFolder(window.MW.app.itemById(+i), res)), [id, folder]);
    const pl = page.locator('#wall .tile[data-id="' + id + '"]');
    await expect(pl.locator('[data-act="pin"]')).toHaveAttribute('aria-label', 'Stay on this file');
    await expect(pl.locator('[data-act="loop"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('a wall with videos saves a change within seconds, also once their openings are measured', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  // 1.6.0 redrew such a wall every 0.6 s (each answer about openings set off the next question), which kept putting
  // its save off until the window closed.
  const clip = path.join(dir, 'clip.mp4'), pic = path.join(dir, 'pic.png');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  fs.writeFileSync(pic, png(160, 90, [200, 120, 40]));
  const { app, page, errors, answer } = await start(dir);
  const savedItems = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'data', 'session.json'), 'utf8')).items.length; } catch { return -1; } };
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(() => page.evaluate((p) => window.wall.openings([p]).then((r) => !!r[p]), clip), { timeout: 20000 }).toBe(true);
    await page.waitForTimeout(2500);
    await answer(pic);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(savedItems, { timeout: 4000 }).toBe(2);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('drawing pace: the rate kept in app.json applies from the start; Settings says so and what the next start brings', async () => {
  // One 60 Hz screen here, so Automatic would change nothing: a rate worked out earlier (30) stands in for a slower
  // second screen.
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'window.json'), JSON.stringify({ wins: { 1: { width: 1024, height: 728 } }, open: [1] }));
  fs.writeFileSync(path.join(data, 'app.json'), JSON.stringify({ pace: 'auto', paceHz: 30 }));
  const fps = (page) => page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  // The pace only applies where the graphics chip paces the drawing: without one (CI machines), Chromium draws by its
  // own timer, so the rates are measured only with one. Loosely, and the second against the first.
  const paces = (app) => app.evaluate(({ app }) => /^enabled/.test(app.getGPUFeatureStatus().gpu_compositing || ''));
  let s = await start(dir), paced, hw;
  try {
    hw = await paces(s.app);
    if (hw) {
      await s.page.waitForTimeout(2000);   // past the start's own work
      paced = await fps(s.page);
      expect(paced).toBeGreaterThan(15);
      expect(paced).toBeLessThan(40);
    }
    await s.page.click('#settingsBtn');
    await s.page.click('#tabVideo');
    await expect(s.page.locator('#setPace')).toHaveValue('auto');
    await expect(s.page.locator('#paceNote')).toContainText('Now: 30 frames a second');
    await expect(s.page.locator('#paceNote')).toContainText("Restart for the main display's pace");
    await expect(s.page.locator('#paceRow')).toBeVisible();
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(data, 'app.json'), 'utf8')).paceHz).toBe(0);   // the screens as they are now
    expect(s.errors).toEqual([]);
  } finally { await s.app.close(); }
  s = await start(dir);
  try {
    if (hw) {
      await s.page.waitForTimeout(2000);
      expect(await fps(s.page)).toBeGreaterThan(paced * 1.4);   // the screens' own pace again (60 here, against 30)
    }
    expect(s.errors).toEqual([]);
  } finally { await s.app.close(); }
});

test('even loudness: a loud video plays quieter, a quiet one keeps its level; Settings › General turns it off', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  // FFmpeg's tone at four times its level is about -9.8 LUFS; as it is, about -21.8.
  const make = (name, af) => ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6' + af,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, name)], { timeoutMs: 60000 });
  await make('loud.mp4', ',volume=4');
  await make('quiet.mp4', '');
  const { app, page, errors, answer } = await start(dir);
  const vol = (name) => page.locator('#wall .tile[aria-label^="' + name + '"] video').evaluate((v) => v.volume);
  try {
    await answer([path.join(dir, 'loud.mp4'), path.join(dir, 'quiet.mp4')]);
    await page.click('#addBtn');
    await page.click('#addFiles');
    // -18 LUFS is 8.2 dB below -9.8: a volume of about 0.39.
    await expect.poll(() => vol('loud.mp4'), { timeout: 20000 }).toBeLessThan(0.45);
    expect(await vol('loud.mp4')).toBeGreaterThan(0.33);
    expect(await vol('quiet.mp4')).toBe(1);

    await page.click('#settingsBtn');
    await page.click('#tabVideo');
    await page.locator('#setEvenLoud').uncheck();
    await page.keyboard.press('Escape');
    await expect.poll(() => vol('loud.mp4')).toBe(1);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('a video that opens on black starts after it, also when it loops; Settings › General turns it off', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'dark start.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-filter_complex', 'color=c=black:s=320x180:d=2:r=25[b];testsrc=s=320x180:d=4:r=25[t];[b][t]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  const v = page.locator('#wall .tile[aria-label^="dark start.mp4"] video');
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(() => page.evaluate((p) => window.wall.openings([p]).then((r) => r[p] && r[p].black), clip), { timeout: 20000 }).toBe(2);
    await expect.poll(() => v.evaluate((m) => m.loop)).toBe(false);   // it loops itself, from the end of the black
    expect(await v.evaluate((m) => m.currentTime)).toBeGreaterThanOrEqual(1.7);
    // Near the end: it comes round to 2 s, not to the black at 0.
    const back = await v.evaluate((m) => new Promise((res) => {
      m.addEventListener('ended', () => setTimeout(() => res(m.currentTime), 150), { once: true });
      m.currentTime = m.duration - 0.3;
    }));
    expect(back).toBeGreaterThanOrEqual(1.9);
    expect(back).toBeLessThan(3);

    await page.click('#settingsBtn');
    await page.click('#tabVideo');
    await page.locator('#setSkipOpen').uncheck();
    await page.keyboard.press('Escape');
    await expect.poll(() => v.evaluate((m) => m.loop)).toBe(true);
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
    await page.click('#tabVideo');
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

test('the last wall comes back with each video where it was', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'film.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=40', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const apps = [];
  const open = async () => { const s = await start(dir); apps.push(s.app); return s; };
  const at = (page) => page.locator('#wall .tile[aria-label^="film.mp4"] video').evaluate((v) => (v.readyState >= 1 ? v.currentTime : -1));
  try {
    let s = await open();
    await s.answer(clip);
    await s.page.click('#addBtn');
    await s.page.click('#addFiles');
    await expect.poll(() => at(s.page)).toBeGreaterThanOrEqual(0);
    await s.page.locator('#wall .tile[aria-label^="film.mp4"] video').evaluate((v) => { v.currentTime = 23; });
    await expect.poll(() => at(s.page)).toBeGreaterThan(23);
    expect(s.errors).toEqual([]);
    await s.app.close();   // saved as it closes
    s = await open();
    await s.page.click('#lastWallRestore');
    await expect.poll(() => at(s.page)).toBeGreaterThan(22.5);
    expect(await at(s.page)).toBeLessThan(30);
    expect(s.errors).toEqual([]);
  } finally { for (const a of apps) await a.close().catch(() => {}); }
});

test('10 s back and on: buttons in the video bar of a big tile or one full screen, not of a small one', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'long.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=40', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    const tile = page.locator('#wall .tile[aria-label^="long.mp4"]'), video = tile.locator('video');
    await expect.poll(() => video.evaluate((v) => v.duration)).toBeGreaterThan(39);
    await video.evaluate((v) => { v.pause(); v.currentTime = 5; });
    await tile.hover();
    await expect(tile.locator('[data-act="on10"]')).toBeHidden();   // one cell of 4 × 3: too small
    // Full screen, the buttons show; each jumps 10 s.
    await tile.dblclick();
    await expect(tile).toHaveClass(/\bsolo\b/);
    await tile.hover();
    const t = () => video.evaluate((v) => v.currentTime);
    await tile.locator('[data-act="on10"]').click();
    await expect.poll(t).toBeGreaterThan(14.5);
    expect(await t()).toBeLessThan(15.5);
    await tile.locator('[data-act="back10"]').click();
    await tile.locator('[data-act="back10"]').click();
    await expect.poll(t).toBe(0);   // never before the start
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('emergency hide: the mouse button works from any program, so it brings back windows that went away', async () => {
  test.skip(process.platform !== 'win32' || (!process.env.WALLPANE_EXE && !fs.existsSync(path.join(root, 'vendor', 'mousehook', 'wallpane-mouse.exe'))),
    'The mouse helper is not built (npm run build-mousehook)');
  const { app, page, errors } = await start(dir);
  try {
    await page.evaluate(() => window.wall.setHide({ mouse: 'forward', cover: 'away' }));
    await expect.poll(() => page.evaluate(() => window.wall.hideState().then((s) => s.mouseOk)), { timeout: 30000 }).toBe(true);
    const visible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
    // A real press, through Windows, wherever the pointer is: the windows go away, and the next press brings them back.
    const sent = await pressSide(2);
    test.skip(sent !== 2, 'Windows took no input here');
    await expect.poll(visible).toBe(false);
    expect(await pressSide(2)).toBe(2);
    await expect.poll(visible).toBe(true);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('save the looped part as MP4: re-encoded when the keyframe before it is far, copied when it is near', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4'), out = path.join(dir, 'cut.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '50', '-keyint_min', '50', '-sc_threshold', '0', '-c:a', 'aac', '-shortest', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    const tile = page.locator('#wall .tile[aria-label^="clip.mp4"]');
    await expect.poll(() => tile.locator('video').evaluate((v) => v.duration)).toBeGreaterThan(5);
    await page.evaluate(() => { const A = window.MW.app; A.setLoop(A.S.items.find((i) => i.kind === 'video'), 3.3, 5); });
    // Properties › Playback offers it beside Make a GIF…
    await tile.click();
    await page.keyboard.press('Alt+Enter');
    await expect(page.locator('#insCut')).toBeVisible();
    await page.keyboard.press('Escape');
    // From the tile's menu, straight to where to save it. The keyframe before 3.3 s is at 2 s: re-encoded, exactly.
    const save = async (p) => {
      await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, p);
      await tile.click({ button: 'right' });
      await page.locator('#ctxMenu .mi', { hasText: 'Save the part as MP4' }).click();
    };
    const secs = async (p) => parseFloat((await ff.probeRaw(p)).format.duration);
    await save(out);
    await expect(toast(page)).toContainText('Saved cut.mp4');
    await expect(toast(page)).toContainText('the nearest keyframe was 1.3 s before it');
    const info = await ff.probeRaw(out);
    expect(info.streams.map((s) => s.codec_name).sort()).toEqual(['aac', 'h264']);
    expect(Math.abs(await secs(out) - 1.7)).toBeLessThan(0.1);
    expect(fs.existsSync(path.join(dir, 'cut.part.mp4'))).toBe(false);
    // From 4.2 s the keyframe at 4 s is near: copied as it is, starting 0.2 s early.
    const near = path.join(dir, 'near.mp4');
    await page.evaluate(() => { const A = window.MW.app; A.setLoop(A.S.items.find((i) => i.kind === 'video'), 4.2, 5); });
    await save(near);
    await expect(toast(page)).toContainText('Saved near.mp4');
    await expect(toast(page)).toContainText('starts 0.2 s before the part');
    expect(Math.abs(await secs(near) - 1)).toBeLessThan(0.1);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('save this frame: a picture of the moment shown, at the video\'s full size, PNG or JPEG', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  const { app, page, errors, answer } = await start(dir);
  const saveTo = (f) => app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, f);
  try {
    await answer(clip);
    await page.click('#addBtn');
    await page.click('#addFiles');
    const tile = page.locator('#wall .tile[aria-label^="clip.mp4"]'), video = tile.locator('video');
    await expect.poll(() => video.evaluate((v) => v.duration)).toBeGreaterThan(5);
    await video.evaluate((v) => { v.pause(); v.currentTime = 2.5; });
    // The tile is zoomed in: the picture is still the whole frame.
    await page.evaluate(() => { const it = window.MW.app.S.items.find((i) => i.kind === 'video'); it.zoom = 3; window.MW.app.render(); });

    // From the tile's menu (File), with the name it offers: a PNG of 640 × 360.
    await saveTo(path.join(dir, 'clip 2.5s.png'));
    await tile.click({ button: 'right' });
    await page.locator('#ctxMenu .mi.hassub', { hasText: 'File' }).hover();
    await page.locator('#ctxSub .mi', { hasText: 'Save this frame' }).click();
    await expect(toast(page)).toContainText('Saved clip 2.5s.png');
    const pic = fs.readFileSync(path.join(dir, 'clip 2.5s.png'));
    expect(pic.subarray(1, 4).toString()).toBe('PNG');
    expect([pic.readUInt32BE(16), pic.readUInt32BE(20)]).toEqual([640, 360]);
    expect(fs.existsSync(path.join(dir, 'clip 2.5s.png.part'))).toBe(false);

    // From Properties › File, as a JPEG.
    await saveTo(path.join(dir, 'still.jpg'));
    await tile.click();
    await page.keyboard.press('Alt+Enter');
    await page.locator('#insSnap').click();
    await expect(toast(page)).toContainText('Saved still.jpg');
    const jpg = fs.readFileSync(path.join(dir, 'still.jpg'));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    const info = await ff.probeRaw(path.join(dir, 'still.jpg'));
    expect([info.streams[0].width, info.streams[0].height]).toEqual([640, 360]);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('a screenshot of the wall from the bar: the wall as it shows, at the screen\'s resolution, without the selection', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4'), pic = path.join(dir, 'pic.png'), out = path.join(dir, 'shot.png');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip], { timeoutMs: 60000 });
  fs.writeFileSync(pic, png(160, 90, [200, 80, 40]));
  const { app, page, errors, answer } = await start(dir);
  // Pixels of the saved picture ([r, g, b] at picture pixels), and its size.
  const read = (f, pts) => app.evaluate(({ nativeImage }, a) => {
    const img = nativeImage.createFromPath(a.f);
    return { size: img.getSize(), px: a.pts.map(([x, y]) => { const b = img.crop({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 }).toBitmap(); return [b[2], b[1], b[0]]; }) };
  }, { f, pts });
  try {
    await answer([clip, pic]);
    await page.click('#addBtn');
    await page.click('#addFiles');
    await expect.poll(() => page.locator('#wall .tile[aria-label^="clip.mp4"] video').evaluate((v) => v.currentTime)).toBeGreaterThan(0.5);
    const tile = page.locator('#wall .tile[aria-label^="pic.png"]');
    await tile.click();   // selected: its ring shows on screen, not in the picture
    await expect(tile).toHaveClass(/\bsel\b/);
    await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, out);
    await page.click('#shotBtn');
    await expect(toast(page)).toContainText('Saved shot.png');
    expect(await page.evaluate(() => document.body.classList.contains('shot'))).toBe(false);

    const k = await page.evaluate(() => window.devicePixelRatio);
    const w = await page.locator('#wall').boundingBox(), t = await tile.boundingBox(), v = await page.locator('#wall .tile[aria-label^="clip.mp4"]').boundingBox();
    const at = (x, y) => [(x - w.x) * k, (y - w.y) * k];
    const mid = t.y + t.height / 2;
    const got = await read(out, [at(t.x + t.width / 2, mid), at(t.x - 4, mid), at(w.x + 2, mid)].concat([0.2, 0.4, 0.6, 0.8].map((f) => at(v.x + v.width * f, v.y + v.height / 2))));
    expect(Math.abs(got.size.width - w.width * k)).toBeLessThanOrEqual(1);
    expect(Math.abs(got.size.height - w.height * k)).toBeLessThanOrEqual(1);
    const close = (a, b) => a.every((c, i) => Math.abs(c - b[i]) <= 6);
    expect(close(got.px[0], [200, 80, 40])).toBe(true);   // the picture
    expect(close(got.px[1], got.px[2])).toBe(true);       // where the ring is on screen: the wall, as at its edge
    expect(got.px.slice(3).some((p) => p[0] + p[1] + p[2] > 60)).toBe(true);   // the video is in it, not black
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('save the wall as a video: the wall\'s shape at the size chosen, as long as chosen, with the heard tile\'s sound', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const clip = path.join(dir, 'clip.mp4'), pic = path.join(dir, 'pic.png'), out = path.join(dir, 'wall.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip], { timeoutMs: 60000 });
  fs.writeFileSync(pic, png(160, 90, [200, 80, 40]));
  const { app, page, errors, answer } = await start(dir);
  try {
    await answer([clip, pic]);
    await page.click('#addBtn');
    await page.click('#addFiles');
    const video = page.locator('#wall .tile[aria-label^="clip.mp4"] video');
    await expect.poll(() => video.evaluate((v) => v.duration)).toBeGreaterThan(3);
    await page.evaluate(() => { const it = window.MW.app.S.items.find((i) => i.kind === 'video'); it.muted = false; window.MW.app.render(); });
    // Saved walls has it too; the bar's Record button opens it. The dialog says what the video holds.
    await page.click('#presetBtn');
    await page.click('#wallVideoBtn');
    await expect(page.locator('#popWv')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#popWv')).toBeHidden();
    await page.click('#recordBtn');
    await expect(page.locator('#popWv')).toBeVisible();
    await page.selectOption('#wvSize', '720');
    await page.selectOption('#wvSecs', '10');
    await expect(page.locator('#wvSub')).toHaveText('2 tiles');
    await expect(page.locator('#wvNote')).toContainText('10 s, with the sound of 1 tile');
    await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, out);
    await page.click('#wvMake');
    await expect(page.locator('#popWv')).toBeHidden();
    await expect(toast(page)).toContainText('Saved wall.mp4', { timeout: 90000 });
    const wallBox = await page.locator('#wall').boundingBox();
    const probe = await ff.probeRaw(out);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    expect(v.codec_name).toBe('h264');
    expect(Math.min(v.width, v.height)).toBe(720);
    expect(Math.abs(v.width / v.height - wallBox.width / wallBox.height)).toBeLessThan(0.01);
    expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(Math.abs(parseFloat(probe.format.duration) - 10)).toBeLessThan(0.15);
    expect(fs.existsSync(path.join(dir, 'wall.part.mp4'))).toBe(false);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
