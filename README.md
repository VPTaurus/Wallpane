# Wallpane

A video wall for Windows: your own videos, images and GIFs, many at once, arranged on a grid or placed freely by the pixel, on one screen or several. Drop files or folders from Explorer, resize tiles by their edges, play folders as playlists, and save walls to come back to (they link to your files; nothing is copied).

Everything stays on your computer: Wallpane plays local files only and never connects to the internet.

Wallpane used to be called Media Wall. On its first start it copies your saved walls and settings from the old `%APPDATA%\Media Wall` folder, which stays as a backup; older exports import as before.

Wallpane is free software under the [GNU General Public License, version 3 or later](LICENSE).

If Wallpane is useful to you, you can support its development on [GitHub Sponsors](https://github.com/sponsors/VPTaurus). It stays free either way.

## Run it
1. Install Node.js 22 or newer (https://nodejs.org, or `winget install OpenJS.NodeJS.LTS`).
2. In this folder: `npm install`
3. `npm run fetch-ffmpeg` once: it downloads the pinned FFmpeg build (about 95 MB, checked against its SHA-256) and keeps what Wallpane uses in `vendor/ffmpeg`, which is not in git. Wallpane runs without it, but then it cannot convert or read media files with FFmpeg.
4. `npm start` (or `npm run dev` for developer tools, F12).

## Build a Windows app
`npm run dist` creates an installer and a portable .exe in `dist/`, with FFmpeg inside (it fetches FFmpeg first if `vendor/ffmpeg` is missing). Building on Windows is simplest.

### Releases
1. Raise `version` in `package.json` (`npm version 1.4.0 --no-git-tag-version` also updates `package-lock.json`) and add the changes to `CHANGELOG.md`. Merge into `main`.
2. On GitHub: Releases › Draft a new release › tag `v1.4.0` (the same version) on `main`, paste the changelog section, Publish.
3. The CI workflow builds both .exe files, tests the built app and attaches the files to the release within a few minutes. It stops if the tag and the version don't match.

### FFmpeg inside Wallpane
Wallpane ships FFmpeg 9.0.2, the shared Windows build from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (`ffmpeg.exe`, `ffprobe.exe` and their libraries), under the GPL version 3. It is pinned in `scripts/fetch-ffmpeg.js` by URL and SHA-256 and lands in `resources/ffmpeg` of the installed app, next to its licence (`LICENSE.txt`) and the build's `README.txt`, which names the exact FFmpeg source ([commit 946fcce07b](https://github.com/FFmpeg/FFmpeg/commit/946fcce07b)) and the libraries in it. Settings › About shows the version and links to that source. Wallpane only ever gives FFmpeg local files; it never goes online. To move to a newer build, change the version, URL, SHA-256 and source in that script.

### Code signing
Unsigned builds work, but Windows SmartScreen warns on other PCs ("Windows protected your PC"). To sign, get a code-signing certificate (.pfx) and set two environment variables before `npm run dist`; electron-builder picks them up:
- `CSC_LINK`: path to the .pfx file (or its base64 text)
- `CSC_KEY_PASSWORD`: its password

The GitHub workflow does the same with repository secrets of the same names.

## Data
Saved walls, frame layouts, settings and your last wall are JSON files in `%APPDATA%\Wallpane`. Settings › About shows the folder, and Saved walls > Show file opens it. Saved walls > Export/Import moves them between PCs.

## The window
- Top bar, left to right: **Add** (files, a folder as tiles, or a folder as a playlist); the wall: grid size, gap and cell shape (the "4 × 3" button), **Snap to grid / Free (pixels)**, and **Arrange** (Fit to media, Auto-arrange, Rows and columns, Frame layouts); play, mute and loop for every video, and **background music** (♪); undo and redo. On the right: the **clock**, **Saved walls**, **Playlist**, **?** (getting started), **Settings** (the cog) and **Wall mode**. In a narrow window the bar keeps to one line by showing some buttons as icons only and shortening the mode names to Grid / Free.
- The **clock** opens a **stopwatch** (with laps) and a **countdown timer** (type minutes like 5, or 1:30, or pick 1 to 60 minutes). Each has an **In the bar** box, which alone decides what the bar shows: a ticked stopwatch or timer is a chip with a start/pause button (a finished timer's button resets it); unticking it takes it off the bar and resets it. Without the clock ticked, a small clock icon stays to open the popover. Both keep running when the popover is closed and in wall mode. At zero the timer beeps three times and its chip flashes until you reset it. A **counter** counts anything you like (−, + and Reset; kept for next time); in the bar its + adds one and a right-click on it takes one away, and unticking it resets it to 0. The clock follows Windows' 12 or 24-hour format unless you choose one (Settings › General, or the 24-hour box in the clock).
- **Settings** opens a panel with its sections down the side (arrow keys move between them):
  - **General**: start Wallpane with Windows, the clock's time format, open another wall window, clear this wall.
  - **Wall mode**: which display, start this window in wall mode, keep the display awake.
  - **Emergency hide**: the key, a mouse button, and what the windows show (see below).
  - **Keys**: every keyboard shortcut.
  - **About**: version, licence, source code, and the folder your data is in.

  Help (**?**) has buttons that open Keys and About.
- The wall has the whole window. The selected tile has an orange ring with round grips at its corners; drag a grip or any edge to resize. A pinned playlist tile shows a pin badge.
- Right-click a tile for: reposition and zoom its media, fit, sound, replace, own folder, duplicate, split in two, Properties, remove. Right-click empty wall to add media or a folder right there, or to make a new empty tile.
- **Properties** (right-click a tile, or Alt+Enter) opens a card next to the tile with its exact position and size (cells, or pixels in Free mode), how the media fits and its zoom, playback, playlist and file actions. Esc or × closes it; selecting another tile moves it there.
- A tile that plays a folder has **Playlist settings** (right-click, or the Playlist part of Properties): the folder and its number of files, rotating or pinned, order, image seconds, GIFs, where videos start, crossfade, max clip length, and Zoom and position (new for each file, or kept for every file: images, GIFs and videos alike), plus Next file, Change folder and Stop the playlist on this tile (it keeps the file it shows). Changes apply at once and can be undone; when several tiles play the same folder, they all follow. The Playlist button in the top bar holds the options for new playlists.

## Tiles
- Empty tiles are frames without media: size and place them first, then drop media or a folder on them, click File… or Folder… (the tile then plays the folder's files in turn), or add a folder as a playlist (playlists fill empty tiles first, also in Free layout). On the grid they give way: when a tile grows or moves and there is no other room, it takes their cells and they go (before any tile is shrunk). In Free (pixels) they are pushed and squeezed like other tiles.
- A video tile has a control bar along its bottom (it shows when the pointer is over the tile): play, time, a timeline you can drag, sound, volume and speed. Properties > Playback holds the same, plus **Loop a part**: type a start and end time (like 1:23.5) or play to a spot and press Now, and the video repeats just that part; the timeline shows it. Volume, speed and the looped part are saved with the wall.
- Media inside a tile can be moved and zoomed: scroll the wheel over the selected tile to zoom (up to 8×) around the pointer; Reposition and zoom (right-click menu or Properties) lets you drag the media inside the tile. Reset puts it back. Each tile remembers this in saved walls.
- Arrange > **Fill the wall** arranges every tile in rows (or columns) so each keeps its media's exact shape and together they fill the wall edge to edge, like a photo collage. Tiles keep their reading order unless regrouping them crops clearly less; whatever small difference is left is shared by all tiles (the message says how much). On the grid it switches to Free (pixels) first; Ctrl+Z undoes it.
- Arrange > Rows and columns builds the wall from rows (or columns) with their own number of tiles, for example 3 in the first row and 4 in the second. When the rows share a grid of up to 12 cells (3 and 4 do: 12) the wall stays on the grid; otherwise it switches to Free (pixels). Tiles move into the new frames in reading order and leftover frames become empty tiles.

## Keys
- F11 wall mode on or off, Esc leaves wall mode / fullscreen
- Ctrl+Shift+H emergency hide, from any program (see below); press again to come back
- Tab moves between tiles and selects them; Enter selects or lets go
- Arrows move the selected tile, Shift+arrows resize, Delete removes it
- Alt+Enter opens Properties for the selected tile; Esc closes it (or the right-click menu, or Reposition), and a second Esc lets go of the tile
- On a selected video: Space or K plays and pauses, J / L skip 5 seconds back / on, [ and ] set where the looped part starts and ends, \ stops looping it, < and > change the speed, M mutes
- Ctrl+Z / Ctrl+Y undo / redo
- Double-click a tile for single-tile full screen (Esc or another double-click ends it). It plays that tile's sound and the others go quiet until it ends; Settings › General can turn that off. A tile playing a folder keeps moving on to its next files in full screen.

## Formats
Playback uses Chromium's built-in codecs, so these work: MP4 (H.264, and HEVC where Windows has the decoder), WebM, MOV, M4V, MKV and OGV video; JPEG, PNG, GIF, WebP, AVIF, BMP and SVG images.

**Make playable.** Other videos play too: AVI, WMV, FLV, MPEG, MPEG-TS, VOB, 3GP, RealMedia and DivX, and MKV or MP4 files whose sound Chromium cannot play (AC3, DTS, E-AC3) or whose picture it cannot (10-bit H.264, HEVC where Windows lacks it, MPEG-2, …). The bundled FFmpeg first reads what the file holds, then makes a playable copy the cheapest way that works: re-wrapped into MP4 in seconds when only the container is the problem, only the sound converted when only the sound is, or converted to H.264 (on the graphics card when it can: NVIDIA, Intel or AMD, else on the processor). The tile shows what it is doing and switches to the copy by itself; a playlist tile moves on meanwhile and plays the file once its copy is there. Copies go to the cache (Settings › Storage); your files are never changed, and saved walls keep pointing at them. A video that still fails to play is converted after all, and right-click › Make playable does that by hand. Settings › General can switch the automatic copies off. The bar shows a small indicator while this runs, with a list where each job can be stopped.

**GIFs as videos.** A big GIF (by default over 2 MB; Settings › General: off, 2 MB, 10 MB or all GIFs) gets a small video copy in the background and then plays from it: far smoother and lighter, still silent and looping, and still a GIF everywhere else (playlists time it as a GIF). Transparent parts turn black, as they look on a tile anyway.

HEIC, TIFF, PSD and camera RAW pictures cannot be shown. The app tells you when it finds them; convert them to JPEG or PNG.

## Wall mode and unattended walls
- Wall mode (F11) hides the controls and fills the display picked under Settings › Wall mode › Show on.
- Settings › Wall mode: start this window in wall mode; keep the display awake in wall mode (on by default).
- Settings › General: start Wallpane when you sign in to Windows (installed or portable app only). If you had this on for Media Wall, turn it on again here.

  Together these bring a wall back full screen after a restart.

## Background music
The ♪ button in the top bar plays a folder of your own music behind the wall: MP3, M4A, AAC, WAV, OGG, Opus and FLAC, from the folder and the folders in it, one track after another, in name order or shuffled, with its own volume, previous and next. It keeps playing in wall mode, pauses with the emergency hide, and starts again on the next start if it was playing. Each wall window has its own. Videos on the wall keep their own sound settings, so mute them for music only.

## On a TV or projector
Settings › Wall mode › **Connect a wireless display…** opens Windows' display settings, where "Connect to a wireless display" (or Win+K) casts to a TV, projector or stick that supports Miracast. Choose **Extend** so it becomes a display of its own; Wallpane notices and lists it under Show on, and wall mode then fills it. Chromecast is not supported.

## Emergency hide
Press **Ctrl+Shift+H** in any program and every wall window hides at once: the sound goes off (the window is muted, not just the videos), videos and playlists pause, and the windows show something else. Press it again and everything comes back as it was, the videos playing on. Starting Wallpane again also brings it back, in case the key slips your mind.

Settings › Emergency hide:
- **Key**: click it and press the new keys. A key with letters or numbers needs two modifiers (like Ctrl+Shift or Ctrl+Alt), because the key is taken from every other program while Wallpane runs; F-keys and Scroll Lock also work alone. If another program already holds the key, Settings says so, and it then works only while Wallpane is the active window.
- **Or one press**: pick F9, Scroll Lock, or your keyboard's Mute or Play/Pause key with a click. A media key then stops doing its usual job while Wallpane runs.
- **Mouse button**: back or forward (the side buttons) or middle. It works while the pointer is over a Wallpane window. To use a mouse button from any program, have your mouse's own software (Logitech G Hub, Razer Synapse, or the free X-Mouse Button Control) press the hide key instead.
- **Windows show**: a spreadsheet (a plain budget table; you can click cells and move with the arrow keys, and the window title changes to match), a black screen, a picture you choose, or nothing at all: the windows go away, off the taskbar too.
- **Hide now** tries it.

While hidden, keys, drops and right-clicks don't reach the wall, so nothing on it can change by accident. The settings are shared by all wall windows (`hide.json`).

## Notes
- Playlist: choose a folder (Playlist > Choose folder, or Add > Folder as a playlist) and it fills the empty cells, one file per tile; rows or columns you add later fill too. Drop a folder on a tile to give just that tile the folder. Options: order, image seconds, GIFs, crossfade, random video start, max clip length, and Plays: videos, GIFs and images, any mix (a tile's Playlist settings change it for a playlist that is already playing; tiles showing a kind you untick move on at once). New files in the folder join the queue as they appear (the app watches the folder, and also rescans every two minutes for network drives). Pin a tile to keep it. A folder is read up to 3,000 files.
- Dropping a folder on empty space: on the grid it plays as a playlist; in Free layout each file gets its own tile.
- Tiles: Snap to grid, or Free (pixels). Free lets you place and size every tile by the pixel: edges snap to other tiles and the wall (Alt turns that off), Shift while resizing keeps the tile's shape, arrow keys move 1 px (Ctrl: 10) and Properties takes exact pixel values. Switching keeps every tile where it is.
  - Moving: the tile follows the pointer and the others make room, each only further to its own side, never jumping over the tile you drag. Where they cannot, they stay, and dropping on one swaps the two; anywhere else the tile goes back.
  - Resizing: the tiles beside the edge you drag slide into any free space, then all of them shrink evenly. Settings › General › Growing a tile can switch to the older way: they are pushed and only the one at the wall shrinks.
  - Media added in Free (pixels) gets a tile with the media's exact shape as soon as it has loaded.
- Fit to media: on the grid it resizes and rearranges tiles so each media fills its tile with as few bars as possible. In Free mode it shrinks every tile to its media's exact shape, so there are no bars and nothing is cropped; "Fit tile to media" in a tile's right-click menu does this for one tile (switching to Free if needed). All undoable.
- Settings › General › Open another wall window: another wall (for a second monitor); each window has its own wall and settings, saved walls and frame layouts are shared; windows reopen on the next start.
- Clear wall is in Settings › General and takes two clicks; Ctrl+Z brings the wall back.

## Development
- `npm run lint`: ESLint
- `npm test`: unit tests (Node's built-in test runner), for the logic in `renderer/lib` and `lib`, plus checks that the page, preload and main process are wired together
- `npm run test:e2e`: starts the real app with Playwright and goes through the main features (test data in a temporary folder)
- `npm run check`: all three

GitHub Actions runs all three on every push to `main` or `Dev` and on every pull request. Running the workflow by hand, or publishing a release (see Releases above), also builds the .exe files.

### Code map
- `main.js`: windows, dialogs, file access, wall-mode wake lock, start with Windows, the emergency hide key. Every call from the page goes through `handle()`, which only accepts our own wall windows.
- `preload.js`: the small API the page gets (`window.wall`).
- `lib/`: main-process helpers: scanning folders, GIF lengths, safe JSON saves (`files.js`), watching playlist folders (`watch.js`), running FFmpeg (`ffmpeg.js`), what a file holds and what it needs (`mediainfo.js`), making a playable copy (`playable.js`), the background job queue (`jobs.js`) and the cache (`cache.js`).
- `scripts/fetch-ffmpeg.js`: the pinned FFmpeg build, fetched into `vendor/ffmpeg`.
- `renderer/lib/`: plain logic with no DOM, also loaded by the tests: formats, grid and free-layout geometry (pushing and squeezing included), Fit to media, playlists, saved records, the pan and zoom maths (`view.js`), video playback times (`playback.js`), shortcut keys (`hotkey.js`, also used by the main process), the stopwatch and timer (`clock.js`) and Fill the wall (`collage.js`).
- `renderer/ui/`: the page, one file per area. `core.js` holds the shared state (`MW.app`, called `A`); the other files add their functions to it: `tiles.js`, `inspector.js`, `media.js`, `playlists.js`, `presets.js`, `controls.js`, `menus.js` (right-click menus), `builder.js` (rows and columns), `hide.js` (emergency hide), `clock.js` (the time in the bar), `music.js` (background music), `playable.js` (tiles waiting for a playable copy), `jobs.js` (background work in the bar, Settings › Storage), and `boot.js` last.
