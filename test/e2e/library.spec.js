'use strict';
// The library with many files, with real videos, and across a restart. Each test starts its own Wallpane with its own
// data folder (and media it writes itself), so a restart is a real one.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const { png } = require('./media');
const launch = require('./launch');

const ff = FF.create(path.join(launch.root, 'vendor', 'ffmpeg'));

let dir;
test.beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-lib-e2e-')); });
test.afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const start = () => launch.start(dir);
// Until every file in the library has its details (sizes, lengths).
async function detailsRead(page) {
  await expect.poll(() => page.evaluate(async () => (await window.wall.libraryFolders()).reduce((n, f) => n + f.pending + (f.scanning ? 1 : 0), 0)), { timeout: 30000 }).toBe(0);
}
const thumbs = (page) => page.locator('#libGrid .lthumb');
const thumb = (page, name) => page.locator('#libGrid .lthumb[title^="' + name + '"]');

test('3,000 pictures: only the rows on screen are in the page, and the end and a search are quick', async () => {
  const media = path.join(dir, 'Many');
  fs.mkdirSync(media);
  const shapes = [[160, 90], [90, 160], [100, 100], [200, 80]].map(([w, h], i) => png(w, h, [60 * i, 120, 200]));
  for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(media, 'pic ' + String(i).padStart(4, '0') + '.png'), shapes[i % 4]);
  const { app, page, errors } = await start();
  try {
    await page.evaluate((p) => window.wall.addLibraryFolder(p), media);
    await detailsRead(page);
    await page.keyboard.press('Control+l');
    await expect(page.locator('#libShown')).toHaveText('3,000 files');
    await expect(thumb(page, 'pic 0000.png')).toBeVisible();
    expect(await thumbs(page).count()).toBeLessThan(400);
    // The rows are done again once the scroll bar appears (a little narrower): wait until they have settled.
    let h = -1;
    await expect.poll(async () => { const n = await page.locator('#libGrid').evaluate((g) => g.scrollHeight); const same = n === h; h = n; return same; }, { intervals: [300] }).toBe(true);

    const t0 = Date.now();
    await page.locator('#libGrid').evaluate((g) => { g.scrollTop = g.scrollHeight; });
    await expect(thumb(page, 'pic 2999.png')).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(await thumbs(page).count()).toBeLessThan(400);
    await expect(thumb(page, 'pic 0000.png')).toHaveCount(0);   // the first rows left the page

    // A bigger thumbnail size does the rows again, and the first thumbnail in view stays in view.
    const inView = () => page.locator('#libGrid').evaluate((g) => {
      const r = g.getBoundingClientRect();
      return [...g.querySelectorAll('.lthumb')].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > r.top + 1 && b.top < r.bottom - 1; })
        .sort((a, b) => (parseFloat(a.style.top) - parseFloat(b.style.top)) || (parseFloat(a.style.left) - parseFloat(b.style.left))).map((e) => e.title.split('\n')[0]);
    });
    const first = (await inView())[0];
    await page.locator('#libSize').fill('200');
    await expect.poll(async () => (await inView()).includes(first)).toBe(true);
    expect(first > 'pic 2900.png').toBe(true);

    const t1 = Date.now();
    await page.fill('#libSearch', '2999');
    await expect(thumbs(page)).toHaveCount(1);
    expect(Date.now() - t1).toBeLessThan(3000);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('after a restart: the library, the drawer as it was left, its collection, and thumbnails from the cache', async () => {
  const media = path.join(dir, 'Kept');
  fs.mkdirSync(path.join(media, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(media, 'big.png'), png(400, 300, [200, 60, 60]));
  fs.writeFileSync(path.join(media, 'small.png'), png(80, 60, [60, 200, 60]));
  fs.writeFileSync(path.join(media, 'sub', 'tall.png'), png(90, 160, [60, 60, 200]));
  let s = await start();
  try {
    await s.page.evaluate((p) => window.wall.addLibraryFolder(p), media);
    await s.page.keyboard.press('Control+l');
    await expect(s.page.locator('#libGrid .lthumb img')).toHaveCount(3, { timeout: 20000 });
    await s.page.evaluate(async () => {
      const ids = (await window.wall.queryLibrary({ sort: 'name' })).items.map((i) => i.id);
      await window.wall.editCollection('make', 'Kept for later', [ids[2], ids[0]]);
    });
    await s.page.click('.lkinds [data-kind="image"]');
    await s.page.selectOption('#libSort', 'size');
    await s.page.locator('#libSize').fill('160');
    await s.page.waitForTimeout(700);   // the size is saved a moment after the slider stops
  } finally { await s.app.close(); }
  expect(s.errors).toEqual([]);
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'library.json'), 'utf8')).collections[0].name).toBe('Kept for later');

  s = await start();
  try {
    await expect(s.page.locator('#lib')).toBeVisible();
    await expect(s.page.locator('.lkinds [data-kind="image"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(s.page.locator('#libSort')).toHaveValue('size');
    await expect(s.page.locator('#libSize')).toHaveValue('160');
    await expect(thumbs(s.page)).toHaveCount(3);
    // Sizes biggest first, and the thumbnails at once: they were made last time.
    const names = await thumbs(s.page).evaluateAll((els) => els.sort((a, b) => (parseFloat(a.style.top) - parseFloat(b.style.top)) || (parseFloat(a.style.left) - parseFloat(b.style.left))).map((e) => e.title.split('\n')[0]));
    expect(names[0]).toBe('big.png');
    await expect(s.page.locator('#libGrid .lthumb img')).toHaveCount(3, { timeout: 3000 });
    await s.page.click('#libFolderBtn');
    await expect(s.page.locator('#libFolderList .lfolder.coll', { hasText: 'Kept for later' })).toContainText('2');
    expect(s.errors).toEqual([]);
  } finally { await s.app.close(); }
});

