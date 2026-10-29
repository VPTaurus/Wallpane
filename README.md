# Media Wall (Windows desktop app)

A grid wall for videos, images and GIFs. Drop files or folders from Explorer, drag borders to resize tiles, save wall presets (they link to your files, nothing is copied) and layouts.

Everything stays on your computer: the app plays local files only and never connects to the internet.

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
Presets, layouts, settings and your last wall are JSON files in `%APPDATA%\Media Wall`. Presets > Show file opens the folder. Presets > Export/Import moves them between PCs.

## Keys
- F11 wall mode on or off, Esc leaves wall mode / fullscreen
- Tab moves between tiles and selects them; Enter or Space selects or lets go
- Arrows move the selected tile, Shift+arrows resize, Delete removes it
- Ctrl+Z / Ctrl+Y undo / redo, Ctrl+B hides the side panel
- Double-click a tile for single-tile fullscreen

## Formats
Playback uses Chromium's built-in codecs, so these work: MP4 (H.264, and HEVC where Windows has the decoder), WebM, MOV, M4V, MKV and OGV video; JPEG, PNG, GIF, WebP, AVIF, BMP and SVG images.

AVI, WMV, FLV, MPEG, MPEG-TS, VOB, 3GP, HEIC, TIFF, PSD and camera RAW files cannot play. The app tells you when it finds them; convert videos to MP4 (HandBrake does this for free) and images to JPEG or PNG. A file in a supported container with an unsupported codec shows a message on its tile.

## Wall mode and unattended walls
- Wall mode (F11) hides the controls and fills the display picked under "Wall display".
- Settings:
  - Start this window in wall mode.
  - Keep the display awake in wall mode (on by default).
  - Start Media Wall when you sign in to Windows (installed or portable app only).

  Together these bring a wall back full screen after a restart.

## Notes
- Playlist: choose a folder (Playlist > Choose folder, or Add folder > As a playlist) and it fills the empty cells, one file per tile; rows or columns you add later fill too. Drop a folder on a tile to give just that tile the folder. Options: order, image seconds, GIFs, crossfade, random video start, max clip length. New files in the folder join the queue as they appear (the app watches the folder, and also rescans every two minutes for network drives). Pin a tile to keep it. A folder is read up to 3,000 files.
- Dropping a folder on empty space: on the grid it plays as a playlist; in Free layout each file gets its own tile.
- Fit to media: resizes and rearranges tiles so each media fills its tile with as few bars as possible (undoable).
- Layout: Grid or Free. Free layout lets you place and size every tile by the pixel (snapping to edges, Alt turns it off; arrow keys move 1 px); tiles in the way slide aside.
- New window: opens another wall (for a second monitor); each window has its own wall and settings, presets and layouts are shared; windows reopen on the next start.

## Development
- `npm run lint`: ESLint
- `npm test`: unit tests (Node's built-in test runner), for the logic in `renderer/lib` and `lib`, plus checks that the page, preload and main process are wired together
- `npm run test:e2e`: starts the real app with Playwright and goes through the main features (test data in a temporary folder)
- `npm run check`: all three

GitHub Actions runs all three on every push and pull request. Running the workflow by hand, or pushing a `v*` tag, also builds the .exe files.

### Code map
- `main.js`: windows, dialogs, file access, wall-mode wake lock, start with Windows. Every call from the page goes through `handle()`, which only accepts our own wall windows.
- `preload.js`: the small API the page gets (`window.wall`).
- `lib/`: main-process helpers: scanning folders, GIF lengths, safe JSON saves (`files.js`), watching playlist folders (`watch.js`).
- `renderer/lib/`: plain logic with no DOM, also loaded by the tests: formats, grid and free-layout geometry, Fit to media, playlists, saved records.
- `renderer/ui/`: the page, one file per area. `core.js` holds the shared state (`MW.app`, called `A`); the other files add their functions to it: `tiles.js`, `inspector.js`, `media.js`, `playlists.js`, `presets.js`, `controls.js`, and `boot.js` last.
