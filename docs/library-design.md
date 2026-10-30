# Library design (roadmap C0)

**Status: agreed on 2026-10-30.** The four choices are settled:
1. **Where it lives:** all three ways, chosen in Settings. The drawer over the wall is the default.
2. **What it holds:** only the folders you add.
3. **Thumbnails:** each in its own shape, in even rows.
4. **Size:** 5,000 to 50,000 files, so `library.json` is the right store.

## What it is for
Finding media for the wall quickly. You add your video and picture folders once, then browse them as thumbnails, search and filter, and drag what you want onto the wall or onto one tile.

It is not a file manager. Wallpane never moves, renames or deletes your files; it only reads them. Everything it learns (sizes, lengths, thumbnails) lives in its own data folder.

## Where it lives (Decision 1: all three, your choice)
**Settings › Library › Show the library as** offers three ways. A small menu in the library's own header switches between them on the spot. Either way, the choice is remembered.

- **A drawer over the wall** (the default). It slides in from the left, over the wall. The wall keeps its exact size and shape and keeps playing. While you drag thumbnails out of it, the drawer fades and lets the drop through, so a tile underneath it can take the drop too.
- **A panel beside the wall.** The wall gets narrower while the panel is open. Tiles change shape with the wall (Free layouts scale with the window) and change back when it closes.
- **A window of its own,** for a second screen. Its place and size are remembered like the wall windows'. Closing it only hides it.

The same in all three:
- A **Library** button in the bar next to Add, and **Ctrl+L**, open and close it. Wall mode hides the drawer and the panel; a library window stays where it is.
- Drag the edge of the drawer or panel to make it wider or narrower, up to the whole window. The width is remembered.
- With several wall windows, each has its own drawer or panel, and the library window serves them all. Double-click and **Put on the wall** go to the wall window used last.

### One library, three hosts
- **One piece of page code** (`renderer/ui/library.js` with its plain logic in `renderer/lib/`). It draws the whole library into whatever element it is given. The wall page mounts it in an `<aside>`, either as a drawer or as a panel. A small `library.html` mounts it as a whole window, with the same preload and the same security rules as the wall.
- **Inside a wall window,** a drag is an ordinary page drag. It carries the file list (and, for a collection, the collection), and the wall's drop code handles it.
- **From the library window,** a drag is a real Windows file drag (`webContents.startDrag`). The wall takes it exactly like a drop from Explorer. The main process remembers what the drag came from, so a dropped collection still becomes a collection playlist.
- **The data lives only in the main process.** Every host asks it for results and gets told about changes, so the drawer, the panel and the window always agree.

## What it holds (Decision 2: only the folders you add)
- Folders are added in the drawer: the **+ Folder** button, or a drop from Explorer onto the drawer. Subfolders are included, and hidden files are skipped.
- Every video, GIF and image counts. That includes files that need a playable copy; those are marked.
- Library folders are watched the way playlist folders are today, so new files appear by themselves.
- Removing a folder forgets its files. Their thumbnails go when the cache is next cleaned.
- A folder on a drive that is not connected (USB, network) shows as **not available**, and its files are kept until it comes back.

Files you put on a wall do not join the library by themselves.

## What is stored: `library.json`
It lives in the data folder next to `app.json`. Only the main process reads and writes it, and every wall window sees the same library.

```json
{
  "version": 1,
  "folders": [{ "path": "D:\\Clips", "added": 1793400000000 }],
  "files": {
    "f3c9a1e07b2d4": {
      "path": "D:\\Clips\\beach\\sunset.mp4",
      "size": 48213012, "mtime": 1790000000000, "kind": "video", "added": 1793400000000,
      "w": 1920, "h": 1080, "dur": 31.4, "fps": 30, "v": "h264", "a": "aac", "rot": 0, "play": "none"
    }
  },
  "lost": [{ "id": "f81d0c55e9a20", "at": 1793500000000, "e": { "path": "D:\\Clips\\old name.mp4", "size": 1200, "mtime": 1790000000000, "kind": "video", "added": 1793400000000 } }],
  "collections": [{ "id": "c1", "name": "Evening", "files": ["f3c9a1e07b2d4"] }]
}
```

