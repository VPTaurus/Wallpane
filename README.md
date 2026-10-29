# Wallpane

A video wall for Windows: your own videos, images and GIFs, many at once, arranged on a grid or placed freely by the pixel, on one screen or several. Drop files or folders from Explorer, resize tiles by their edges, play folders as playlists, and save walls to come back to (they link to your files; nothing is copied).

Everything stays on your computer: Wallpane plays local files only and never connects to the internet.

Wallpane used to be called Media Wall. On its first start it copies your saved walls and settings from the old `%APPDATA%\Media Wall` folder, which stays as a backup; older exports import as before.

Wallpane is free software under the [GNU General Public License, version 3 or later](LICENSE).

## Run it
1. Install Node.js 22 or newer (https://nodejs.org, or `winget install OpenJS.NodeJS.LTS`).
2. In this folder: `npm install`
3. `npm start` (or `npm run dev` for developer tools, F12).

## Build a Windows app
`npm run dist` creates an installer and a portable .exe in `dist/`.
(Building on Windows is simplest.)

### Code signing
Unsigned builds work, but Windows SmartScreen warns on other PCs ("Windows protected your PC"). To sign, get a code-signing certificate (.pfx) and set two environment variables before `npm run dist`; electron-builder picks them up:
- `CSC_LINK`: path to the .pfx file (or its base64 text)
- `CSC_KEY_PASSWORD`: its password

The GitHub workflow does the same with repository secrets of the same names.

## Data
Saved walls, frame layouts, settings and your last wall are JSON files in `%APPDATA%\Wallpane`. Saved walls > Show file opens the folder. Saved walls > Export/Import moves them between PCs.

## The window
- Top bar, left to right: **Add** (files, a folder as tiles, or a folder as a playlist); the wall: grid size, gap and cell shape (the "4 × 3" button), **Snap to grid / Free (pixels)**, and **Arrange** (Fit to media, Auto-arrange, Rows and columns, Frame layouts); play, mute and loop for every video; undo and redo. On the right: **Saved walls**, **Playlist**, **?** (getting started and keys), **Settings** (gear) and **Wall mode**.
- The wall has the whole window. The selected tile has an orange ring with round grips at its corners; drag a grip or any edge to resize. A pinned playlist tile shows a pin badge.
- Right-click a tile for: reposition and zoom its media, fit, sound, replace, own folder, duplicate, split in two, Properties, remove. Right-click empty wall to add media or a folder right there, or to make a new empty tile.
- **Properties** (right-click a tile, or Alt+Enter) opens a card next to the tile with its exact position and size (cells, or pixels in Free mode), how the media fits and its zoom, playback, playlist and file actions. Esc or × closes it; selecting another tile moves it there.
- A tile that plays a folder has **Playlist settings** (right-click, or the Playlist part of Properties): the folder and its number of files, rotating or pinned, order, image seconds, GIFs, where videos start, crossfade, max clip length, and Zoom and position (new for each file, or kept for every file: images, GIFs and videos alike), plus Next file, Change folder and Stop the playlist on this tile (it keeps the file it shows). Changes apply at once and can be undone; when several tiles play the same folder, they all follow. The Playlist button in the top bar holds the options for new playlists.

## Tiles
- Empty tiles are frames without media: size and place them first, then drop media on them, click Choose…, or add a folder as a playlist (playlists fill empty tiles first, also in Free layout). On the grid they give way: when a tile grows or moves and there is no other room, it takes their cells and they go (before any tile is shrunk). In Free (pixels) they are pushed and squeezed like other tiles.
- A video tile has a control bar along its bottom (it shows when the pointer is over the tile): play, time, a timeline you can drag, sound, volume and speed. Properties > Playback holds the same, plus **Loop a part**: type a start and end time (like 1:23.5) or play to a spot and press Now, and the video repeats just that part; the timeline shows it. Volume, speed and the looped part are saved with the wall.
- Media inside a tile can be moved and zoomed: scroll the wheel over the selected tile to zoom (up to 8×) around the pointer; Reposition and zoom (right-click menu or Properties) lets you drag the media inside the tile. Reset puts it back. Each tile remembers this in saved walls.
- Arrange > Rows and columns builds the wall from rows (or columns) with their own number of tiles, for example 3 in the first row and 4 in the second. When the rows share a grid of up to 12 cells (3 and 4 do: 12) the wall stays on the grid; otherwise it switches to Free (pixels). Tiles move into the new frames in reading order and leftover frames become empty tiles.

## Keys
- F11 wall mode on or off, Esc leaves wall mode / fullscreen
- Tab moves between tiles and selects them; Enter selects or lets go
- Arrows move the selected tile, Shift+arrows resize, Delete removes it
- Alt+Enter opens Properties for the selected tile; Esc closes it (or the right-click menu, or Reposition), and a second Esc lets go of the tile
- On a selected video: Space or K plays and pauses, J / L skip 5 seconds back / on, [ and ] set where the looped part starts and ends, \ stops looping it, < and > change the speed, M mutes
- Ctrl+Z / Ctrl+Y undo / redo
- Double-click a tile for single-tile fullscreen

## Formats
Playback uses Chromium's built-in codecs, so these work: MP4 (H.264, and HEVC where Windows has the decoder), WebM, MOV, M4V, MKV and OGV video; JPEG, PNG, GIF, WebP, AVIF, BMP and SVG images.

AVI, WMV, FLV, MPEG, MPEG-TS, VOB, 3GP, HEIC, TIFF, PSD and camera RAW files cannot play. The app tells you when it finds them; convert videos to MP4 (HandBrake does this for free) and images to JPEG or PNG. A file in a supported container with an unsupported codec shows a message on its tile.

## Wall mode and unattended walls
- Wall mode (F11) hides the controls and fills the display picked under Settings > Show on.
- Settings (the gear):
  - Start this window in wall mode.
  - Keep the display awake in wall mode (on by default).
  - Start Wallpane when you sign in to Windows (installed or portable app only). If you had this on for Media Wall, turn it on again here.

  Together these bring a wall back full screen after a restart.

## Notes
- Playlist: choose a folder (Playlist > Choose folder, or Add > Folder as a playlist) and it fills the empty cells, one file per tile; rows or columns you add later fill too. Drop a folder on a tile to give just that tile the folder. Options: order, image seconds, GIFs, crossfade, random video start, max clip length. New files in the folder join the queue as they appear (the app watches the folder, and also rescans every two minutes for network drives). Pin a tile to keep it. A folder is read up to 3,000 files.
- Dropping a folder on empty space: on the grid it plays as a playlist; in Free layout each file gets its own tile.
- Tiles: Snap to grid, or Free (pixels). Free lets you place and size every tile by the pixel: edges snap to other tiles and the wall (Alt turns that off), Shift while resizing keeps the tile's shape, arrow keys move 1 px (Ctrl: 10) and Properties takes exact pixel values. Switching keeps every tile where it is.
  - Moving: the tile follows the pointer and the others make room. Where they cannot, dropping on another tile swaps the two; anywhere else the tile goes back.
  - Resizing pushes the tiles in the way; once they reach the wall they get squeezed, down to a minimum size.
- Fit to media: on the grid it resizes and rearranges tiles so each media fills its tile with as few bars as possible. In Free mode it shrinks every tile to its media's exact shape, so there are no bars and nothing is cropped; "Fit tile to media" in a tile's right-click menu does this for one tile (switching to Free if needed). All undoable.
- Settings > Open another wall window: another wall (for a second monitor); each window has its own wall and settings, saved walls and frame layouts are shared; windows reopen on the next start.
- Clear wall is in Settings and takes two clicks; Ctrl+Z brings the wall back.

## Development
- `npm run lint`: ESLint
- `npm test`: unit tests (Node's built-in test runner), for the logic in `renderer/lib` and `lib`, plus checks that the page, preload and main process are wired together
- `npm run test:e2e`: starts the real app with Playwright and goes through the main features (test data in a temporary folder)
- `npm run check`: all three

GitHub Actions runs all three on every push to `main` or `Dev` and on every pull request. Running the workflow by hand, or pushing a `v*` tag, also builds the .exe files.

### Code map
- `main.js`: windows, dialogs, file access, wall-mode wake lock, start with Windows. Every call from the page goes through `handle()`, which only accepts our own wall windows.
- `preload.js`: the small API the page gets (`window.wall`).
- `lib/`: main-process helpers: scanning folders, GIF lengths, safe JSON saves (`files.js`), watching playlist folders (`watch.js`).
- `renderer/lib/`: plain logic with no DOM, also loaded by the tests: formats, grid and free-layout geometry (pushing and squeezing included), Fit to media, playlists, saved records, and the pan and zoom maths (`view.js`).
- `renderer/ui/`: the page, one file per area. `core.js` holds the shared state (`MW.app`, called `A`); the other files add their functions to it: `tiles.js`, `inspector.js`, `media.js`, `playlists.js`, `presets.js`, `controls.js`, `menus.js` (right-click menus), `builder.js` (rows and columns), and `boot.js` last.
