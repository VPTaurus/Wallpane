# Changelog

## Not released yet

For 1.7.1.

Added:
- **Check for updates** in Settings › General: asks GitHub which version is the newest and, when one is newer than yours, offers its release page in your browser. Nothing is downloaded or installed by itself. This is the only time Wallpane goes online, and only when you click it.
- **A library folder or collection as a playlist:** right-click one in the library's folder list › Play on the wall as a playlist (it fills the empty tiles and cells and keeps rotating, as Add › Folder as a playlist… does), or Play on the selected tile. While one shows, a button beside the folder row plays it too. A collection's playlist follows it as it changes, as when it is dragged. Also in the library window, where collections could not reach the wall before. On an empty wall it first makes a tile per file, up to the grid's number of cells (also in Free). Then Fill the wall arranges every tile by its media's shape, edge to edge; one Ctrl+Z undoes it all. When every file gets a tile of its own, the tiles stay on their files (pinned), so none moves on to a file another tile already shows. With Videos, GIFs or Pictures picked in the library, the playlist plays only those kinds of file. With a search, a tag, All folders or other filters (rating, favourites, shape, length, resolution), the button plays exactly the files the library shows, in its order.
- **Pin all** in the top bar, beside Repeat: every playlist tile stays on the file it shows; when all do already, they all carry on with their playlists.
- **Tag chips in the library:** every tag in use as a chip under Videos / GIFs / Pictures. Click to show only the files with it, together with the folder or collection and the other filters; several on show the files that have them all. (A tag picked in the folder row's list used to replace the folder; it now turns its chip on.)
- **Save the wall as a GIF** (Saved walls › Save as a GIF…): made like Save as a video, as a GIF of 3 to 30 seconds, 320 to 800 pixels wide, 10 to 25 frames a second, without sound. The dialog says about how big it gets.
- **More on the right-click menu in wall mode:** Pause all / Play all, Mute all / Unmute all, Take a screenshot, Make a GIF of the wall…, and Start recording / Stop recording, as the bar's buttons do (the bar is hidden in wall mode). While it records, a small red dot blinks in the top-left corner; it is not in the video.

Fixed:
- **Esc right after choosing from a right-click menu works:** it could go to the menu that had just closed, so in wall mode the first Esc sometimes did nothing.
- **Exit wall mode no longer covers a tile's buttons:** it sat in the top-right corner, over the buttons of the tile there. It now stays out of sight and slides down at the top centre when the pointer touches the top edge of the screen, as full screen does in a browser. Esc, F11 and right-click › Exit wall mode work as before.
- **Clicks no longer stop working after hiding with the mouse button:** on a busy PC (a full wall in wall mode) the button's press could reach the wall itself while its release did not, so the wall's window kept hold of the mouse: hidden, it took every click in Windows, and only bringing it back ended that. Wallpane now makes its windows let go of the mouse whenever it hides them.
- **GIFs move in a recording:** Record drew each GIF on the wall as a still picture (a canvas only takes a GIF's first frame). It now plays them frame by frame, with each frame's own timing.

## 1.7.0: Record the wall, and take screenshots

Download **Wallpane Setup 1.7.0.exe** (installer) or **Wallpane 1.7.0.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**. (**Wallpane-Setup.exe** and **Wallpane-Portable.exe** are the same two files under names that stay the same, for the website's download buttons.)

Record the wall as it plays with one click in the top bar, and stop it with the next; its size, frame rate and quality are in the new Settings › Recording. Beside it, a screenshot of the whole wall. A tile's frame can be saved as a picture, and Saved walls can make a video of the wall of a length you choose. Wallpane also has a website now: https://vptaurus.github.io/Wallpane/

New:
- **Save this frame:** a video tile's right-click menu (File) and Properties › File save the frame the tile shows as a PNG or JPEG: the whole frame at the video's own size, from the original file, also when the tile is zoomed or plays a lighter copy.
- **Screenshot of the wall:** a camera button in the top bar saves the wall as it shows now as a picture (PNG or JPEG) at the screen's resolution, with only the media in it: no selection, tile controls or empty cells.
- **Record the wall:** the Record button beside it starts recording the wall as it plays, and stops it; the MP4 is saved at once in the folder set in Settings › Recording (Videos by default). Only the media is recorded, each tile in its place, with the sound you hear from the wall. Settings › Recording sets the size (as on screen, or 720p to 4K), 30 or 60 frames a second, the quality, the sound and the folder.
- **Save the wall as a video:** Saved walls › Save as a video… makes one MP4 of the whole wall, every tile in its place, at 720p to 4K in the wall's shape, 10 s to 10 minutes long. The wall goes on in it as it would on screen: each tile from where it is, with its looped part, speed and zoom, playlists moving on with their own order and timing, and the sound of the tiles you hear plus the music. Made offline with FFmpeg as a job in the bar.

Fixed:
- **A setting changed just before closing Wallpane is kept:** settings were saved in the background, and closing right after a change could cut that save off. A wall now saves its settings once more, at once, as its window closes.
- **The emergency hide's mouse button holds on when the PC is busy:** Windows waits only a moment for the small helper that catches the button, and can pass the press on, or drop the helper for good, when it is late. The helper now answers at once, runs above normal priority, and puts its hook in afresh every 10 seconds.

Also:
- **A website and a shorter README:** https://vptaurus.github.io/Wallpane/ shows what Wallpane does, with pictures and a recorded wall. The README on GitHub is now one screen; everything it held is in the [guide](docs/guide.md) and the [developer notes](docs/development.md).

## 1.6.8: Stars, hearts and tags; the looped part as MP4; a wall that carries on where it was

Download **Wallpane Setup 1.6.8.exe** (installer) or **Wallpane 1.6.8.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

Give library files stars, a favourite heart and tags. Save a video's looped part as an MP4, beside Make a GIF. After a restart the last wall's videos carry on where they were, and a big tile has 10 s back and on. The emergency hide takes any one key, and its mouse button now works from any program. (1.6.6 was never published: everything since 1.6.5 is here.)

New:
- **Stars, hearts and tags for library files:** 1 to 5 stars, a favourite heart and any tags, for one file or a whole selection at once: keys 1 to 5 (0 clears), F and T, or right-click › Favourite, Rating ›, Tags…. Thumbnails show the heart and the stars. Filters for rating and favourites, a Rating sort, a search that finds tags, and a Tags section in the folder row's list (right-click a tag to rename or delete it). On the wall, a tile whose file is in the library has a Library group in its menu and a Library part in Properties. `library.json` becomes version 2, which an older Wallpane opens read-only, so it never drops them.
- **The last wall carries on where it was:** after a restart its videos continue from where they were, not from the start (a folder's tile on its file, from where it was). Saved as Wallpane closes and every 20 seconds while videos play, so a crash or a power cut loses little. Saved walls you name start their videos as usual.
- **10 s back and on:** two buttons in the video bar of a big tile, or one full screen (a curved arrow and "10"). Smaller tiles keep the bar as it was; J and L still skip 5 s.
- **Save the looped part as MP4:** beside Make a GIF (Properties › Playback and the tile's menu). When a keyframe lies within half a second before the part, it is copied without re-encoding: saved at once, nothing lost, starting on that keyframe. Otherwise it is re-encoded so it starts and ends exactly on the part, since a copy of a short part from a video with keyframes seconds apart would be mostly what comes before it. The message says which.
- **Emergency hide, any one key:** the hide key no longer needs Ctrl+Shift or another pair of modifiers. Any key will do, alone or with modifiers (not F11, the wall mode key, or Alt+F4). For a key that types something, Settings says that typing it anywhere now hides the wall.

Tidier:
- **Empty tiles in Free (pixels) look like empty cells on the grid:** only the faint +, with "Drop or click" under the pointer, instead of the Empty tile card with File… and Folder…. A click chooses the tile's media; its right-click menu still offers a folder.

Fixed:
- **The emergency hide's mouse button works from any program:** it worked only with the pointer over a Wallpane window, so once the windows had gone away ("Nothing" shown) the button could not bring them back. Now a small helper catches that one button in every program, like the key, and other programs no longer get it while Wallpane runs.
- **The message after making a GIF** had its text and buttons out of line, and a long file name pushed it wide. Its buttons now sit in a row under the message, and the name wraps.

## 1.6.5: GIFs and a tidier wall

Download **Wallpane Setup 1.6.5.exe** (installer) or **Wallpane 1.6.5.exe** (portable). Not code-signed yet: if Windows SmartScreen warns, click **More info**, then **Run anyway**.

Make a GIF from any looped part of a video. The top bar, the menus, Settings and Properties are tidier, with shorter words. A wall that plays videos is saved again while it plays. (1.6.1 was never published: everything since 1.6.0 is here.)

New:
- **Make a GIF of a looped part:** once a video tile loops a part, Properties › Playback and the tile's right-click menu offer **Make a GIF…**.
  - **Choices:** the width (320 to 800 px), frames a second (10 to 25), the whole frame or what the tile shows (its shape, zoom and position), and the tile's speed if it plays faster or slower.
  - **Before you save:** the dialog shows the GIF's size and roughly how big the file will be, and refuses a part longer than a minute.
  - **Saving:** FFmpeg makes the GIF in the background, next to the video by default, with a progress bar you can stop. Then **Show in Explorer** or **Put on the wall**. The video is never changed.

Tidier:
- **The same words everywhere:** saved walls (no more "presets"), **Play a folder…** (was Own folder) and **Show in Explorer** in a tile's menu and Properties, the Playlist popover's choices as in Properties, and shorter notes in Saved walls, Playlist and the clock, with a **?** for the rest.
- **A shorter Arrange menu:** **Fill the wall** and **Layouts…**, which now holds the ready-made layouts, Rows and columns, and your own. Fit to media and Auto-arrange (Pack tiles) are gone. Tested on thousands of walls, Fit to media could not reshape a full grid, so it only shuffled the tiles. With spare cells it still left 17–23% bars where Fill the wall leaves none and keeps the order. Pack tiles left gaps in the middle on about half of the walls with gaps, and now and then shrank a wide tile to one cell. Fit tile to media, for one tile, stays in the tile's menu and Properties. Layouts keep their shape: frames you have no tile for become empty tiles (before, a big empty frame fell apart into single cells), and they work while tiles are placed freely too, putting them back on the grid. The ready-made layouts' pictures show again (since 1.5.0 the library's thumbnail style had broken them). Cell shape is set on the grid only, and "New tiles show" moved to Settings › Tiles.
- **Clearer Settings:** short names, and a **?** beside each that explains it on hover, instead of long notes. General is split up: **Tiles** (growing a tile, a full wall, shape-matched playlists) and **Video** (sound, black openings, pausing when minimized, playable copies, GIFs, lighter copies, the drawing pace, which moved here from Wall mode).
- **A tidier top bar:** its buttons sit in groups, each on a soft ground: the wall's contents (Add, **Clear**, Undo, Redo), its layout, playback; on the right the clock, what the wall plays (**Library**, Saved walls, Playlist), and the app (Help, Settings, New wall window, Wall mode). **Clear** moved out of Settings into the bar, beside Add: a red bin that takes two clicks, as before. The library drawer now opens on the right, beside its button; a side you pick in its menu or in Settings › Library stays.
- **Fill the wall uses only tiles with media:** empty tiles (and the sample cards) make way, so what plays fills the wall edge to edge. Ctrl+Z brings them back.
- **A shorter tile menu:** what you use most stays at the top (sound, Repeat, Loop a part; a playlist's Previous, Next, Stay on this file and settings), the rest sits in three groups that open beside it: **Display**, **File** and **Tile**. Arrow keys work in them too.
- **Properties folds:** each part of the card folds away under its heading and stays folded for every tile, so the card shows what you use. Position and size starts folded; Loop a part… and Playlist settings… open their part even when it was folded.
- **The emergency hide's mouse button is recorded:** click the button in Settings › Hide, then press the mouse button you want (middle, back or forward); Esc stops, Clear takes it off. No list to pick from.
- **Clip length is a choice** in Properties and the Playlist popover: the whole clip, 10 s, 20 s, 30 s, 1, 2 or 5 minutes.
- **Quieter empty cells:** a faint + that lights up under the pointer, with "Drop or click" only then.
- **Repeat and Stay on this file:** a tile with one video has **Repeat** (on, or play it once), a tile playing a folder has **Stay on this file** (the pin), in its buttons, its right-click menu and Properties alike; pictures and GIFs no longer show a loop button that did nothing. "Loop a part" keeps its name.

Fixed and lighter:
- **A wall with videos is saved again while it plays.** In 1.6.0 such a wall redrew itself every half second or so, which kept putting off its save until the window closed: after a crash or a power cut, recent changes were lost. It now redraws only when something changes, and saves within a second of a change.
- **Less work at rest:** the clock in the bar ticks once a second (four times while a stopwatch or timer runs, ten while its popover shows tenths), and no longer asks Windows for its time format on every tick.

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
- **Saving is safer:** the wall and its settings are always saved in the order they changed. Before, on a PC where antivirus holds a file up for a moment, an older state could overwrite a newer one.
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
