# Wallpane guide

Everything Wallpane does, in detail. For a first look, see the [README](../README.md).

- [The window](#the-window)
- [Tiles](#tiles)
- [Arranging the wall](#arranging-the-wall)
- [Playlists](#playlists)
- [Pictures and videos of the wall](#pictures-and-videos-of-the-wall)
- [Sound and picture](#sound-and-picture)
- [Formats](#formats)
- [Library](#library)
- [Wall mode and unattended walls](#wall-mode-and-unattended-walls)
- [On a TV or projector](#on-a-tv-or-projector)
- [Background music](#background-music)
- [Emergency hide](#emergency-hide)
- [Keys](#keys)
- [Your data](#your-data)

## The window
- Top bar, in groups, left to right:
  - **The wall's contents:** **Add** (files, a folder as tiles, or a folder as a playlist; when a folder has more files than the wall has room for, on the grid or in Free (pixels), the new tiles play all of them in turn); **Clear** (the red bin: takes every tile off; the first click arms it for three seconds, Ctrl+Z brings the tiles back); undo and redo.
  - **Its layout:** columns, rows, gap and cell shape (the "4 × 3" button; placed freely, only the gap changes and the wall keeps the shape the grid gave it), **Snap to grid / Free (pixels)**, and **Arrange**: **Fill the wall** (every tile in its media's shape, edge to edge) and **Layouts…** (ready-made layouts, rows and columns, and your own saved ones). Each says when it switches the wall to Free or back.
  - **Playback:** play, mute and repeat for every video, and **background music** (♪).
  - **The wall as a picture or a video:** **Screenshot** (the camera) and **Record**.
  - On the right: the **clock** (and background work while it runs); **what the wall plays**: the **Library** (Ctrl+L), **Saved walls** and **Playlist**; and **the app**: **?** (getting started), **Settings** (the cog), **New wall window** (the window icon) and **Wall mode**.

  In a narrow window the bar shows some buttons as icons only and shortens the mode names to Grid / Free.
- **At the start** the wall is empty and offers your last wall: Restore it, or Start empty. Until you choose (or put something on the empty wall) the last wall is kept as it was; starting empty keeps it in Saved walls as "Last wall". Settings › General › When Wallpane starts can open the last wall straight away or always start empty instead. A wall that starts in wall mode always opens the last wall. The last wall's videos carry on where they were (a folder's tile on the file it was on, from where it was), unless that was in their last second or outside their looped part. Where each video is gets saved as Wallpane closes, and every 20 seconds while videos play, so after a crash or a power cut they carry on near where they were. Saved walls you name start their videos as usual.
- **Saved walls** keep the grid, each tile's place and settings, and where each file is; the files stay where they are, nothing is copied. A file that has moved shows "File not found" on its tile, and you can locate it. Export and Import move saved walls between PCs.
- **New wall window** opens another wall, for a second monitor. Each window has its own wall and settings; saved walls and frame layouts are shared; windows reopen on the next start.
- The **clock** opens a **stopwatch** (with laps) and a **countdown timer** (type minutes like 5, or 1:30, or pick 1 to 60 minutes). Each has an **In the bar** box, which alone decides what the bar shows: a ticked stopwatch or timer is a chip with a start/pause button (a finished timer's button resets it); unticking it takes it off the bar and resets it. Without the clock ticked, a small clock icon stays to open the popover. Both keep running when the popover is closed and in wall mode. At zero the timer beeps three times and its chip flashes until you reset it. A **counter** counts anything you like (−, + and Reset; kept for next time); in the bar its + adds one and a right-click on it takes one away, and unticking it resets it to 0. The clock follows Windows' 12 or 24-hour format unless you choose one (Settings › General, or the 24-hour box in the clock).
- **Settings** opens a panel with its sections down the side (arrow keys move between them). Each setting has a short name; the **?** beside it explains it while the pointer rests on it (or it has keyboard focus).
  - **General**: start with Windows, what the start brings, the clock's format.
  - **Tiles**: how tiles give way when one grows, what a full wall does, how media fits new tiles, playlists matching tile shapes.
  - **Video**: full-screen sound, even loudness, skipping black openings, pausing when minimized, making videos playable, GIFs as videos, lighter copies, the drawing pace.
  - **Recording**: size, frames a second, quality, sound and folder for Record.
  - **Wall mode**: which display, start in wall mode, keep the display awake, a TV or projector.
  - **Emergency hide**: the key, a mouse button, and what the windows show.
  - **Library**: its folders, where it shows, hover previews.
  - **Storage**: the cache and its limit.
  - **Keys**: every keyboard shortcut.
  - **About**: version, licence, source code, and the folder your data is in.

  Help (**?**) has buttons that open Keys and About.
- The wall has the whole window. The selected tile has an orange ring with round grips at its corners; drag a grip or any edge to resize. A pinned playlist tile shows a pin badge.
- Right-click a tile: what you use most is at the top (a video's sound, Repeat and Loop a part; a playlist's Previous, Next, Stay on this file and Playlist settings), the rest in groups that open beside the menu: **Library** (when its file is in the library), **Display** (reposition and zoom, reset, fill or whole frame, fit tile to media), **File** (replace, play a folder, Show in Explorer, make playable, save this frame) and **Tile** (duplicate, split in two). Then Properties and Remove. Arrow keys move through it (right opens a group, left closes it). Right-click empty wall to add media or a folder right there, or to make a new empty tile.
- **Properties** (right-click a tile, or Alt+Enter) opens a card next to the tile with its exact position and size (cells, or pixels in Free mode), how the media fits and its zoom, playback, playlist, library and file actions. Each part folds away under its heading, and stays folded for every tile until you open it again; Position and size starts folded. Esc or × closes the card; selecting another tile moves it there.

## Tiles
- **Empty tiles** are frames without media: size and place them first, then drop media or a folder on them, click File… or Folder… (the tile then plays the folder's files in turn), or add a folder as a playlist (playlists fill empty tiles first, also in Free layout). On the grid they give way: when a tile grows or moves and there is no other room, it takes their cells and they go (before any tile is shrunk). In Free (pixels) they are pushed and squeezed like other tiles, and look like an empty cell on the grid: only the faint +. Click one to choose its media; its right-click menu also offers a folder.
- **A video tile** has a control bar along its bottom (it shows when the pointer is over the tile): play, time, a timeline you can drag, sound, volume and speed. A big tile (wider than about 480 px), or one full screen, also has 10 s back and 10 s on (J and L skip 5 s). With the pointer over the timeline, the time there shows above it, and the frame there too: a strip of small frames from across the video (about one a second, at most 100, read from its key frames, so a film takes seconds) is made the first time and kept in the cache.
- **Loop a part:** Properties › Playback holds the same controls, plus Loop a part: type a start and end time (like 1:23.5) or play to a spot and press Now, and the video repeats just that part; the timeline shows it. Volume, speed and the looped part are saved with the wall.
- **Moving and zooming the media:** scroll the wheel over the selected tile to zoom (up to 8×) around the pointer; Reposition and zoom (right-click menu or Properties) lets you drag the media inside the tile. Reset puts it back. Each tile remembers this in saved walls. Settings › Tiles › New tiles: whether media fills a new tile (a little may be cropped) or shows whole; each tile's fit button changes just that tile.
- **Full screen:** double-click a tile for that tile alone, full screen (Esc or another double-click ends it). It plays that tile's sound and the others go quiet until it ends (Settings › Video can turn that off). A tile playing a folder keeps moving on to its next files in full screen.
- **A full wall:** media added with no room left (from the library, Add, or a drop) is left out with a message, by default. Settings › Tiles › When the wall is full › Add and refill gives each new file a tile shaped like it instead, and Fill the wall then arranges every tile again with the new ones last (switching to Free (pixels) on the grid). Up to 64 tiles, at most 24 new ones at a time; more files play in turn on the new tiles. One Ctrl+Z undoes it.
- **Clear** (the red bin in the top bar, beside Add) takes two clicks; Ctrl+Z brings the wall back.

## Arranging the wall
- **Snap to grid, or Free (pixels).** Free lets you place and size every tile by the pixel: edges snap to other tiles and the wall (Alt turns that off), Shift while resizing keeps the tile's shape, arrow keys move 1 px (Ctrl: 10) and Properties takes exact pixel values. Switching keeps every tile where it is.
  - Moving: the tile follows the pointer and the others make room, each only further to its own side, never jumping over the tile you drag. Where they cannot, they stay, and dropping on one swaps the two; anywhere else the tile goes back.
  - Resizing: the edge you drag first takes the free space up to the next tile; then the tiles beside it slide into any free space beyond them, and then all of them shrink evenly. Settings › Tiles › Growing a tile can switch to the older way: they are pushed and only the one at the wall shrinks.
  - Media added in Free (pixels) gets a tile with the media's exact shape as soon as it has loaded.
- **Fill the wall** (Arrange) arranges every tile in rows (or columns) so each keeps its media's exact shape and together they fill the wall edge to edge, like a photo collage. Only tiles with media take part: empty tiles (and the sample cards) make way, and a tile whose file was not found stays. Tiles keep their reading order unless regrouping them crops clearly less; whatever small difference is left is shared by all tiles (the message says how much). On the grid it switches to Free (pixels) first; Ctrl+Z undoes it.
- **Fit tile to media** (a tile's right-click menu › Display, or Properties) gives one tile its media's shape, shrinking it inside its place (switching to Free if needed). Undoable.
- **Layouts…** (Arrange) moves your tiles into a layout's frames in reading order; frames left over become empty tiles, so the layout keeps its shape. Ready-made ones (Quad, Hero left, Two big, Mosaic, …) and your own (Save current names the wall's frames on the grid) put the tiles on the grid, also from Free.
- **Rows and columns** (Layouts) builds the wall from rows (or columns) with their own number of tiles, for example 3 in the first row and 4 in the second. When the rows share a grid of up to 12 cells (3 and 4 do: 12) the wall stays on the grid; otherwise it switches to Free (pixels). Tiles move into the new frames in reading order and leftover frames become empty tiles.

## Playlists
- **Starting one:** choose a folder (Playlist › Choose folder, or Add › Folder as a playlist) and it fills the empty cells, one file per tile; rows or columns you add later fill too. Drop a folder on a tile to give just that tile the folder. Dropping a folder on empty space: on the grid it plays as a playlist; in Free layout each file gets its own tile.
- **Options** (the Playlist button in the top bar holds them for new playlists): order, image seconds, GIFs, crossfade, random video start, clip length, and Plays: videos, GIFs and images, any mix. New files in the folder join the queue as they appear (the app watches the folder, and also rescans every two minutes for network drives). A folder is read up to 3,000 files.
- **Playlist settings** of a tile that plays a folder (right-click, or the Playlist part of Properties): the folder and its number of files, rotating or pinned, order, image seconds, GIFs, where videos start, crossfade, clip length (the whole clip, or 10 s to 5 min of each video), Zoom and position (new for each file, or kept for every file: images, GIFs and videos alike), Shapes (any shape, or shaped like the tile first: of its next files, a tile takes one close to its own shape), plus Previous file, Next file, Change folder and Stop the playlist on this tile (it keeps the file it shows). Tiles showing a kind you untick move on at once. Changes apply at once and can be undone; when several tiles play the same folder, they all follow.
- **Previous** goes back through the files the tile showed (the tile's ‹ button too), without changing the playlist's order.
- **Stay on this file** (a playlist tile's pin button) keeps it on the file it shows, repeating, until you let it carry on; a tile with a single video has Repeat instead (on, or play it once), and pictures and GIFs have neither.
- Fill the wall switches Shapes on for the playlists on the wall (Settings › Tiles › Playlists match tile shapes can leave them be).

## Pictures and videos of the wall
- **Screenshot** (the camera button in the top bar): the wall as it shows now, as a picture at the screen's own resolution, saved where you choose (Pictures by default; PNG, or JPEG for a name ending in .jpg). Only the media is in it: the selection, the tiles' controls, empty cells and anything over the wall (the library drawer, a popover, a message) are left out. It needs no FFmpeg.
- **Record** (the button beside Screenshot): click it to start recording the wall as it plays, and again to stop; while it records it is red and shows the time. The video (MP4, H.264 and AAC) is saved at once in the folder Settings › Recording chose (Videos by default), with a message to show it in Explorer. It holds only the media, each tile in its place as it shows it (no selection, controls or pointer), and everything that happens while it records: tiles moved, playlists moving on, files changed. The sound is what you hear from the wall: each tile whose sound is on, at its volume, and the music; other programs are not recorded. Settings › Recording sets the size (as on screen, or 720p to 4K in the wall's shape), 30 or 60 frames a second, the quality (Standard, High, Best: about 28, 56 or 112 MB a minute at 1080p and 30 frames), whether to record the sound, and the folder. In wall mode, right-click › Stop recording. A window closed while recording keeps what it recorded.
- **Save the wall as a video** (Saved walls › Save as a video…): a video of the wall of a length you choose, made in the background rather than recorded as it plays: the whole wall as one MP4, every tile in its place. Choose the size (720p, 1080p, 1440p or 4K on its short side, in the wall's shape) and the length (10 s to 10 minutes); the dialog says what it will hold. The wall goes on in the video as it would on screen, from the moment you save: each tile from where it is, with its looped part, Repeat, speed, zoom and position; a tile playing a folder moves on through its files with the playlist's order and timing (tiles sharing one take turns); the sound of the tiles you hear, at their volume, and the background music if it plays. It is made offline with FFmpeg as a job in the bar (each tile's part at its size first, then the wall), saved in Videos by default. Not quite as on screen: a playlist's crossfade is a cut, a GIF starts from its first frame, and a paused video plays.
- **Save the wall as a GIF** (Saved walls › Save as a GIF…, or in wall mode right-click › Make a GIF of the wall…): the same, made as a GIF that plays forever, without sound. Choose its width (320 to 800 px, the height in the wall's shape), length (3 to 30 s) and frames a second (10 to 25); the dialog says about how big it gets. Saved in Pictures by default.
- **Save this frame** (a video tile's right-click menu › File, or Properties › File): the frame the tile shows now, as a picture, straight to where to save it (named like `clip 1m23.5s.png`; a name ending in .jpg gives a JPEG). It is the whole frame at the video's own size, read from the original file, also when the tile is zoomed or plays a lighter copy, and also on a tile playing a folder.
- **Make a GIF** of a looped part (Properties › Playback, or the tile's right-click menu, once a part is looped). Choose:
  - **Width:** 320, 480, 640 or 800 px, never wider than the video.
  - **Frames a second:** 10, 15, 20 or 25.
  - **Shows:** the whole frame, or what the tile shows (its shape, zoom and position).
  - **Speed:** normal, or the tile's own speed when it plays faster or slower.

  The dialog shows the GIF's size and roughly how big the file will be, and a part longer than a minute is refused. Save asks where to put the GIF (next to the video by default, named like `clip 1m23.5s-1m30s.gif`), and FFmpeg makes it as a job in the bar, which you can stop. Then **Show in Explorer** or **Put on the wall**. The video itself is never changed, and a stopped GIF leaves no file behind. A GIF saved in a library folder shows up in the library by itself.
- **Save the part as MP4** (beside Make a GIF: **Save as MP4…** in Properties, **Save the part as MP4…** in the tile's menu): no dialog, straight to where to save it (named like `clip 1m23.5s-1m30s.mp4`). A copy without re-encoding takes a moment and loses nothing, but can only start on a keyframe, and many videos have one only every few seconds. So when the last keyframe before the part is within half a second of it, the picture and sound are copied (starting on that keyframe; the message says how early); otherwise the part is re-encoded (H.264 and AAC, on the graphics card when it can) to start and end exactly on it. A copy of a video whose picture or sound cannot go into an MP4 without re-encoding (an older WebM's VP8 and Vorbis) is saved as its own kind of file instead.

## Sound and picture
- **Even loudness** (Settings › Video, on by default): each video on the wall has its loudness measured once (EBU R128, from its sound alone, so a film takes seconds; kept in `loudness.json` in the data folder), and one louder than -18 LUFS plays that much quieter, so a loud clip and a quiet one sound alike when unmuted. It only ever makes a video quieter, so a quiet one keeps its own level; the tile's own volume applies on top.
- **Skip black openings** (Settings › Video, on by default): each video's first 12 seconds are looked at once (kept in `openings.json`), and one that opens on a black picture starts after it, also each time it loops; while you hear it, after an opening silence too. Not for a playlist that starts at random or a tile with a looped part, and not when the black lasts the whole 12 seconds or over a third of the video.
- **Minimized,** a window's wall rests: videos pause and playlists stop moving on, and they carry on when it is back (Settings › Video › Pause when minimized; background music keeps playing).

## Formats
Playback uses Chromium's built-in codecs, so these work: MP4 (H.264, and HEVC where Windows has the decoder), WebM, MOV, M4V, MKV and OGV video; JPEG, PNG, GIF, WebP, AVIF, BMP and SVG images.

**Make playable.** Other videos play too: AVI, WMV, FLV, MPEG, MPEG-TS, VOB, 3GP, RealMedia and DivX, and MKV or MP4 files whose sound Chromium cannot play (AC3, DTS, E-AC3) or whose picture it cannot (10-bit H.264, HEVC where Windows lacks it, MPEG-2, …). The bundled FFmpeg first reads what the file holds, then makes a playable copy the cheapest way that works: re-wrapped into MP4 in seconds when only the container is the problem, only the sound converted when only the sound is, or converted to H.264 (on the graphics card when it can: NVIDIA, Intel or AMD, else on the processor). The tile shows what it is doing and switches to the copy by itself; a playlist tile moves on meanwhile and plays the file once its copy is there. Copies go to the cache (Settings › Storage); your files are never changed, and saved walls keep pointing at them. A video that still fails to play is converted after all, and right-click › Make playable does that by hand. Settings › Video can switch the automatic copies off. The bar shows a small indicator while this runs, with a list where each job can be stopped.

**GIFs as videos.** A big GIF (by default over 2 MB; Settings › Video: off, 2 MB, 10 MB or all GIFs) gets a small video copy in the background and then plays from it: far smoother and lighter, still silent and looping, and still a GIF everywhere else (playlists time it as a GIF). Transparent parts turn black, as they look on a tile anyway.

**Lighter copies for small tiles.** Decoding a 4K video for a tile a few hundred pixels wide costs the graphics card many times what the tile shows, and a wall of such tiles adds up. So a video of 1440 pixels or more (on its long side) on a tile of at most 960 screen pixels plays from a lighter copy: at most 960 pixels and 30 frames a second, with its sound, made once in the background (the original read on two processor threads, the graphics card encoding when it can) and kept in the cache (Settings › Storage). The tile switches to it from the same moment, playing or paused as it was, and back to the original when it grows past about 1100 pixels or plays full screen. A playlist tile asks for a copy of each big file it shows; one it has moved past is dropped before it starts. Settings › Video › Lighter copies for small tiles can turn this off.

**Which graphics card.** On a PC with two (the processor's own and an NVIDIA or AMD card) Wallpane asks Windows for the faster one. Settings › About shows the one that plays the wall and whether it decodes the videos; if it names the processor's graphics, choose High performance for Wallpane in Windows Settings › System › Display › Graphics.

HEIC, TIFF, PSD and camera RAW pictures cannot be shown. The app tells you when it finds them; convert them to JPEG or PNG.

## Library
Settings › Library holds the folders where you keep your videos, GIFs and pictures. Wallpane looks through each folder and its subfolders when you add it, on every start and whenever something in it changes, and reads every file's details in the background: the size and shape of its picture, how long it runs, and whether it plays as it is. A portrait phone photo or video counts as portrait. Then it makes a small thumbnail of each file (for a video, a typical frame, not a black one), kept in the cache (Settings › Storage). A folder on a drive that is not connected keeps its files in the library until the drive is back. Removing a folder only takes it out of the library; Wallpane never changes, moves or deletes your files.

**Library** in the bar (Ctrl+L) opens it as a drawer over the wall; the wall keeps playing behind it. Its header's panel button (or Settings › Library › Show the library as) makes it a panel beside the wall instead, which makes the wall narrower while it is open, or a window of its own, for a second screen. The drawer and the panel go on the right of the wall, beside the Library button, or on its left (the same menu, or Settings › Library › On the side; a side you pick stays). Files dragged from the library window are ordinary Windows file drags, so any wall window takes them; double-click or Enter there sends a file to the wall window used last. Closing the library window only hides it.
- **Finding files:** search by name (file and folder names and tags, every word, without accents or case), Videos / GIFs / Pictures, Filters (shape, length, resolution, rating, favourites only, files that need a playable copy), or one library folder (the folder row under the filters opens the list of them, however many there are). Sort by name, date added, date changed, length, file size, rating or at random (shuffle again with its button); the slider sets the thumbnail size, and the drawer's right edge its width.
- **Stars, hearts and tags:** give files 1 to 5 stars, a favourite heart and tags, one file or a whole selection at once: keys 1 to 5 (0 clears), F and T, or right-click › Favourite, Rating ›, Tags…. Thumbnails show the heart in their top corner and the stars along their foot.
  - **Tags…** lists the tags the selected files have (a dashed one only some of them have: click it to give it to all; × takes a tag off all), a field to type one (tags in use are offered as you type; Enter gives it to all), and the other tags in use, a click each. "Beach" and "beach" are one tag, written the way it was first typed.
  - **The folder row's list** has a Tags section: pick one to see its files. Right-click a tag to rename it (into a tag in use, the two become one) or delete it (it comes off its files, which stay).
  - **On the wall,** a tile whose file is in the library has a **Library** group in its right-click menu (its hint shows the stars, heart and tags; Favourite and the rating are in it) and a **Library** part in Properties: five stars to click (the same star again clears them), the heart, and the tags (× takes one off, the field gives one).
  - They live with the file in `library.json`, so a file changed, moved or renamed inside the library keeps them. That file is version 2: an older Wallpane opens it read-only, so it never drops them.
- **Onto the wall:** drag thumbnails onto the wall or onto a tile: it works as a drop from Explorer does. Once a drag leaves the drawer, the drawer fades, so a tile under it can take the drop too (drag out, then back over it). Hold Shift while dropping several on a tile to make that tile play them in turn. Drag a folder from the list to make a tile (or the empty tiles) play it.
- **A whole folder as a playlist:** right-click a folder in the folder row's list › Play on the wall as a playlist: all its files (its subfolders' too) fill the empty tiles and cells and keep rotating, as Add › Folder as a playlist… does. Play on the selected tile makes one tile play it instead. While one folder shows, the playlist button beside the folder row does the same as the first. In the library window, the folder plays on the wall window used last. On an empty wall it first makes tiles that cover the wall, one per file, at most as many as Arrange › Rows and columns has cells: a smaller folder gets fewer, bigger tiles (the grid set to them, the last tile wider when its row is short); in Free (pixels), the same tiles. Ctrl+Z gives the empty wall back.
- **Hover previews:** rest the pointer on a video's thumbnail and it plays a few seconds of the video: four short parts from across it (a short video: its start), small and silent. The first time, a thin bar runs along the thumbnail's foot while the clip is made (about half a second); it is kept in the cache (Settings › Storage, Previews). A GIF's thumbnail plays the GIF itself. Settings › Library can turn them off, for the library window too.
- **Without dragging:** double-click a thumbnail (or select and press Enter) to put it on the selected tile, or else into the empty tiles. Right-click for the same, for Show in Explorer, and for stars, the heart and tags.
- **Selecting:** click, Ctrl+click, Shift+click, and Ctrl+A for everything shown.
- **Collections** are your own lists of files, under Collections in the folder row's list.
  - **Filling one:** right-click files › Add to "…" or Add to a new collection, or drag them onto a collection in that list (held over the folder row, the list opens).
  - **In a collection:** sorted by Collection order, drag thumbnails to change the order, or right-click › Move to the start / end. Delete (or right-click › Take out) takes files out of it, never off the disk.
  - **Renaming and deleting:** right-click a collection in the list.
  - **On the wall:** drag a collection onto a tile and the tile plays it, following it as it changes (new files join, its order is kept). Dropped elsewhere, it fills the empty tiles and cells as a folder does. Or right-click it › Play on the wall as a playlist, or Play on the selected tile; while it shows, the playlist button beside the folder row plays it too (in the library window, on the wall window used last).
- **Adding folders:** drop folders from Explorer onto the drawer, or use its + button.

## Wall mode and unattended walls
- **Wall mode** (F11) hides the controls and fills the display picked under Settings › Wall mode › Show on. Esc or F11 leaves it, as does right-click › Exit wall mode, or the Exit wall mode button that slides down at the top centre when the pointer touches the top edge of the screen. With the bar hidden, the right-click menu also has the bar's Pause all / Play all and Mute all / Unmute all, takes a screenshot of the wall, makes a GIF of the wall, and starts or stops a recording; while it records, a small red dot blinks in the top-left corner (it is not in the video).
- Settings › Wall mode: start this window in wall mode; keep the display awake in wall mode (on by default).
- Settings › General: start Wallpane when you sign in to Windows (installed or portable app only). If you had this on for Media Wall, turn it on again here.

  Together these bring a wall back full screen after a restart.
- Settings › Video › **Drawing pace**: Windows (and Chromium, which draws Wallpane) paces every window by the main display, so beside a faster main display a wall on a slower screen (a 60 Hz one next to a 165 Hz main display) judders. **Automatic** (the default) draws at the slowest screen's rate when the screens differ, and as Windows does when they don't; **The main display's rate** keeps Windows' way; **60 frames a second** always. The pace is set as Wallpane starts: Automatic works it out from the screens and keeps it in `app.json`, so a new screen setup takes effect from the next start (Wallpane says so once, and Settings has a Restart button; the portable .exe is started again by hand).

## On a TV or projector
Settings › Wall mode › **Connect a wireless display…** opens Windows' display settings, where "Connect to a wireless display" (or Win+K) casts to a TV, projector or stick that supports Miracast. Choose **Extend** so it becomes a display of its own; Wallpane notices and lists it under Show on, and wall mode then fills it. Chromecast is not supported.

## Background music
The ♪ button in the top bar plays a folder of your own music behind the wall: MP3, M4A, AAC, WAV, OGG, Opus and FLAC, from the folder and the folders in it, one track after another, in name order or shuffled, with its own volume, previous and next. It keeps playing in wall mode, pauses with the emergency hide, and starts again on the next start if it was playing. Each wall window has its own. Videos on the wall keep their own sound settings, so mute them for music only.

## Emergency hide
Press **Ctrl+Shift+H** in any program and every wall window hides at once: the sound goes off (the window is muted, not just the videos), videos and playlists pause, and the windows show something else. Press it again and everything comes back as it was, the videos playing on. Starting Wallpane again also brings it back, in case the key slips your mind.

Settings › Emergency hide:
- **Key**: click it and press the new key: any one key alone, or with Ctrl, Alt, Shift or Win (not F11, the wall mode key, or Alt+F4). Other programs no longer get the key while Wallpane runs; for a key that types something, like a letter, Settings says that typing it anywhere hides the wall. If another program already holds the key, Settings says so, and it then works only while Wallpane is the active window.
- **Or one press**: pick F9, Scroll Lock, or your keyboard's Mute or Play/Pause key with a click. A media key then stops doing its usual job while Wallpane runs.
- **Mouse button**: click it, then press the mouse button to use: back or forward (the side buttons) or middle. Esc stops listening, Clear takes the button off. Like the key, it hides and brings back from any program, also when the windows have gone away, and other programs no longer get that button while Wallpane runs (Back no longer goes back in a browser). A small helper (`wallpane-mouse.exe`) watches for that one button; if it cannot start, Settings says so and the button works only over a Wallpane window.
- **Windows show**: a spreadsheet (a plain budget table; you can click cells and move with the arrow keys, and the window title changes to match), a black screen, a picture you choose, or nothing at all: the windows go away, off the taskbar too.
- **Hide now** tries it.

While hidden, keys, drops and right-clicks don't reach the wall, so nothing on it can change by accident. The settings are shared by all wall windows (`hide.json`).

## Keys
- F11 wall mode on or off, Esc leaves wall mode / full screen
- Ctrl+L opens or closes the library; in it, Ctrl+A selects everything shown, Enter puts the selection on the wall, 1 to 5 rate the selection (0 clears), F gives or takes the heart, T opens its tags, Esc clears the search, then the selection, then closes it
- Ctrl+Shift+H emergency hide, from any program; press again to come back
- Tab moves between tiles and selects them; Enter selects or lets go
- Arrows move the selected tile, Shift+arrows resize, Delete removes it
- Alt+Enter opens Properties for the selected tile; Esc closes it (or the right-click menu, or Reposition), and a second Esc lets go of the tile
- On a selected video: Space or K plays and pauses, J / L skip 5 seconds back / on, [ and ] set where the looped part starts and ends, \ stops looping it, < and > change the speed, M mutes
- Ctrl+Z / Ctrl+Y undo / redo
- Double-click a tile: that tile full screen

Settings › Keys lists them all.

## Your data
Saved walls, frame layouts, settings and your last wall are JSON files in `%APPDATA%\Wallpane`; the library and the cache are there too. Settings › About shows the folder, and Saved walls › Show file opens it. Saved walls › Export / Import moves walls between PCs.

Wallpane goes online only when you click Settings › General › **Check for updates**: it asks GitHub which version is the newest and, when one is newer than yours, offers its release page in your browser. Nothing is downloaded or installed by itself, and nothing about your files is sent.

Wallpane used to be called Media Wall. On its first start it copies your saved walls and settings from the old `%APPDATA%\Media Wall` folder, which stays as a backup; older exports import as before.
