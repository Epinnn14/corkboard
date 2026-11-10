# corkboard

**An endless wall of cork boards in your browser.** Pin sticky notes, index cards, lined paper,
polaroids, stickers and washi tape, plan your week, run a kanban, build a moodboard.
No account, no server: everything stays on your device.

<p align="center">
  <a href="https://epinnn14.github.io/corkboard/#install"><img src="docs/install-laptop.svg" alt="Install on laptop" height="56"></a>
  &nbsp;
  <a href="https://epinnn14.github.io/corkboard/#install"><img src="docs/install-phone.svg" alt="Install on phone" height="56"></a>
</p>

![A board with sticky notes, an index card, a polaroid and stickers](docs/board.jpg)

Made for the way people actually plan: students with exams and group projects,
office folks juggling tasks and meetings, and anyone who thinks better with paper on a wall.

## Install

<p align="center">
  <a href="https://epinnn14.github.io/corkboard/#install"><img src="docs/install-laptop.svg" alt="Install on laptop" height="56"></a>
  &nbsp;
  <a href="https://epinnn14.github.io/corkboard/#install"><img src="docs/install-phone.svg" alt="Install on phone" height="56"></a>
</p>

Click **Install on laptop** or **Install on phone** (or scan the code with your phone camera). corkboard opens with an
install window ready for the device you're on:

<img src="docs/install-qr.svg" width="150" align="right" alt="QR code to install corkboard on a phone">

- **Windows / Mac / Chromebook (Chrome or Edge), Android:** one **Install now** button, then confirm once.
  corkboard gets its own window and lands in the Start menu, taskbar, Dock or home screen.
- **iPhone / iPad:** Apple doesn't let websites show an install button, so the window shows the two taps:
  *Share → Add to Home Screen*.
- **Firefox on a laptop** can't install web apps; it still runs fine in a tab.

No app store, no account, about 1 MB, works offline. To remove it, uninstall it like any other app.
For security, browsers always ask you to confirm; no website can install itself silently.

## Boards, as many as you want

The workspace has no edges. Add a board for every class, client or side quest, drag boards
around, zoom out to see everything, and drag a note from one board straight onto another.

![The workspace zoomed out: six boards side by side](docs/workspace.jpg)

New boards come blank or from a template:

| Template | What's on it |
|---|---|
| 🗓️ **Weekly planner** | an index card for each day + the week's one big goal |
| ✅ **Kanban** | To do → Doing → Done, on midnight felt |
| 📚 **Study plan** | exam card, topics checklist, schedule, pomodoro, study buddy photo |
| 🌈 **Moodboard** | taped polaroids and vibe words on blush linen |
| 💡 **Brainstorm** | one big question in the middle, a ring of rainbow stickies |

![Template picker](docs/templates.jpg)

## On every board

- **Sticky notes** in 12 colours (canary to periwinkle) plus a picker for any colour you like.
- **Index cards**, **lined paper** with a perforated edge, **cards** held by four pins.
- **Polaroids** with your own photos (downscaled to stay light) and a handwritten caption.
- **Stickers**: a sheet of 24 die-cut emoji (✨🔥💯✅📚☕🧠🚀🫶…).
- **Washi tape** instead of a push-pin: pink stripes, mint dots, sun grid, kraft or lilac check.
- **Four surfaces** per board: cork, midnight felt, blush linen, dot-grid paper.
- Boards are **landscape on wide screens and portrait on phones**, picked automatically.

<p align="center">
  <img src="docs/toolbar.jpg" width="360" alt="A selected sticky note with its colour palette">
  &nbsp;
  <img src="docs/mobile.jpg" width="220" alt="corkboard on a phone">
</p>

## How to use it

| | |
|---|---|
| Add a note | double-click the board, or use the dock at the bottom |
| Write | click a note |
| Move | drag a note (also onto another board), drag a board by its frame or name tag |
| Pan / zoom | drag empty space · scroll wheel or pinch · `+` `−` · `0` shows everything |
| Change a note | select it: colour, tape/pin, duplicate, remove |
| Undo | the toast's **Undo**, or `Ctrl/⌘ + Z` (notes, cleared boards and deleted boards) |
| Dates | select a note → 📅: pick a day and time, a reminder (at time, 10 min, 1 h, 1 day before); tap the chip to tick it done |
| Keys | `N` new sticky · `B` new board · `A` agenda · `Delete` remove · `Esc` deselect |
| Keep / share | **Save** downloads the current board as a PNG · the **+** menu has New board, Import and Export (below) |

## Dates, reminders, widget & wallpaper

- **Due dates** on any note show a chip (overdue red, today orange, done ticked). **Agenda** (top right, or `A`)
  lists everything by Overdue / Today / Tomorrow / This week / Later; click an item to jump to its note.
- **Reminders** pop up as a banner and a system notification while corkboard is open (a tab or the installed app).
  For reminders when it is closed, use **Add to calendar** in the date editor: an `.ics` file with an alarm
  (Windows Calendar, Outlook, Apple, Google) or a Google Calendar link.