- **Per file:** where it is, its size and time, its kind (video, GIF or image) and when it was added. Its library folder is not stored, because loading finds it from the path. Probing fills in its size in pixels, length, frame rate, codecs and rotation, and whether it plays as it is (`play`: none, maybe, remux, audio or convert). For a file that cannot be read, it fills in why (`err`), so it is not tried again and again.
- **Lost files:** files that left the library in the last 30 days, so that one that comes back keeps its id.
- **Not stored here:** thumbnails (they are files in the cache) and anything from the internet (Wallpane never goes online).
- **Moved or renamed files keep their place.** A file can disappear while one with the same size, time and name appears elsewhere in the library. That is taken as the same file, so it stays in its collections (and keeps its tags, later on).
- **Saving** waits two seconds after the last change. While changes keep coming (probing a big folder), it still saves at least every 30 seconds. It writes through a temporary file, so a crash never leaves half a file, and once more when Wallpane closes.
- **Size (Decision 4: up to 50,000 files):** about 300 bytes a file. Measured with 50,000 fully probed files:

  | | |
  |---|---|
  | `library.json` | 14 MB |
  | loading it | 0.35 s |
  | saving it | 0.07 s |
  | the first scan | 0.4 s |
  | a scan that finds no changes | 0.07 s |

  C2 loads the library after the first window is up, so it never delays the start. All of this sits behind `lib/library.js`, so moving to SQLite later would not touch the page.
- **Searching:** the main process runs each search and sort, which takes 4 to 40 milliseconds for 50,000 files. The page gets back the whole result in a compact form (id, name, kind, width and height, length). That is all it needs to lay out the rows; names and details for the rows on screen follow as they scroll in.

## Scanning (C2)
1. **Adding a folder** walks it straight away (`files.scan`). The 3,000-file limit is only for playlists; this walk stops at 200,000. Each file goes in with its name, size, time and kind (from its extension), so the grid fills at once. Hidden files, Windows' own folders and links are skipped.
2. **One background job** ("Reading file details") then fills in the details, two files at a time. Pictures take their size from their first bytes (PNG, GIF, JPEG with its EXIF orientation, WebP, BMP), which is thousands of files a minute. Videos, and pictures in other formats, go through ffprobe. Thumbnails (C3) come after.
3. **Starting the app** checks every folder for files that are new, gone or changed (by size and time). The same check runs when a watcher reports a change, and on the **Look again** button. Folders that could not be read keep their files, and so does a folder on a drive that is not connected; Wallpane looks for that drive again every minute.
4. **Settings › Library** lists the folders with how many files each holds and how many still wait for their details, with **Add folder…**, **Look again** and **Remove**.

## Thumbnails (C3)
- WebP files, at most 360 px on the long side (never larger than the original), in `cache\thumbs`. They count toward the cache limit; one that was cleaned away is simply made again. A changed file gets a new one.
- **Videos:** FFmpeg's thumbnail filter picks the most typical of 40 frames from about 10 % in, which skips a black or blank one. Phone videos come out upright, and stretched pixels (anamorphic video) are made square.
- **Images:** a small copy, turned the way the camera says, so a folder of 6,000-pixel photos still scrolls smoothly.
- **GIFs:** the first frame. Hover previews for videos and GIFs come in D1.
- **Order:** one background job ("Making thumbnails"), two at a time. The thumbnails a window asks for (`library:thumbs`, the ones on screen) come first and are checked again before every file. Then every other file that has its details. Each one asked for arrives through `library:thumbsMade` as soon as it is made.
- **Speed:** about a tenth of a second each, for a 12-megapixel photo or a 1080p video, so about ten a second: a thousand files in under two minutes, 50,000 in about an hour and a half.
- **A file FFmpeg cannot make one of** is marked (`terr`) and not tried again until it changes.
- **Without FFmpeg (Lite):** there are no thumbnails. Images show from the file itself, and videos show a plain card with name and length.

