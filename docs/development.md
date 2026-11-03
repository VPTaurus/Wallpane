# Developing Wallpane

How to run Wallpane from source, test it, build it and release it, and where things are in the code. What the app
does is in the [guide](guide.md); where it is going is in the [roadmap](../ROADMAP.md).

## Run it
1. Install Node.js 22 or newer (https://nodejs.org, or `winget install OpenJS.NodeJS.LTS`).
2. In this folder: `npm install`
3. `npm run fetch-ffmpeg` once: it downloads the pinned FFmpeg build (about 95 MB, checked against its SHA-256) and keeps what Wallpane uses in `vendor/ffmpeg`, which is not in git. Wallpane runs without it, but then it cannot convert or read media files with FFmpeg.
4. `npm start` (or `npm run dev` for developer tools, F12). It first builds the emergency hide's small mouse helper into `vendor/mousehook` with the C# compiler that comes with Windows (`npm run build-mousehook`; nothing is downloaded).

`WALLPANE_USER_DATA` points Wallpane at another data folder (the tests use it); by default it is `%APPDATA%\Wallpane`.

## Tests
- `npm run lint`: ESLint
- `npm test`: unit tests (Node's built-in test runner), for the logic in `renderer/lib` and `lib`, plus checks that the page, preload and main process are wired together
- `npm run test:e2e`: starts the real app with Playwright and goes through the main features (test data in a temporary folder). `WALLPANE_EXE=dist\win-unpacked\Wallpane.exe` runs them against the built app.
- `npm run check`: all three

GitHub Actions runs all three on every push to `main` or `Dev` and on every pull request. Running the workflow by hand, or publishing a release (see below), also builds the .exe files.

## Screenshots
`npm run screenshots` remakes the pictures in `docs/images` (used by the README and the landing page): it starts Wallpane on a fresh data folder in its dark look, sets up a few walls and photographs them, and makes `wall.mp4` with Wallpane's own Record. It takes about five minutes and needs FFmpeg and the demo media: free Pexels clips and photos in `demo-media/`, which is not in git (their licence does not allow passing the files on; `docs/images/CREDITS.md` and ROADMAP G1 say which they are). `DEMO_MEDIA` points it at another folder with the same file names.

## The landing page
`docs/index.html` is Wallpane's web page, served by GitHub Pages from the `docs` folder of `main` (Settings › Pages › Deploy from a branch: `main`, `/docs`), at https://vptaurus.github.io/Wallpane/. One static file with its CSS inside, the app's fonts in `docs/fonts` and the pictures from `docs/images`; no scripts from elsewhere, no trackers. `docs/.nojekyll` makes Pages serve the folder as it is. Its download buttons fetch `releases/latest/download/Wallpane-Setup.exe` and `Wallpane-Portable.exe`, which the release workflow attaches next to the versioned files. To look at it, open `docs/index.html` in a browser.

## Build a Windows app
`npm run dist` creates an installer and a portable .exe in `dist/`, with FFmpeg inside (it fetches FFmpeg first if `vendor/ffmpeg` is missing). Building on Windows is simplest.

### Releases
1. Raise `version` in `package.json` (`npm version 1.6.8 --no-git-tag-version` also updates `package-lock.json`) and add the changes to `CHANGELOG.md`. Merge into `main`.
2. On GitHub: Releases › Draft a new release › tag `v1.6.8` (the same version) on `main`, paste the changelog section, Publish.
3. The CI workflow builds both .exe files, tests the built app and attaches the files to the release within a few minutes. It stops if the tag and the version don't match.

A release whose build fails can be built again by re-running the failed job. To include a fix made after the tag, delete the release and the tag on GitHub, then draft the release again on the new `main`.

### FFmpeg inside Wallpane
Wallpane ships FFmpeg 9.0.2, the shared Windows build from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (`ffmpeg.exe`, `ffprobe.exe` and their libraries), under the GPL version 3. It is pinned in `scripts/fetch-ffmpeg.js` by URL and SHA-256 and lands in `resources/ffmpeg` of the installed app, next to its licence (`LICENSE.txt`) and the build's `README.txt`, which names the exact FFmpeg source ([commit 946fcce07b](https://github.com/FFmpeg/FFmpeg/commit/946fcce07b)) and the libraries in it. Settings › About shows the version and links to that source. Wallpane only ever gives FFmpeg local files; it never goes online. To move to a newer build, change the version, URL, SHA-256 and source in that script.

### Code signing
Unsigned builds work, but Windows SmartScreen warns on other PCs ("Windows protected your PC"). To sign, get a code-signing certificate (.pfx) and set two environment variables before `npm run dist`; electron-builder picks them up:
- `CSC_LINK`: path to the .pfx file (or its base64 text)
- `CSC_KEY_PASSWORD`: its password

The GitHub workflow does the same with repository secrets of the same names.

## Code map
- `main.js`: windows, dialogs, file access, wall-mode wake lock, start with Windows, the emergency hide key and mouse button. Every call from the page goes through `handle()`, which only accepts our own wall windows.
- `preload.js`: the small API the page gets (`window.wall`).
- `lib/`: main-process helpers: scanning folders, GIF lengths, safe JSON saves (`files.js`), watching playlist folders (`watch.js`), running FFmpeg (`ffmpeg.js`), what a file holds and what it needs (`mediainfo.js`), making a playable copy, a GIF's video copy and a lighter copy (`playable.js`), a GIF of a looped part (`makegif.js`), the looped part copied into an MP4 (`cutpart.js`), a frame saved as a picture (`snapshot.js`), the wall saved as a video (`wallexport.js`), a live recording written as it comes (`recfile.js`), the emergency hide's mouse button in every program (`mousehook.js`, running the helper built from `tools/mousehook/MouseHook.cs`), the background job queue (`jobs.js`), the cache (`cache.js`) and the library: its folders, files, search and filters, kept in `library.json` (`library.js`, designed in [library-design.md](library-design.md)), kept in step with the folders on disk (`libraryfolders.js`), with picture sizes read from the files' first bytes (`imagesize.js`) and thumbnails and hover previews in the cache (`thumbs.js`, `previews.js`); a video tile's timeline pictures (`strips.js`); each video's loudness and black or silent opening, measured once (`loudness.js`, `openings.js`, on `measures.js`); the drawing pace for screens of different rates (`pace.js`); what a resting pointer asks for, made one at a time, the latest first (`latest.js`).
- `scripts/`: the pinned FFmpeg build, fetched into `vendor/ffmpeg` (`fetch-ffmpeg.js`); the mouse helper, built into `vendor/mousehook` (`build-mousehook.js`); the pictures in `docs/images` (`screenshots.js`).
- `renderer/lib/`: plain logic with no DOM, also loaded by the tests: formats, grid and free-layout geometry (pushing and squeezing included), playlists, saved records, the pan and zoom maths and what a tile shows of its media (`view.js`), Make a GIF's choices, sizes and FFmpeg arguments (`gifmake.js`, also used by the main process), Save the wall as a video's and Record's choices and the check of what the page asks for (`wallvideo.js`, likewise), video playback times (`playback.js`), shortcut keys (`hotkey.js`, also used by the main process), the stopwatch and timer (`clock.js`) and Fill the wall (`collage.js`), the library's thumbnails in even rows (`justify.js`), and the icons (`icons.js`).
- `renderer/ui/`: the page, one file per area. `core.js` holds the shared state (`MW.app`, called `A`); the other files add their functions to it: `tiles.js`, `inspector.js`, `media.js`, `playlists.js`, `presets.js`, `controls.js`, `menus.js` (right-click menus), `builder.js` (rows and columns), `hide.js` (emergency hide), `clock.js` (the time in the bar), `music.js` (background music), `playable.js` (tiles waiting for a playable copy, GIFs as videos, small tiles on lighter copies), `jobs.js` (background work in the bar, Settings › Storage), `gif.js` (Make a GIF, the part as MP4, Save this frame), `wallvideo.js` (Save the wall as a video, Screenshot), `recorder.js` (Record and Settings › Recording), `library.js` (the library in the wall page, Settings › Library), `libview.js` (the library's browsing view, also used by the library window), and `boot.js` last.
- `renderer/library.html` with `renderer/libwin/`: the library window, the same view on its own.
- `tools/mousehook/`: the C# source of the emergency hide's mouse helper.
- `test/unit/` and `test/e2e/`: the tests.
