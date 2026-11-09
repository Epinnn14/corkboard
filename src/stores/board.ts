import { defineStore } from 'pinia';
import {
  type Board,
  bringToFront,
  clampToBoard,
  createNote,
  emptyBoard,
  type Note,
  type NoteKind,
  type Orientation,
  reorient,
} from '../core/board';

export function welcomeBoard(rnd: () => number = Math.random): Board {
  let board = emptyBoard('landscape');
  const add = (kind: NoteKind, at: { x: number; y: number }, text: string, color?: string) => {
    const note = createNote(kind, board, { at, color, rnd });
    board = { ...board, notes: [...board.notes, { ...note, text }] };
  };
  add('sticky', { x: 230, y: 210 }, 'Double-click anywhere on the board to stick a new note ✨', '#fff27a');
  add('index', { x: 700, y: 170 }, 'TO DO\n– buy milk\n– call the plumber\n– finish slides');
  add('sticky', { x: 1180, y: 230 }, 'Drag me around!', '#ffb3c7');
  add('lined', { x: 260, y: 640 }, 'Ideas\n\nweekend trip?\nnew bookshelf\nlearn Vue');
  add('card', { x: 760, y: 560 }, 'Click a note to write on it.\nSelect it to change colour, duplicate or remove.');
  add('polaroid', { x: 1300, y: 690 }, 'add a photo →');
  add('sticky', { x: 1040, y: 790 }, 'Everything is saved in this browser', '#a8dcff');
  return board;
}

interface State {
  board: Board;
  selectedId: string | null;
  deleted: Note | null;
  loaded: boolean;
}

export const useBoard = defineStore('board', {
  state: (): State => ({ board: emptyBoard(), selectedId: null, deleted: null, loaded: false }),

  getters: {
    notes: (s) => s.board.notes,
    selected: (s) => s.board.notes.find((n) => n.id === s.selectedId) ?? null,
  },

  actions: {
    replace(board: Board) {
      this.board = board;
      this.selectedId = null;
      this.deleted = null;
      this.loaded = true;
    },

    add(kind: NoteKind, at?: { x: number; y: number }, color?: string): Note {
      const note = createNote(kind, this.board, { at, color });
      this.board.notes.push(note);
      this.selectedId = note.id;
      return note;
    },

    update(id: string, patch: Partial<Omit<Note, 'id'>>) {
      const n = this.board.notes.find((x) => x.id === id);
      if (!n) return;
      Object.assign(n, patch, { updatedAt: Date.now() });
    },

    move(id: string, x: number, y: number) {
      const n = this.board.notes.find((x) => x.id === id);
      if (!n) return;
      Object.assign(n, clampToBoard({ x, y, w: n.w, h: n.h }, this.board.orientation));
    },

    select(id: string | null) {
      this.selectedId = id;
      if (id) this.board.notes = bringToFront(this.board.notes, id);
    },

    remove(id: string) {
      const n = this.board.notes.find((x) => x.id === id);
      if (!n) return;
      this.deleted = { ...n };
      this.board.notes = this.board.notes.filter((x) => x.id !== id);
      if (this.selectedId === id) this.selectedId = null;
    },

    undoRemove() {
      if (!this.deleted) return;
      this.board.notes.push(this.deleted);
      this.selectedId = this.deleted.id;
      this.deleted = null;
    },

    duplicate(id: string) {
      const n = this.board.notes.find((x) => x.id === id);
      if (!n) return;
      const copy = createNote(n.kind, this.board, { at: { x: n.x + n.w / 2 + 30, y: n.y + n.h / 2 + 30 }, color: n.color });
      this.board.notes.push({ ...copy, text: n.text, image: n.image });
      this.selectedId = copy.id;
    },

    setOrientation(o: Orientation) {
      if (o !== this.board.orientation) this.board = reorient(this.board, o);
    },

    clear() {
      this.board = { ...this.board, notes: [] };
      this.selectedId = null;
      this.deleted = null;
    },
  },
});