## Browsing (C4)
```
┌ Library ──────────────────────────┐
│ ⌕ Search names…                   │
│ [Videos] [GIFs] [Images]  Filters▾ │
│ ▾ Folders                          │
│     Clips            1,204         │
│     Loops              312         │
│ ▾ Collections                      │
│     Evening             24         │
│ ────────────────────────────────── │
│ ▭▭▭  ▯  ▭▭▭▭  ▭▭                   │
│ ▭▭  ▯ ▯  ▭▭▭  ▭▭▭                  │
│ 1,516 files      Sort: Added ▾  ─○ │
└────────────────────────────────────┘
```
- **Search** looks in file and folder names. Every word must match, in any order, ignoring case and accents. Results come as you type.
- **Filters:**
  - kind;
  - shape (landscape, portrait, square);
  - length (under 30 s, 30 s to 5 min, over 5 min);
  - resolution (below HD, HD, Full HD, 4K and up);
  - needs a playable copy.
- **Sort** by name, date added, date changed, length, size, or random (with a reshuffle button).
- **The slider** sets the thumbnail size.
- **Selecting:** click, Ctrl+click, Shift+click, Ctrl+A.
- **Hovering** a thumbnail shows its name, length and resolution.
- **Thumbnail shape (Decision 3: each in its own shape, in even rows).** It works like a photo gallery: every row has the same height and fills the width, and each thumbnail keeps its media's shape. A portrait clip looks portrait before it goes on the wall, which matters for Fill the wall and Fit to media. Very wide or very tall media are clamped to between 1:3 and 3:1, so no thumbnail turns into a sliver. The thumbnail size slider sets the row height.
- **Fast with thousands of files:** the rows are worked out from the widths and heights alone, and only the rows on screen exist in the page. Thumbnails load as they scroll in.

## To the wall
- **Dragging one or more thumbnails does what dropping the same files from Explorer does today.** It replaces the tile it lands on, fills from that cell, gives each file its own tile in Free, or reconnects a missing file. There is nothing new to learn.
- **Shift while dropping several files on a tile** makes that tile play them as a playlist.
- **Dragging a folder** from the folder list is the same as dropping that folder: the tile plays it.
- **Double-click** puts the file on the selected tile, or else on the next empty tile, or else on a new one.
- **Right-click** offers Put on the wall, Play on the selected tile, Add to collection, Make playable and Show in Explorer.

## Collections (C5)
- Your own lists of files. Add to one by dragging or by right-click, and change the order by dragging.
- A collection dropped on a tile plays there as a playlist and follows the collection as it changes. It uses the playlist code that plays files without a folder today; saved searches (E2) will use it too.

## Later, not in part 1
Tags, ratings and favourites (E1); saved searches (E2); markers (E3); duplicates (E4); hover and timeline previews (D1, D2).

## In what order it is built
1. **C1, the store.** `lib/library.js` with its unit tests: load, save, add and remove folders, update files, find moved files, run searches.
2. **C2, folders.** The walk, the start-up check, the watchers, and the probe jobs.
3. **C3, thumbnails.** The thumbnail job kind and its cache folder.
4. **C4, browsing.** First the drawer: search, filters, rows, selection, dragging to the wall. Then the panel, which is the drawer with the wall made narrower. Then the library window, with its native file drag. Last, Settings › Library and the header menu.
5. **C5, collections.**
6. **C6, end-to-end tests.** One for each way of showing the library, all with media that FFmpeg generates.

Beyond 50,000 files, SQLite (behind the same module) or the Stash connector (v2) are the way to go.
