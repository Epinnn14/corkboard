# corkboard

**An endless wall of cork boards in your browser.** Pin sticky notes, index cards, lined paper,
polaroids, stickers and washi tape, plan your week, run a kanban, build a moodboard.
No account, no server: everything stays on your device.

![A board with sticky notes, an index card, a polaroid and stickers](docs/board.jpg)

Made for the way people actually plan: students with exams and group projects,
office folks juggling tasks and meetings, and anyone who thinks better with paper on a wall.

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
| Keys | `N` new sticky · `B` new board · `Delete` remove · `Esc` deselect |
| Keep / share | **Save** downloads the current board as a PNG · the **+** menu has New board, Import and Export (below) |

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
npm test          # 51 tests
npm run build     # static site in dist/ (relative paths, host it anywhere)
```

Pushing to `main` runs the tests and deploys to GitHub Pages
(*Settings → Pages → Source: GitHub Actions*). Workspaces from v1.0 (single board) are migrated automatically.

## How it's built

Vue 3 (`<script setup>`) · Pinia · TypeScript · Vite · idb-keyval · html-to-image · pdf.js · mammoth · docx · jsPDF ·
Fontsource (Bricolage Grotesque, Caveat, Patrick Hand) · Vitest + Vue Test Utils + fake-indexeddb

```
src/
├── core/                 plain TypeScript, no Vue
│   ├── board.ts          notes, colours, stickers, tapes, surfaces, safe parsing
│   ├── workspace.ts      camera (fit, zoom-at-cursor), board placement, hit-testing, file import + v1 migration
│   ├── templates.ts      planner / kanban / study / moodboard / brainstorm layouts (work in both orientations)
│   ├── convert.ts        text / markdown / csv → packed notes across boards, notes → txt / md
│   ├── io.ts             file readers (pdf.js, mammoth) and writers (docx, jsPDF), loaded on demand
│   ├── texture.ts        cork, felt, linen and dot-grid surfaces painted on a canvas
│   └── storage.ts        IndexedDB persistence
├── stores/workspace.ts   Pinia: boards, notes, cross-board drops, undo
└── components/
    ├── Workspace.vue     the endless canvas: pan, wheel/pinch zoom
    ├── BoardView.vue     one framed board with its name tag
    ├── NoteItem.vue      one note: drag, edit, paper styles, stickers, tape, toolbar
    └── PushPin.vue
```

Everything on screen is drawn with CSS, SVG and canvas: no image assets.
See [ROADMAP.md](ROADMAP.md).

## License

MIT
