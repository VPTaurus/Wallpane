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
- [ ] **D5. Skip black or silent starts.** Clips that open with black or silence start after it.

## E. Library, part 2 (1.7.0)
- [ ] **E1. Tags, ratings and favourites**, also for many files at once.
- [ ] **E2. Saved searches as playlists.** A search or filter that a tile plays and that follows the library as it changes (folder playlists become one kind of these).
- [ ] **E3. Markers.** Suggested from scene changes and set by hand; loop a marked part; a playlist of marked moments.
- [ ] **E4. Duplicates.** The same video under different names, found by comparing frames.

## F. Make things from the wall (1.8.0)
- [ ] **F1. Save a looped part** as its own MP4 (copied when the cut allows, else converted), or as a GIF or WebP.
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