- **Install as an app** (see [Install](#install)): works offline and gets its own icon, with shortcuts to *Widget*
  and *Agenda*.
- **Your board as the wallpaper** (**+** → *Add to desktop*, or open `#wall`): just one board (your Weekly planner
  by default) on a plain background, filling the screen and fully editable: click a note to write, drag it,
  double-click to add one. Everything else hides in one round 📌 button at the bottom right (add notes, agenda,
  another board, light/dark background, full screen, open the full app).
  - **As the real wallpaper:** in [Lively Wallpaper](https://github.com/Lively-wallpaper/lively) press **+** and paste
    `https://epinnn14.github.io/corkboard/#wall`, then *Settings → Wallpaper → Interaction → Wallpaper input*:
    Mouse (and Keyboard to type). The board sits behind your desktop icons and you edit it right there, no export.
    Lively has its own built-in browser, so the wallpaper keeps its own boards (optionally starting from a copy of one).
  - **Same boards as the app:** *Open full screen* opens it in its own window (saved together, reminders on); press F11.
- **Add to desktop** (in the **+** menu): pick what to show (date & clock, today's reminders, the coming 7 days,
  a mini board) and a style (Sticky, Paper, Dark), with a live preview. Then either
  - **Open widget**: a small corkboard window for your desktop. Set it to start with Windows
    (Edge: `edge://apps` → ⋯ → *Auto-start on device login*; Chrome: `chrome://apps` → right-click →
    *Start app when you sign in*) and your reminders pop up every day without opening anything.
  - **Copy wallpaper link** for [Lively Wallpaper](https://github.com/Lively-wallpaper/lively): a live wallpaper
    behind your desktop icons (board on the left, today's list on the right, ticking clock). Lively runs its own
    browser, so the link carries a small copy of your reminders and board (no photos); copy it again after changes.
- **Widget mode** (`#widget`): the same widget in the current window, handy from the home-screen shortcut on a phone.
- **Wallpapers** (in the **+** menu): *Desktop wallpaper* (2560×1440) and *Phone wallpaper* (1170×2532, with the top
  third left clear for the lock-screen clock), so the whole board fits instead of being cropped.

## Import & export

The **+** menu (top left, next to *Boards*) adds boards, turns files into boards and boards into files.

**Import** (pick several files at once):

| File | Becomes |
|---|---|
| `.txt`, `.html` | a board named after the file; short paragraphs → sticky notes, medium → index cards, long → lined paper; bullet lists → one sticky per item |
| `.md` | same, plus `# Title` names the board and `## Headings` become index cards |
| `.csv` | one note per row, labelled by the header (`Due: Fri`) |
| `.pdf` | the PDF's text, split into paragraphs (pdf.js) |
| `.docx` | the Word document's text (mammoth) |
| images | polaroids on the current board |
| `.json` | a corkboard backup |

Big files flow onto extra boards ("Lecture (1)", "Lecture (2)" …).

**Export all boards as:** Word (.docx, sticky colours as shading, photos embedded) · PDF (a picture of each board
plus every note as searchable text) · plain text · Markdown (for Notion/Obsidian) · JSON backup.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 80 tests
npm run build     # static site in dist/ (relative paths, host it anywhere)
```

Pushing to `main` runs the tests and deploys to GitHub Pages
(*Settings → Pages → Source: GitHub Actions*). Workspaces from v1.0 (single board) are migrated automatically.

## How it's built

Vue 3 (`<script setup>`) · Pinia · TypeScript · Vite · idb-keyval · html-to-image · pdf.js · mammoth · docx · jsPDF ·
vite-plugin-pwa · Fontsource (Bricolage Grotesque, Caveat, Patrick Hand) · Vitest + Vue Test Utils + fake-indexeddb

```
src/
├── core/                 plain TypeScript, no Vue
│   ├── board.ts          notes, colours, stickers, tapes, surfaces, safe parsing
│   ├── workspace.ts      camera (fit, zoom-at-cursor), board placement, hit-testing, file import + v1 migration
│   ├── templates.ts      planner / kanban / study / moodboard / brainstorm layouts (work in both orientations)
│   ├── convert.ts        text / markdown / csv → packed notes across boards, notes → txt / md
│   ├── io.ts             file readers (pdf.js, mammoth) and writers (docx, jsPDF), loaded on demand
│   ├── dates.ts          due dates, agenda groups, reminder timing, .ics and Google Calendar links
│   ├── desk.ts           desktop widget settings, today/coming-up lists, wallpaper snapshots in the link
│   ├── install.ts        device/browser detection and install steps
│   ├── notify.ts         system notifications (through the service worker when installed)
│   ├── wallpaper.ts      desktop and phone wallpaper layouts
│   ├── texture.ts        cork, felt, linen and dot-grid surfaces painted on a canvas
│   └── storage.ts        IndexedDB persistence
├── stores/workspace.ts   Pinia: boards, notes, cross-board drops, undo
└── components/
    ├── Workspace.vue     the endless canvas: pan, wheel/pinch zoom
    ├── BoardView.vue     one framed board with its name tag
    ├── NoteItem.vue      one note: drag, edit, paper styles, stickers, tape, toolbar, due chip
    ├── DueEditor.vue     date, reminder and add-to-calendar popover
    ├── AgendaPanel.vue   every dated note across boards
    ├── WidgetView.vue    the desktop widget (#widget): window, Lively wallpaper and preview
    ├── WallView.vue      one board as the wallpaper (#wall), editable, with the round 📌 menu
    ├── DeskSheet.vue     "Add to desktop": pick what it shows, open it or copy the wallpaper link
    ├── InstallSheet.vue  the #install window: one-click install or the steps for this device
    └── PushPin.vue
```

Everything on screen is drawn with CSS, SVG and canvas: no image assets.
See [ROADMAP.md](ROADMAP.md).

## License

MIT
