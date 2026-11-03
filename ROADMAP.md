# Roadmap

Where Wallpane is going, in the order it is built. Each step lands on `Dev` with its tests, and each milestone ends in a release. Tick a box when a step is merged.

**Principles for everything below**
- **Offline.** FFmpeg is downloaded once at *build* time and shipped inside the app; Wallpane itself never goes online.
- **Originals are never touched.** Converted files, thumbnails, previews and lighter copies live in a cache in Wallpane's data folder. Saved walls keep the original paths.
- **The wall comes first.** Background work runs at low priority, one heavy job at a time, and never makes playing tiles stutter.
- **One codebase**, plain JSON storage behind its own module (so SQLite stays an option), the same tests locally and on CI.

---

## 0. Release 1.3.0
- [x] Try today's changes by hand, then publish 1.3.0 (the changelog is ready under "Unreleased").

## A. FFmpeg inside Wallpane (foundation, part of 1.4.0)
- [x] **A1. Bundle FFmpeg.** A script (`npm run fetch-ffmpeg`) downloads one pinned build (gyan.dev FFmpeg 9.0.2, *full build, shared*: `ffmpeg.exe`, `ffprobe.exe` and their DLLs, no `ffplay`, no docs; a versioned GitHub release that stays up), checks its SHA-256 and unpacks it to `vendor/ffmpeg` (not in git). electron-builder ships it as an extra resource; CI caches it. FFmpeg's licence and the build's README (naming the exact source) go with it; About shows the version and links to the source. Measured: installer +64 MB (178 MB), portable +58 MB (162 MB), installed +230 MB. A slimmer custom build, with only what Wallpane uses, can come later if that matters.
- [x] **A2. Running FFmpeg** (`lib/ffmpeg.js`, main process; the facts and the verdict in `lib/mediainfo.js`). Finds the binaries (development or installed), runs them with an argument list (never a shell), at below-normal priority, with progress (`-progress pipe:1`), cancel and time limits. `probe(file)` uses ffprobe's JSON output: length, size, rotation, frame rate, codecs, audio channels, and whether Chromium can play it as it is.
- [x] **A3. Job queue** (`lib/jobs.js`). Kinds of job (probe, thumbnail, convert, proxy, loudness, …), the user's own requests first, one heavy and two light jobs at a time, unfinished jobs picked up again after a restart, and progress, done and failed reported to the windows.
- [x] **A4. Cache** (`lib/cache.js`; the limit is app-wide, in `app.json`). `%APPDATA%\Wallpane\cache\` with `converted`, `thumbs`, `previews`, `proxies`, each file named by a hash of the original's path, size and time, so a changed file is redone. A size limit with oldest-first clean-up, and **Settings › Storage**: how much it holds, Show folder, Clear.
- [x] **A5. Jobs in the window.** A small indicator in the bar (how many jobs, overall progress) opening a list with cancel; a tile that waits for a job shows its progress on the tile.
- [x] **A6. Graphics card encoders** (on the development PC: Intel Quick Sync). On first use, test NVIDIA (NVENC), Intel (Quick Sync) and AMD (AMF) H.264 encoders with a one-second encode; use the first that works, else x264 "veryfast".
- [x] **A7. Test media made by FFmpeg.** Tests create their own clips with FFmpeg's built-in sources (AVI, MKV with AC3 sound, MPEG-4, VP9; a big GIF comes with B4), so no media files go into git.

## B. Play anything (1.4.0)
- [x] **B1. Know before playing.** Every video is probed when a tile first shows it (once per file); files Chromium cannot play are recognised before they fail, and one that fails anyway is converted after all.
- [x] **B2. Make playable** (`lib/playable.js`), the cheapest way that works:
  - the right codecs in the wrong container (AVI or MKV with H.264 and AAC): copied into MP4 in seconds, no quality lost;
  - only the sound is the problem (AC3, DTS, E-AC3): the sound becomes AAC, the picture is copied;
  - otherwise (MPEG-2, WMV, DivX, HEVC without Windows' HEVC support): converted to H.264.
- [x] **B3. How it feels.** An unplayable file on the wall shows "Making it playable… 45 %" and switches to the copy by itself. Settings: copies made automatically, or only on right-click › Make playable. Folder playlists include such files: the tile moves on after three seconds and plays the file once its copy is there.
- [x] **B4. GIF to video.** Big GIFs (setting: off, over 2 MB, over 10 MB, all) become small MP4s that play smoothly, silent and looping; the tile still counts as a GIF.
- [x] **B5. Saved walls** keep the original file. If the cache was cleared, the copy is simply made again.

## C. Library, part 1 (1.5.0)
- [x] **C0. Design first.** Agreed in [docs/library-design.md](docs/library-design.md): a drawer over the wall, a panel beside it or a window of its own (chosen in Settings, the drawer by default); only folders you add; thumbnails in their own shape in even rows; up to 50,000 files in `library.json`.
- [x] **C1. Library store** (`lib/library.js`): `library.json` with the folders and, per file, its path, size, time, kind, probe info and date added. Saved debounced and atomically, behind one module API. Moved and renamed files keep their id; search, filters and sorting run in the main process (milliseconds for 50,000 files).
- [x] **C2. Folders.** Add and remove library folders (Settings › Library); scanned on adding, on start, on a change and on Look again, and watched the same way as playlist folders; a folder on a missing drive keeps its files. File details come from one background job: pictures from their first bytes (`lib/imagesize.js`, EXIF orientation included), videos from ffprobe.
- [x] **C3. Thumbnails.** A frame from each video (not a black one) and a small copy of each image, as WebP in the cache, filled in as they are made (`lib/thumbs.js`): the ones on screen first, then the rest in the background, about ten a second.
- [x] **C4. Browsing.** Thumbnails in even rows that stay fast with tens of thousands of files; search by name; filters by kind, portrait or landscape, length and resolution; sorting; drag one or many onto the wall or onto a tile; play a folder or a selection as a playlist. Shown as the drawer first (done: `renderer/ui/library.js`, rows by `renderer/lib/justify.js`), then the panel (done, with the choice in the header and in Settings › Library), then the library window (done: `renderer/library.html`, dragging out as a real file drag). The view itself is `renderer/ui/libview.js`, shared by the wall page and the window.
- [x] **C5. Collections.** Your own lists of files; a collection plays as a playlist on a tile, and the playlist follows the collection (`PL.follow`).
- [x] **C6. Tests** for the store, the scanning and the grid, with generated media: unit tests with each step, and `test/e2e/library.spec.js` (3,000 files, a restart, real videos), each test with its own Wallpane.

## D. Previews and a smoother wall (1.6.0)
- [x] **D1. Hover previews** in the library: a few seconds of the video, small. Done: four 1.5 s parts from across the video (a short one: its start), at most 360 px and 30 fps, silent, made by x264 on two threads the first time the pointer rests on a thumbnail (about half a second for a 1080p file) and kept in the cache's `previews` (`lib/previews.js`); a GIF plays itself. One is made at a time, and only the latest waiting one is kept. Settings › Library turns them off, app-wide (`app.json`), so the library window follows.
- [x] **D2. Timeline previews** on video tiles: hovering over the timeline shows the frame there (a strip of small frames made once per video). Done: about one frame a second, at most 100, 160 px on the long side, ten to a row in one WebP in the cache's `previews` (`lib/strips.js`), read from the key frames only (`-skip_frame nokey`, the last one repeated to the end), so a 20 s 1080p clip takes about 0.2 s. Asked for the first time the pointer comes onto a timeline; one at a time, the latest first (`lib/latest.js`, shared with D1). Without the strip, or FFmpeg, the time alone.
- [x] **D3. Lighter copies (proxies).** When a tile is small and the video is big (say 4K on a quarter of a 1080p screen), the tile plays a lighter copy; full screen goes back to the original. Setting: automatic or off. Done first, after a report of lag with two walls of 26 and 36 tiles: copies of at most 960 px and 30 fps for videos from 1440 px, on tiles up to 960 screen px (`lib/playable.js` proxyKind, `renderer/ui/playable.js`). They share the cache's limit rather than having their own share.
- [x] **D4. Even loudness.** Each video is measured once (EBU R128) and gets a stored gain, so a loud clip beside a quiet one plays at the same level when unmuted. Setting: on or off. Done: FFmpeg's `ebur128` on the sound alone, one video at a time, only the ones a wall shows (`lib/loudness.js`, kept in `loudness.json`); a video louder than -18 LUFS plays that much quieter (the element's volume, on top of the tile's own). Only ever quieter: making a quiet one louder would need Web Audio, which for `file:` pages risks silence, so quiet ones keep their level. Settings › General, on by default.
- [x] **D6. Smooth on a slower screen** (found while testing 1.6.0): Chromium paces every window by the main display's vblank, so a wall on a 60 Hz screen beside a 165 Hz main display juddered (making the 60 Hz one the main display fixed it; 120 Hz did not). Settings › Wall mode › Drawing pace: Automatic draws at the slowest screen's rate when they differ (`lib/pace.js`, Chromium's `fake-vsync-rate`, set at start from `app.json`), or the main display's, or 60.
- [x] **D5. Skip black or silent starts.** Clips that open with black or silence start after it. Done: FFmpeg's `blackdetect` and `silencedetect` on the first 12 s, once per video (`lib/openings.js`, kept in `openings.json`; the store is shared with D4 as `lib/measures.js`). A tile starts after a black opening, and after a silent one while it is heard, also when it loops; not a playlist with a random start or a tile with a looped part, nor an opening over a third of the video, nor black throughout the 12 s. Settings › General, on by default.

## P. Polish (1.6.x, before 1.7.0)
- [x] **P1. Fixes from testing 1.6.0** on the big walls (two windows of 26 and 36 tiles, a 60 Hz screen beside a faster main display). Closed on 2026-11-03: the wall looks good. Fixed along the way (in 1.6.6): empty tiles in Free layout look like empty grid cells; the message after making a GIF lays out its buttons in a row; the emergency hide takes any one key, and its mouse button works from any program (a small C# helper, `tools/mousehook`, built with the compiler that comes with Windows, holds a hook for that one button), so it brings back windows that went away.
- [x] **P2. Code optimization.** A pass over the code for speed and weight, measured before and after with the benchmark wall (36 tiles): the start (time to the first frame), memory per wall window, work per frame with many tiles, the main process's file and FFmpeg work, the messages between the windows and the main process (job lists, library changes), and code nothing uses any more. Done (first pass): an idle wall with videos redrew every 0.6 s (an answer about openings set off the next question) and so never saved until it closed; fixed, with a test that fails on the old code (34 calls to the main process in 10 s down to 0, 13 redraws in 8 s down to 0). The clock ticks as often as it shows something new. The start is within 0.1 s of a bare Electron window (1 s more to build 36 tiles); the page's own JavaScript is 97% idle while 30 videos play, so what is left is the graphics card's work (memory: about 1 GB in the GPU process for 30 videos, 10 MB of page heap). A scan found no code nothing uses.
- [x] **P3. UI tweaks.** Small improvements to how it looks and feels, from the test and from going through each part in turn: the top bar, tiles and their controls, Properties, the right-click menus, Settings, the library, wall mode. Done in 1.6.5 (see its notes in CHANGELOG.md): the grouped top bar with Clear, the library drawer on the right, Settings with short names and "?" tips, the Arrange menu and Layouts, the shorter tile menu, folding Properties, quieter empty cells, and the same words everywhere.
- [x] **P4. Take Fit to media and Pack tiles out of Arrange** (decided and done 2026-11-02, as planned below). The Arrange menu keeps **Fill the wall** and **Layouts…**, without group headings.
  - **Why:** both were tested on thousands of random walls.
    - **Fit to media** can't change any shape on a full grid (as many tiles as cells, like 36 on 6 × 6). There it only moves every tile somewhere else, sorted by shape, and switches it to Whole frame. With spare cells it cuts bars from about 30% of the tile area to 17–23%, but it still moves every tile. Fill the wall does the job better: no bars, 0–6% cropped, and the tiles keep their order.
    - **Pack tiles** rebuilds the layout from scratch. On about half the walls with gaps it leaves gaps in the middle, and on about 1 in 130 it shrinks a wide tile to one cell although everything fitted. Layouts…, Fill the wall and dragging already close gaps.
  - **What stays:** **Fit tile to media** for one tile (the right-click menu's Display group and Properties: `A.fitTilesToMedia`), which works well. Also `G.arrange` in `geometry.js`: it is no longer behind a button, but a saved wall whose grid layout doesn't fit uses it to repair itself (`A.applyRecord` in `presets.js`), and it keeps its tests.
  - **What goes:**
    - **Page:** `#fitMediaBtn`, `#arrangeBtn`, the two group headings (`index.html`), and their hints and disabled states in `tiles.js` render.
    - **Code:** the Pack tiles handler and `fitToMedia()` in `media.js`. `mediaAspect` and `shapePlaylists` stay, because Fill the wall and Fit tile to media use them.
    - **Library:** `renderer/lib/fit.js` and its `<script>` tag, and the FIT tests in `test/unit/freegeo-fit.test.js`. That file keeps its free-layout tests.
  - **Tests:** remove the "Arrange > Fit to media" e2e test and the checks on the two buttons in the Free layout test. The e2e tests run in order, so check that the tests after it don't rely on the shapes Fit to media gave the tiles. Add a check that the Arrange menu shows only Fill the wall and Layouts….
  - **Words:**
    - **Settings:** the Settings › Tiles tip for Playlists match tile shapes ("After Fill the wall").
    - **README:** the top bar's Arrange paragraph, the Playlist paragraph ("Fill the wall and Fit to media switch Shapes on"), the Fit to media line under Layout, and the `renderer/lib/` list.
    - **Other docs:** the 1.6.1 Arrange entry in CHANGELOG (say both are gone and what to use instead), and the passing mention in `docs/library-design.md`.
  - **Saved walls:** nothing to migrate. Tiles that Fit to media shaped keep their places and their Whole frame setting.

