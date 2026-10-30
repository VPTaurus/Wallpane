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
- [ ] **A5. Jobs in the window.** A small indicator in the bar (how many jobs, overall progress) opening a list with cancel; a tile that waits for a job shows its progress on the tile.
- [ ] **A6. Graphics card encoders.** On first use, test NVIDIA (NVENC), Intel (Quick Sync) and AMD (AMF) H.264 encoders with a one-second encode; use the first that works, else x264 "veryfast".
- [ ] **A7. Test media made by FFmpeg.** Tests create their own clips with FFmpeg's built-in sources (AVI, MKV with AC3 sound, HEVC, a big GIF), so no media files go into git.

## B. Play anything (1.4.0)
- [ ] **B1. Know before playing.** Every added video is probed; files Chromium cannot play are recognised before they fail.
- [ ] **B2. Make playable**, the cheapest way that works:
  - the right codecs in the wrong container (AVI or MKV with H.264 and AAC): copied into MP4 in seconds, no quality lost;
  - only the sound is the problem (AC3, DTS, E-AC3): the sound becomes AAC, the picture is copied;
  - otherwise (MPEG-2, WMV, DivX, HEVC without Windows' HEVC support): converted to H.264.
- [ ] **B3. How it feels.** An unplayable file on the wall shows "Making playable… 45 %" and switches to the copy by itself. Settings: convert automatically, or ask. Right-click a failing tile › Make playable. Folder playlists include such files and queue them.
- [ ] **B4. GIF to video.** Big GIFs (setting: above a size) become small MP4s that play smoothly; the tile still says GIF.
- [ ] **B5. Saved walls** keep the original file. If the cache was cleared, the copy is simply made again.

## C. Library, part 1 (1.5.0)
- [ ] **C0. Design first.** A short design to agree on before code: where the library lives (a panel beside or over the wall, or its own window), what it stores, how search and filters work, what dragging to the wall does.
- [ ] **C1. Library store** (`lib/library.js`): `library.json` with the folders and, per file, its path, size, time, kind, probe info and date added. Saved debounced and atomically, behind one module API.
- [ ] **C2. Folders.** Add and remove library folders; scanned with the code that reads playlists today and watched the same way; new files are probed in the background.
- [ ] **C3. Thumbnails.** A frame from each video (not a black one) and a small copy of each image, as WebP in the cache, filled in as they are made.
- [ ] **C4. Browsing.** A thumbnail grid that stays fast with thousands of files; search by name; filters by kind, portrait or landscape, length and resolution; sorting; drag one or many onto the wall or onto a tile; play a folder or a selection as a playlist.
- [ ] **C5. Collections.** Your own lists of files; a collection plays as a playlist on a tile.
- [ ] **C6. Tests** for the store, the scanning and the grid, with generated media.

## D. Previews and a smoother wall (1.6.0)
- [ ] **D1. Hover previews** in the library: a few seconds of the video, small.
- [ ] **D2. Timeline previews** on video tiles: hovering over the timeline shows the frame there (a strip of small frames made once per video).
- [ ] **D3. Lighter copies (proxies).** When a tile is small and the video is big (say 4K on a quarter of a 1080p screen), the tile plays a 720p copy; full screen goes back to the original. Setting: automatic or off, with its own share of the cache.
- [ ] **D4. Even loudness.** Each video is measured once (EBU R128) and gets a stored gain, so a loud clip beside a quiet one plays at the same level when unmuted. Setting: on or off.
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
- Microsoft Store (an MSIX package, FFmpeg included) and GitHub Sponsors, once the accounts are ready.
- Scheduled walls; clock and text tiles on the wall; one wall across several screens; more transitions.
- Research: similar apps for phones and tablets; a phone version or a phone as a remote for the wall.
- **v2:** the optional Stash connector.
- "Switch desktops": waiting for a description.
