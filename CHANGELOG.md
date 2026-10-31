# Changelog

## 1.6.0: Previews and a smoother wall

Download **Wallpane Setup 1.6.0.exe** (installer) or **Wallpane 1.6.0.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

Big walls play more smoothly, the library and the timeline show what is in a video before you play it, and videos sound alike and start where the picture does. Everything is made from your own files, on your computer, and kept in Wallpane's cache.

Smoother with many tiles:
- **Smooth on a slower screen:** Windows paces every window by the main display, so beside a faster main display (say 1440p at 165 Hz) a wall on a 60 Hz screen juddered. Wallpane now draws at the slowest screen's rate when your screens differ, from the next start after it notices (it tells you once). Settings › Wall mode › Drawing pace can keep the main display's pace, or use 60 frames a second.
- **Lighter copies for small tiles:** a large video (1440p, 4K) on a small tile now plays from a lighter copy (at most 960 pixels and 30 frames a second), made once in the background and kept in the cache. It carries on from the same moment, playing or paused as it was; a tile made large, or shown full screen, plays the original again. On a test wall of 30 1080p videos the copies played every frame with fewer dropped and less processor time. Settings › General can turn them off.
- **The faster graphics card:** on a PC with two (the processor's own and an NVIDIA or AMD card), Wallpane now asks Windows for the faster one. Settings › About shows which one plays the wall, and whether it decodes the videos.
- **Less work while playing:** a tile's controls are only kept up to date while you can see them, and only videos with a looped part are followed frame by frame.
- **Background work** keeps only the last 100 finished jobs in its list, and a lighter copy no longer needed (a playlist moved on) is dropped before it starts.

In the library:
- **Hover previews:** rest the pointer on a video's thumbnail and it plays a few seconds from across the video, small and silent (made the first time, in about half a second, and kept in the cache); a GIF's thumbnail plays the GIF. Settings › Library can turn them off.
- **Every file gets its thumbnail:** a file whose details were read while thumbnails were being made no longer waits for a restart, or for you to scroll to it.

On the wall:
- **Skip black openings:** a video that opens on a black picture starts after it, also each time it loops; a heard one also skips an opening silence. Each video's first seconds are looked at once, in the background. Settings › General can turn it off.
- **Even loudness:** each video's loudness is measured once, from its sound alone, and a loud one plays quieter, so a loud clip and a quiet one sound alike when you turn their sound on. Quiet videos keep their own level, and each tile's volume still applies. Settings › General can turn it off.
- **Timeline previews:** with the pointer over a video tile's timeline, the frame there and its time show above it. The small frames are made the first time (from the video's key frames, so even a film takes seconds) and kept in the cache.
- **Adding to a full wall:** Settings › General › When the wall is full can now take the media anyway. Each new file gets a tile shaped like it, and Fill the wall arranges every tile again with the new ones last (up to 64 tiles). This works for the library, Add and drops; one Ctrl+Z undoes it. The default still just says the wall is full.

## 1.5.0: The library

Download **Wallpane Setup 1.5.0.exe** (installer) or **Wallpane 1.5.0.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

Wallpane now keeps a library of your own videos, GIFs and pictures, so you can find what you want and put it on the wall in a moment. Nothing leaves your computer, and your files are only ever read.

- **Library folders** (Settings › Library): add the folders where you keep your media. Wallpane looks through them and their subfolders, notices new files by itself, and reads each file's details in the background (size, shape, length, whether it plays as it is). A folder on a drive that is not connected keeps its files until the drive is back. Then it makes a thumbnail of every file: a typical frame of each video (not a black one), a small copy of each picture, upright as it should be.
- **The library drawer** (Library in the bar, Ctrl+L): every file as a thumbnail in its own shape, in even rows, fast with tens of thousands of files; search, Videos / GIFs / Pictures, filters by shape, length and resolution, one folder at a time, and sorting. Drag thumbnails or a folder onto the wall or a tile (Shift: a tile plays several in turn), or double-click one to put it on the selected tile. Drop folders on it to add them.
- **Where it shows:** a drawer over the wall, a panel beside it (left or right), or a window of its own for a second screen, whose files drag onto any wall window. Choose in its header or in Settings › Library.
- **Collections:** your own lists of library files. Add files from the right-click menu or by dragging them onto a collection; change the order by dragging; take files out with Delete. A collection dropped on a tile plays there and follows the collection as it changes.

And on the wall:
- **A folder bigger than a Free wall** now plays in turn on the tiles it fills, as on the grid, so those tiles have Next (before, the files that did not fit were left out).
- **Previous** on a playlist tile (its ‹ button, right-click, or Properties) goes back through the files it showed.
- **Files shaped like the tile:** after Fill the wall or Fit to media, a playlist tile moves on to a file shaped like it, so a tall tile keeps showing tall files. Each playlist has it under Shapes; Settings › General can leave playlists be.
- **Growing a tile in Free (pixels)** first takes the empty space up to the next tile; only then do the tiles beside it shrink.
- **Minimized, the wall rests:** videos pause and playlists wait until the window is back (Settings › General; background music keeps playing).
- **A fresh start:** Wallpane starts with an empty wall and offers your last one (Restore it, or Start empty; starting empty keeps it in Saved walls as "Last wall"). Settings › General can open the last wall straight away instead. A wall that starts in wall mode still opens as it was.
- **New wall window** is a button in the top bar now, beside Wall mode.