## E. Library, part 2 (1.7.0)
- [x] **E1. Tags, ratings and favourites**, also for many files at once. Planned and done on 2026-11-03 (the user chose stars and a heart, set in the library and on wall tiles). Where it differs from the plan below: the tile's right-click menu gets one **Library ›** group (Favourite, the ratings, Tags… which opens Properties), whose hint shows the marks, instead of three items at the top level, so the menu 1.6.5 shortened stays short.
  - **What a file gets:** 1 to 5 **stars** (or none), a **favourite** heart, and any number of **tags** (short names; "Beach" and "beach" are one tag, written the way it was first typed). Only files in the library have them, since they live in `library.json` with the file. A changed file keeps them; a moved or renamed one does too (it keeps its id), and so does a copy that takes over from a file that left.
  - **Store** (`lib/library.js`): `stars`, `fav`, `tags` per file; `library.json` goes to version 2, so an older Wallpane opens it read-only and never drops them. `mark(ids, { stars, fav, addTags, dropTags })` for one file or many at once, `tags()` with how many files have each, `renameTag` (into an existing one merges them) and `dropTag`. Searching also matches tag names. Query: `fav`, `stars` (at least), `tag` (one tag shown, like a collection), and a **Rating** sort (most stars first, favourites first among equals).
  - **In the library:**
    - **Thumbnails:** a small heart in the top corner for favourites, and the stars along the foot.
    - **Right-click** (on one file or a selection): Favourite / Not a favourite, **Rating ›** (★ to ★★★★★, No rating), **Tags…**.
    - **Keys:** 1 to 5 set the stars, 0 clears them, F toggles the heart, T opens Tags….
    - **Tags…:** a small box with the tags all the selected files share (× takes one off them all), a field to type a tag (existing ones offered as you type; Enter adds it to them all), and the other tags in use as one-click chips.
    - **The folder row's list** gets a **Tags** section under Collections: a tag shows the files that have it; right-click renames or deletes it (deleting takes it off the files, which stay).
    - **Filters:** Favourites only, and Rating: any, 1+ … 5. **Sort:** Rating.
  - **On the wall,** for a tile whose file is in the library: its right-click menu gets Favourite and Rating › (in the Tile group's neighbourhood, at the top level), and Properties gets a **Library** part: five stars to click, the heart, and its tags (× to take one off, a field to add one). A tile whose file is not in the library shows none of this.
  - **Not in E1:** a tag or rating playing as a playlist (that is E2, saved searches), and tag colours.
  - **Tests:** unit tests for the store (marking many, tags merging and renaming, surviving a changed, moved or returning file, version 2 read-only for older, the query and sort); one end-to-end test in `library.spec.js` (rate, heart and tag from the menu and keys, filter and sort by them, the tag in the folder list, the tile's Properties).
- [ ] **E2. Saved searches as playlists.** A search or filter that a tile plays and that follows the library as it changes (folder playlists become one kind of these).
- [ ] **E3. Markers.** Suggested from scene changes and set by hand; loop a marked part; a playlist of marked moments.
- [ ] **E4. Duplicates.** The same video under different names, found by comparing frames.

## F. Make things from the wall (1.8.0)
- [x] **F1. Make a GIF from a looped part** (asked for on 2026-11-02; done the same day, brought forward into 1.6.5). The same part as an MP4 or animated WebP comes after, from the same dialog.
  - **Save the part as MP4** (done 2026-11-03, not in a dialog after all): a menu item and a Properties button that go straight to Save as. First only copied without re-encoding, but a 1 s loop in a video with keyframes 5 s apart gave a 6 s file. Now copied when the keyframe before the part is within 0.5 s (instant, lossless, the message says how early), else re-encoded to H.264 and AAC so it starts and ends exactly. A copy is an MP4 when the picture and sound go into one, else the video's own kind of file. Code: `lib/cutpart.js` (job kind 'cutpart'). Animated WebP stays open.
  - **Done, and where it differs from the plan below:**
    - **Code:** the choices, the check of what the page asks for, the sizes, the file name and FFmpeg's arguments are in `renderer/lib/gifmake.js`, which the main process uses too. The job kind is in `lib/makegif.js`, and what a tile shows comes from `view.js` `shown()`.
    - **Limits:** a part longer than a minute is refused. Above 15 s the dialog says GIFs get big and suggests a shorter part, a smaller width or fewer frames; an MP4 comes with the MP4 option.
    - **Size estimate:** 0.45 bytes per pixel of each frame, measured. Real files vary from 0.1 (flat pictures) to 1 (noise), so the dialog says "about".
    - **File name:** like `clip 1m23.5s-1m30s.gif`, because Windows allows no colons.
    - **Put on the wall** places the GIF where there is room, as Add does, not beside the tile.
    - **Tests:** the dialog's Cancel is tested end to end, but stopping a running job is not; it uses the same temporary-file clean-up as the other FFmpeg jobs.
    - **Still open:** whether the defaults (480 px, 15 fps) suit.
  - **Where:** Properties › Playback shows **Make a GIF…** under Loop a part once a part is looped, and the tile's right-click menu shows it beside Stop looping the part. A single video only: a playlist tile has no looped part.
  - **What you choose,** in a small dialog:
    - **Width:** 320, 480 (the default), 640 or 800 px; the height follows the shape, and it is never wider than the video.
    - **Frames a second:** 10, 15 (the default), 20 or 25.
    - **What it shows:** the whole frame, or the tile's view (its shape, zoom and position).
    - **Speed:** normal, or the tile's speed.
    - **Loops:** forever.
    - **Size:** a rough size estimate updates as you choose. Above 15 s the dialog says GIFs get big and suggests an MP4.
  - **Saved where:** a Save dialog that starts in the video's folder, with a name like `clip 1.23-1.30.gif`. The original is never touched. The GIF is written under a temporary name and renamed at the end, so a cancelled or failed GIF leaves nothing behind.
  - **How:** FFmpeg makes the GIF in one pass, offline:
    - `-ss`/`-t` for the part, then `fps`, `scale` (lanczos), and `crop` for the tile's view;
    - `setpts` for the speed;
    - `split` into `palettegen` (stats_mode=diff) and `paletteuse` (bayer dither, diff_mode=rectangle), with `-loop 0`.

    It is made from the original file, also when the tile plays a playable copy or a lighter copy, since the times are the same.
  - **As a job:** a new kind in `lib/jobs.js`, one at a time, with progress from FFmpeg's time in the job list and the bar. Cancel stops FFmpeg and deletes the temporary file.
  - **When it is done:** a message with **Show in Explorer** and **Put on the wall** (a new tile beside this one). A GIF saved in a library folder shows up in the library by itself, because it already watches its folders for new files.
  - **Code:** the FFmpeg arguments, the tile's view turned into a crop (from `view.js`: fill, zoom and position), and the size estimate go in a plain module in `lib/`, tested without FFmpeg.
  - **Tests:**
    - Unit: the arguments and the crop for zoomed, moved and fill/whole-frame tiles.
    - End-to-end: loop a part of the test video and make a GIF. The file must start with `GIF89a`, have several frames and the chosen width. A cancelled job leaves no file.
  - **Open questions** (when planned): keep it in 1.8.0 or move it earlier (moved: 1.6.5); are the default width and rate (480 px, 15 fps) right?
- [ ] **F2. Snapshot.** Save a tile's current frame as an image.
- [ ] **F3. Export the wall as a video.** Every tile in its place, as one MP4 at a chosen size and length, made from the tiles' lighter copies, with progress in the job list. Play it on a smart TV from USB, or share it.

## Later
- **Wallpane Lite.** The same app without FFmpeg, for people who only play MP4, WebM and pictures: about 115 MB to download instead of 178 MB. Wallpane already runs without FFmpeg (Make playable and the FFmpeg-made thumbnails and previews are simply not offered, and say so), so Lite is mostly a second build: the same code without `resources/ffmpeg`, named *Wallpane Lite*, built and attached to each release by CI next to the full one. Open question to settle first: whether Lite should also hide features (a simpler bar for a casual wall), or only leave FFmpeg out.
- Microsoft Store (an MSIX package, FFmpeg included), once the account is ready. GitHub Sponsors is live (About, README and the repository's Sponsor button).
- **Saved wall playlists.** A list of saved walls that a window plays in turn: each for a set time (or until its tiles' playlists have gone round once), in order or shuffled, with a fade between walls. Wall mode and the start can play the list; Next and Previous step through it by hand. Scheduled walls could build on it (a list for each time of day).
- Scheduled walls; clock and text tiles on the wall; one wall across several screens; more transitions.
- Research: similar apps for phones and tablets; a phone version or a phone as a remote for the wall.
- **v2:** the optional Stash connector.
- "Switch desktops": waiting for a description.
