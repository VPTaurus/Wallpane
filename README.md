# Media Wall (Windows desktop app)

A grid wall for videos, images and GIFs. Drop files or folders from Explorer, drag borders to resize tiles, save wall presets (they link to your files, nothing is copied) and layouts.

## Run it
1. Install Node.js 20+ (https://nodejs.org).
2. In this folder: `npm install`
3. `npm start` (or `npm run dev` for developer tools, F12).

## Build a Windows app
`npm run dist` creates an installer and a portable .exe in `dist/`.
(Building on Windows is simplest.)

## Data
Presets, layouts, settings and your last wall are JSON files in `%APPDATA%\Media Wall`. Presets > Show file opens the folder. Presets > Export/Import moves them between PCs.

## Keys
- F11 wall mode on or off, Esc leaves wall mode / fullscreen
- Arrows move the selected tile, Shift+arrows resize
- Ctrl+Z / Ctrl+Y undo / redo
- Double-click a tile for single-tile fullscreen

## Notes
- Formats depend on Chromium's codecs; a file that can't play shows a message on its tile.
- "Wall display" picks which monitor Wall mode fills.
- Playlist: choose a folder (Playlist > Choose folder, or Add folder > As a playlist) and it fills the empty cells, one file per tile; rows or columns you add later fill too. Drop a folder on a tile to give just that tile the folder. Options: order, image seconds, GIFs, crossfade, random video start, max clip length. New files added to the folder join the queue (checked every 15 s). Pin a tile to keep it.
- Streaming is not included yet.
- Fit to media: resizes and rearranges tiles so each media fills its tile with as few bars as possible (undoable).
- Layout: Grid or Free. Free layout lets you place and size every tile by the pixel (snapping to edges, Alt turns it off; arrow keys move 1 px); tiles in the way slide aside.
- New window: opens another wall (for a second monitor); each window has its own wall and settings, presets and layouts are shared; windows reopen on the next start.