## 1.4.0: Play anything

Download **Wallpane Setup 1.4.0.exe** (installer) or **Wallpane 1.4.0.exe** (portable). Both are larger than before (about 178 and 162 MB) because FFmpeg now comes inside. Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

- **FFmpeg inside:** Wallpane now comes with FFmpeg 9.0.2 (GPL; Settings › About links to its source). It only ever works on your own files, offline.
- **Make playable:** AVI, WMV, FLV, MPEG, VOB, 3GP and DivX videos, and MKV or MP4 files with AC3 or DTS sound, now play. Wallpane makes a playable copy the quickest way that works (re-wrapped in seconds, only the sound converted, or converted on the graphics card), the tile shows its progress and switches over by itself. Your files are never changed. Right-click › Make playable for a video that plays badly.
- **GIFs as videos:** big GIFs (over 2 MB unless chosen otherwise) get a small video copy and play far more smoothly, still silent and looping.
- **Background work** shows in the bar while it runs, with a list where each job can be stopped.
- **Settings › Storage:** how much the cache holds, a size limit, Show folder and Clear.
- **Sponsor on GitHub:** Settings › About has a link to Wallpane's GitHub Sponsors page. The app stays free either way.

## 1.3.0

Download **Wallpane Setup 1.3.0.exe** (installer) or **Wallpane 1.3.0.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

- **Background music:** the ♪ button plays a folder of your own music behind the wall (MP3, M4A, AAC, WAV, OGG, Opus, FLAC), with previous, next, volume and shuffle. It keeps playing in wall mode, pauses with the emergency hide, and starts again on the next start.
- **On a TV or projector:** Settings › Wall mode › Connect a wireless display… opens Windows' Cast settings; a connected display appears under Show on straight away.
- **Arrange › Fill the wall:** every tile keeps its media's shape, and together they fill the wall edge to edge in rows or columns.
- **Full screen with sound:** double-clicking a tile shows it full screen with its sound on while the others go quiet (Settings › General). A tile playing a folder keeps moving on in full screen.
- **Free (pixels):** new tiles take their media's shape; dragged-into tiles no longer jump over to the other side (drop on one to swap); growing a tile makes the tiles beside it shrink evenly (Settings › General has the old way).
- **Playlists** can play only videos, GIFs or images, any mix.
- **Empty tiles** have File… and Folder… buttons.
- **Clock, stopwatch and timer:** an "In the bar" box for each decides what the bar shows; a stopwatch or timer in the bar has its own start/pause button, and unticking it resets it.
- **Counter:** a simple tally next to them (−, +, Reset), kept for next time; in the bar, + adds one and a right-click takes one away; unticking resets it.
- **The speaker** in the top bar shows whether the sound is on, like the speaker on each video.

## 1.2.0 — first public release

Wallpane is a video wall for Windows: your own videos, images and GIFs, many at once, on a grid or placed freely by the pixel, on one screen or several. It plays local files only and never goes online. Formerly called Media Wall; your saved walls and settings come over on the first start.

### Download
- **Wallpane Setup 1.2.0.exe**: installer (per user, no admin rights needed, choose the folder).
- **Wallpane 1.2.0.exe**: portable, runs without installing.

Windows 10 or 11, 64-bit. The files are not code-signed yet, so Windows SmartScreen may say "Windows protected your PC": click **More info**, then **Run anyway**.

### What's in it
- **Walls:** drop files and folders from Explorer; Snap to grid or Free (pixels) placement; drag to move and resize by any edge, with tiles making room; rows and columns with a different number of tiles in each; frame layouts; Fit to media; empty tiles; undo and redo.
- **Tiles:** zoom and reposition the media inside a tile; Properties with exact position and size; a right-click menu for everything; split, duplicate, replace, locate missing files.
- **Video controls:** a control bar on every video tile (play, timeline, sound, volume, speed), loop just a part of a video, and keys: Space/K, J/L, [ ] \, < >, M.
- **Playlists:** a folder plays on the wall or in one tile, in order or shuffled, with crossfades, image times, max clip length, and zoom kept across files if you like; new files in the folder join by themselves.
- **Emergency hide:** one key (Ctrl+Shift+H, or F9, Scroll Lock, a media key or a mouse button) from any program mutes every wall window at once, pauses the videos and shows a spreadsheet, a black screen or a picture, or makes the windows go away. The same again brings everything back.
- **Clock, stopwatch and timer** in the top bar.
- **Unattended walls:** wall mode on any display, start with Windows straight into wall mode, keep the display awake, several wall windows (one per monitor).
- **Saved walls:** save, load, export and import; files stay where they are.
- **Settings** in one panel: General, Wall mode, Emergency hide, Keys, About.

Free software under the GNU GPL, version 3 or later.