test('videos: their length on the thumbnail, the Videos, length and shape filters, and an upright phone video', async () => {
  test.skip(!ff.available(), 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)');
  const media = path.join(dir, 'Clips');
  fs.mkdirSync(media);
  const make = (name, args) => ff.run('ffmpeg', ['-y', '-v', 'error'].concat(args, [path.join(media, name)]), { timeoutMs: 120000 });
  const src = (size, secs) => ['-f', 'lavfi', '-i', 'testsrc2=size=' + size + ':rate=25:duration=' + secs, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
  await make('wide.mp4', src('320x180', 3));
  await make('long.mp4', src('320x180', 40));
  const plain = path.join(dir, 'plain.mp4');
  await ff.run('ffmpeg', ['-y', '-v', 'error'].concat(src('320x180', 2), [plain]));
  await make('phone.mp4', ['-display_rotation', '90', '-i', plain, '-c', 'copy']);
  fs.writeFileSync(path.join(media, 'still.png'), png(160, 90, [90, 90, 90]));
  const { app, page, errors } = await start();
  try {
    await page.evaluate((p) => window.wall.addLibraryFolder(p), media);
    await detailsRead(page);
    await page.keyboard.press('Control+l');
    await expect(thumbs(page)).toHaveCount(4);
    await expect(thumb(page, 'wide.mp4').locator('.lbadge')).toHaveText('0:03');
    await expect(thumb(page, 'long.mp4').locator('.lbadge')).toHaveText('0:40');
    await expect(thumb(page, 'phone.mp4')).toHaveAttribute('title', /180 × 320/);
    await expect(page.locator('#libGrid .lthumb img')).toHaveCount(4, { timeout: 30000 });   // videos' thumbnails too

    await page.click('.lkinds [data-kind="video"]');
    await expect(thumbs(page)).toHaveCount(3);
    await page.click('#libFiltBtn');
    await page.selectOption('#libLength', 'medium');
    await expect(thumbs(page)).toHaveCount(1);
    await expect(thumb(page, 'long.mp4')).toBeVisible();
    await page.selectOption('#libLength', '');
    await page.selectOption('#libShape', 'portrait');
    await expect(thumbs(page)).toHaveCount(1);
    await expect(thumb(page, 'phone.mp4')).toBeVisible();
    await expect(page.locator('#libFiltN')).toHaveText('1');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
