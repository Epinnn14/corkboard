import { defineStore } from 'pinia';
import {
  type Board,
  bringToFront,
  clampToBoard,
  createNote,
  type Note,
  type NoteKind,
  type Orientation,
  type Surface,
  TAPES,
  topZ,
} from '../core/board';
import { toggleLineDone } from '../core/detect';
import { buildTemplate, type TemplateId } from '../core/templates';
import { boardAt, type Camera, corkRect, createBoard, placeImported, type Workspace } from '../core/workspace';

export function welcomeWorkspace(orientation: Orientation = 'landscape', rnd: () => number = Math.random): Workspace {
  let board = createBoard([], orientation, 'My board');
  const portrait = orientation === 'portrait';
  const add = (
    kind: NoteKind,
    at: { x: number; y: number },
    text: string,
    opts: { color?: string; tape?: (typeof TAPES)[number] } = {},
  ) => {
    const pos = portrait ? { x: at.x * 0.62, y: at.y * 1.45 } : at;
    const note = createNote(kind, board, { at: pos, text, rnd, ...opts });
    board = { ...board, notes: [...board.notes, note] };
  };
  add('sticky', { x: 230, y: 210 }, 'Double-click anywhere on the board to stick a new note ✨', { color: '#fff27a' });
  add('index', { x: 700, y: 170 }, 'TO DO\n– buy milk\n– call the plumber\n– finish slides', { tape: 'mint-dots' });
  add('sticky', { x: 1180, y: 230 }, 'Drag me around, even onto another board', { color: '#ffb3c7' });
  add('lined', { x: 260, y: 640 }, 'Ideas\n\nweekend trip?\nnew bookshelf\nlearn Vue', { tape: 'pink-stripes' });
  add('card', { x: 760, y: 560 }, 'Need more room? The + button adds another board, or a ready-made planner.\nDrag empty space to pan, scroll or pinch to zoom.');
  add('polaroid', { x: 1300, y: 690 }, 'add a photo →', { tape: 'lilac-check' });
  add('sticky', { x: 1040, y: 790 }, 'Everything is saved in this browser', { color: '#a8dcff' });
  add('sticker', { x: 1470, y: 110 }, '🔥');
  add('sticker', { x: 560, y: 860 }, '☕');
  add('sticker', { x: 960, y: 140 }, '✅');
  const planner = buildTemplate('week', [board], orientation, rnd);
  return { version: 2, boards: [board, planner], camera: null };
}

type Undo =
  | { kind: 'note'; boardId: string; note: Note }
  | { kind: 'board'; board: Board; index: number }
  | { kind: 'clear'; boardId: string; notes: Note[] };

interface State {
  ws: Workspace;
  activeId: string | null;
  selectedId: string | null;
  draggingId: string | null;
  undo: Undo | null;
  loaded: boolean;
}

export const useWorkspace = defineStore('workspace', {
  state: (): State => ({
    ws: { version: 2, boards: [], camera: null },
    activeId: null,
    selectedId: null,
    draggingId: null,
    undo: null,
    loaded: false,
  }),

  getters: {
    boards: (s) => s.ws.boards,
    active: (s): Board | null => s.ws.boards.find((b) => b.id === s.activeId) ?? s.ws.boards[0] ?? null,
    undoLabel: (s): string => {
      if (!s.undo) return '';
      if (s.undo.kind === 'note') return 'Note removed';
      if (s.undo.kind === 'board') return `“${s.undo.board.title}” deleted`;
      return 'Board cleared';
    },
  },

  actions: {
    replace(ws: Workspace) {
      this.ws = ws;
      this.activeId = ws.boards[0]?.id ?? null;
      this.selectedId = null;
      this.undo = null;
      this.loaded = true;
    },

    /** Another corkboard window saved: take its boards, keep this window's view and selection. */
    applyRemote(ws: Workspace) {
      this.ws = { ...ws, camera: this.ws.camera };
      if (!ws.boards.some((b) => b.id === this.activeId)) this.activeId = ws.boards[0]?.id ?? null;
      if (this.selectedId && !ws.boards.some((b) => b.notes.some((n) => n.id === this.selectedId))) this.selectedId = null;
    },

    find(noteId: string): { board: Board; note: Note } | null {
      for (const board of this.ws.boards) {
        const note = board.notes.find((n) => n.id === noteId);
        if (note) return { board, note };
      }
      return null;
    },

    board(id: string): Board | null {
      return this.ws.boards.find((b) => b.id === id) ?? null;
    },

    setCamera(c: Camera) {
      this.ws.camera = c;
    },

    setActive(id: string | null) {
      if (id && this.board(id)) this.activeId = id;
    },

    // ------------------------------------------------------------- boards

    addBoard(orientation: Orientation, template: TemplateId = 'blank'): Board {
      const b = buildTemplate(template, this.ws.boards, orientation);
      this.ws.boards.push(b);
      this.activeId = b.id;
      this.selectedId = null;
      return b;
    },

    renameBoard(id: string, title: string) {
      const b = this.board(id);
      if (b) b.title = title.slice(0, 80);
    },

    setSurface(id: string, surface: Surface) {
      const b = this.board(id);
      if (b) b.surface = surface;
    },

    moveBoard(id: string, x: number, y: number) {
      const b = this.board(id);
      if (b) Object.assign(b, { x: Math.round(x), y: Math.round(y) });
    },

    removeBoard(id: string) {
      const index = this.ws.boards.findIndex((b) => b.id === id);
      if (index < 0) return;
      const [board] = this.ws.boards.splice(index, 1);
      this.undo = { kind: 'board', board, index };
      if (this.activeId === id) this.activeId = this.ws.boards[Math.max(0, index - 1)]?.id ?? null;
      if (this.selectedId && board.notes.some((n) => n.id === this.selectedId)) this.selectedId = null;
    },

    clearBoard(id: string) {
      const b = this.board(id);
      if (!b || !b.notes.length) return;
      this.undo = { kind: 'clear', boardId: id, notes: b.notes };
      b.notes = [];
      this.selectedId = null;
    },

    // -------------------------------------------------------------- notes

    addNote(
      kind: NoteKind,
      opts: { boardId?: string; at?: { x: number; y: number }; color?: string; text?: string } = {},
    ): Note | null {
      const board = (opts.boardId && this.board(opts.boardId)) || this.active;
      if (!board) return null;
      const note = createNote(kind, board, { at: opts.at, color: opts.color, text: opts.text });
      board.notes.push(note);
      this.activeId = board.id;
      this.selectedId = note.id;
      return note;
    },

    updateNote(id: string, patch: Partial<Omit<Note, 'id'>>) {
      const f = this.find(id);
      if (f) Object.assign(f.note, patch, { updatedAt: Date.now() });
    },

    /** Move while dragging: the note may leave its board until `dropNote`. */
    dragNote(id: string, x: number, y: number) {
      const f = this.find(id);
      if (!f) return;
      this.draggingId = id;
      f.note.x = Math.round(x);
      f.note.y = Math.round(y);
    },

    /** Finish a drag: the note lands on whichever board is under its centre. */
    dropNote(id: string) {
      this.draggingId = null;
      const f = this.find(id);
      if (!f) return;
      const { board, note } = f;
      const src = corkRect(board);
      const centre = { x: src.x + note.x + note.w / 2, y: src.y + note.y + note.h / 2 };
      const target = boardAt(this.ws.boards, centre);
      if (!target || target.id === board.id) {
        Object.assign(note, clampToBoard(note, board.orientation));
        return;
      }
      const dst = corkRect(target);
      const moved: Note = {
        ...note,
        ...clampToBoard({ ...note, x: note.x + src.x - dst.x, y: note.y + src.y - dst.y }, target.orientation),
        z: topZ(target.notes) + 1,
        updatedAt: Date.now(),
      };
      board.notes = board.notes.filter((n) => n.id !== id);
      target.notes.push(moved);
      this.activeId = target.id;
    },

    select(id: string | null) {
      this.selectedId = id;
      if (!id) return;
      const f = this.find(id);
      if (f) {
        f.board.notes = bringToFront(f.board.notes, id);
        this.activeId = f.board.id;
      }
    },

    setDue(id: string, due: string | undefined, remind?: number | null) {
      const f = this.find(id);
      if (!f) return;
      const n = f.note;
      if (!due) {
        delete n.due;
        delete n.remind;
        delete n.done;
        delete n.notified;
      } else {
        n.due = due;
        if (remind === null) delete n.remind;
        else if (remind !== undefined) n.remind = remind;
        delete n.notified;
      }
      n.updatedAt = Date.now();
    },

    toggleDone(id: string) {
      const f = this.find(id);
      if (!f || !f.note.due) return;
      if (f.note.done) delete f.note.done;
      else f.note.done = true;
    },

    /** Tick a line of a note that the agenda found a time in: crosses it out (or back in). */
    toggleLine(id: string, line: number) {
      // not an edit of the note: its "written on" day (updatedAt) stays, so undated lines keep their day
      const f = this.find(id);
      if (f) f.note.text = toggleLineDone(f.note.text, line);
    },

    /** Your own short note on an agenda item; empty removes it. */
    setMemo(id: string, key: string, text: string) {
      const f = this.find(id);
      if (!f) return;
      const memos = { ...(f.note.memos ?? {}) };
      const t = text.slice(0, 300);
      if (t.trim()) memos[key.slice(0, 120)] = t;
      else delete memos[key];
      if (Object.keys(memos).length) f.note.memos = memos;
      else delete f.note.memos;
    },

    /** Tick an agenda item: a dated note, or a line with a time in it. */
    toggleItem(item: { note: { id: string }; line?: number }) {
      if (item.line === undefined) this.toggleDone(item.note.id);
      else this.toggleLine(item.note.id, item.line);
    },

    markNotified(id: string, key: string) {
      const f = this.find(id);
      if (f) f.note.notified = key;
    },

    /** Select a note and make its board active (agenda → board). */
    reveal(id: string): string | null {
      const f = this.find(id);
      if (!f) return null;
      this.select(id);
      return f.board.id;
    },

    /** pin → washi tape (cycling patterns) → pin */
    cycleFastener(id: string) {
      const f = this.find(id);
      if (!f) return;
      const i = f.note.tape ? TAPES.indexOf(f.note.tape) : -1;
      if (i === TAPES.length - 1) delete f.note.tape;
      else f.note.tape = TAPES[i + 1];
    },

    removeNote(id: string) {
      const f = this.find(id);
      if (!f) return;
      this.undo = { kind: 'note', boardId: f.board.id, note: { ...f.note } };
      f.board.notes = f.board.notes.filter((n) => n.id !== id);
      if (this.selectedId === id) this.selectedId = null;
    },

    duplicateNote(id: string) {
      const f = this.find(id);
      if (!f) return;
      const { board, note } = f;
      const copy = createNote(note.kind, board, {
        at: { x: note.x + note.w / 2 + 30, y: note.y + note.h / 2 + 30 },
        color: note.color,
      });
      board.notes.push({
        ...copy,
        text: note.text,
        image: note.image,
        ...(note.tape ? { tape: note.tape } : {}),
        ...(note.due ? { due: note.due } : {}),
        ...(note.remind !== undefined ? { remind: note.remind } : {}),
      });
      this.selectedId = copy.id;
    },

    undoLast() {
      const u = this.undo;
      if (!u) return;
      this.undo = null;
      if (u.kind === 'board') {
        this.ws.boards.splice(Math.min(u.index, this.ws.boards.length), 0, u.board);
        this.activeId = u.board.id;
        return;
      }
      const b = this.board(u.boardId) ?? this.active;
      if (!b) return;
      if (u.kind === 'note') {
        b.notes.push({ ...u.note, ...clampToBoard(u.note, b.orientation) });
        this.selectedId = u.note.id;
      } else {
        b.notes.push(...u.notes);
      }
    },

    importBoards(incoming: Board[]): Board[] {
      const placed = placeImported(this.ws.boards, incoming);
      this.ws.boards.push(...placed);
      if (placed[0]) this.activeId = placed[0].id;
      return placed;
    },
  },
});
