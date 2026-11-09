/**
 * Board model — plain data and pure functions, no Vue. Positions are in board
 * units (a fixed logical canvas) so a board looks identical on every screen.
 */

export type NoteKind = 'sticky' | 'index' | 'lined' | 'polaroid' | 'card';
export type PinColor = 'red' | 'green' | 'blue' | 'yellow' | 'white';
export type Orientation = 'landscape' | 'portrait';

export interface Note {
  id: string;
  kind: NoteKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, a little tilt makes it look pinned by hand */
  rotation: number;
  color: string;
  pin: PinColor;
  text: string;
  /** data URL for polaroids */
  image?: string;
  z: number;
  createdAt: number;
  updatedAt: number;
}

export interface Board {
  version: 1;
  title: string;
  orientation: Orientation;
  notes: Note[];
}

export const BOARD_SIZE: Record<Orientation, { w: number; h: number }> = {
  landscape: { w: 1600, h: 1000 },
  portrait: { w: 1000, h: 1500 },
};

export const STICKY_COLORS = ['#fff27a', '#ffb3c7', '#a8dcff', '#b9f2a1', '#ffcb80', '#d7c2ff'] as const;
export const CARD_COLORS = ['#f4f4f2', '#e9e6dc', '#dfe9f0'] as const;
export const PIN_COLORS: readonly PinColor[] = ['red', 'green', 'blue', 'yellow', 'white'];

export const KIND_LABEL: Record<NoteKind, string> = {
  sticky: 'Sticky note',
  index: 'Index card',
  lined: 'Lined paper',
  polaroid: 'Photo',
  card: 'Card',
};

const SIZES: Record<NoteKind, { w: number; h: number }> = {
  sticky: { w: 210, h: 210 },
  index: { w: 320, h: 200 },
  lined: { w: 240, h: 320 },
  polaroid: { w: 230, h: 270 },
  card: { w: 300, h: 210 },
};

export type Random = () => number;

export function pick<T>(items: readonly T[], rnd: Random): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

export function newId(rnd: Random = Math.random): string {
  return `${Date.now().toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`;
}

export function emptyBoard(orientation: Orientation = 'landscape'): Board {
  return { version: 1, title: 'My board', orientation, notes: [] };
}

export function topZ(notes: readonly Note[]): number {
  return notes.reduce((m, n) => Math.max(m, n.z), 0);
}

export function clampToBoard(note: Pick<Note, 'x' | 'y' | 'w' | 'h'>, orientation: Orientation) {
  const { w, h } = BOARD_SIZE[orientation];
  const margin = 12;
  return {
    x: Math.round(Math.min(Math.max(note.x, margin), w - note.w - margin)),
    y: Math.round(Math.min(Math.max(note.y, margin), h - note.h - margin)),
  };
}

function overlap(a: Pick<Note, 'x' | 'y' | 'w' | 'h'>, b: Pick<Note, 'x' | 'y' | 'w' | 'h'>): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

/** Try a few random spots and keep the one that covers existing notes the least. */
export function findSpot(
  size: { w: number; h: number },
  notes: readonly Note[],
  orientation: Orientation,
  rnd: Random,
  tries = 24,
): { x: number; y: number } {
  const board = BOARD_SIZE[orientation];
  let best = { x: 0, y: 0 };
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < tries; i++) {
    const cand = {
      x: 30 + rnd() * (board.w - size.w - 60),
      y: 30 + rnd() * (board.h - size.h - 60),
      ...size,
    };
    const score = notes.reduce((s, n) => s + overlap(cand, n), 0);
    if (score < bestScore) {
      bestScore = score;
      best = { x: cand.x, y: cand.y };
      if (score === 0) break;
    }
  }
  return clampToBoard({ ...best, ...size }, orientation);
}

export function createNote(
  kind: NoteKind,
  board: Board,
  opts: { at?: { x: number; y: number }; color?: string; rnd?: Random; now?: number } = {},
): Note {
  const rnd = opts.rnd ?? Math.random;
  const now = opts.now ?? Date.now();
  const size = SIZES[kind];
  const pos = opts.at
    ? clampToBoard({ x: opts.at.x - size.w / 2, y: opts.at.y - size.h / 2, ...size }, board.orientation)
    : findSpot(size, board.notes, board.orientation, rnd);
  const color =
    opts.color ??
    (kind === 'sticky' ? pick(STICKY_COLORS, rnd) : kind === 'card' ? pick(CARD_COLORS, rnd) : '#ffffff');
  return {
    id: newId(rnd),
    kind,
    ...pos,
    ...size,
    rotation: Math.round((rnd() * 8 - 4) * 10) / 10,
    color,
    pin: kind === 'polaroid' ? 'blue' : kind === 'card' ? 'green' : pick(PIN_COLORS.slice(0, 4), rnd),
    text: '',
    z: topZ(board.notes) + 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Lift a note above the others without letting z grow forever. */
export function bringToFront(notes: Note[], id: string): Note[] {
  const target = notes.find((n) => n.id === id);
  if (!target || target.z === topZ(notes)) return notes;
  const ordered = [...notes].sort((a, b) => a.z - b.z).filter((n) => n.id !== id);
  ordered.push(target);
  const zOf = new Map(ordered.map((n, i) => [n.id, i + 1]));
  return notes.map((n) => ({ ...n, z: zOf.get(n.id) ?? n.z }));
}

/** Re-fit notes when switching orientation so nothing ends up off the board. */
export function reorient(board: Board, orientation: Orientation): Board {
  const from = BOARD_SIZE[board.orientation];
  const to = BOARD_SIZE[orientation];
  return {
    ...board,
    orientation,
    notes: board.notes.map((n) => ({
      ...n,
      ...clampToBoard({ ...n, x: (n.x / from.w) * to.w, y: (n.y / from.h) * to.h }, orientation),
    })),
  };
}

// ------------------------------------------------------------- import/export

const KINDS: readonly NoteKind[] = ['sticky', 'index', 'lined', 'polaroid', 'card'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

export type ParseResult = { ok: true; board: Board } | { ok: false; error: string };

/** Validate untrusted JSON (an imported file or old storage). Unknown fields are dropped. */
export function parseBoard(input: unknown): ParseResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Not a board file' };
  const b = input as Record<string, unknown>;
  if (b.version !== 1) return { ok: false, error: 'Unsupported board version' };
  const orientation: Orientation = b.orientation === 'portrait' ? 'portrait' : 'landscape';
  if (!Array.isArray(b.notes)) return { ok: false, error: 'Board has no notes list' };
  if (b.notes.length > 500) return { ok: false, error: 'Too many notes (max 500)' };
  const notes: Note[] = [];
  for (const [i, raw] of b.notes.entries()) {
    const n = raw as Record<string, unknown>;
    if (!n || typeof n !== 'object' || !KINDS.includes(n.kind as NoteKind)) {
      return { ok: false, error: `Note ${i + 1}: unknown kind` };
    }
    if (![n.x, n.y, n.w, n.h, n.rotation, n.z].every(isNum) || !isStr(n.id) || !isStr(n.text)) {
      return { ok: false, error: `Note ${i + 1}: missing fields` };
    }
    if (n.image !== undefined && !(isStr(n.image) && n.image.startsWith('data:image/'))) {
      return { ok: false, error: `Note ${i + 1}: image must be a data URL` };
    }
    const w = Math.min(Math.max(n.w as number, 80), 600);
    const h = Math.min(Math.max(n.h as number, 80), 600);
    notes.push({
      id: n.id as string,
      kind: n.kind as NoteKind,
      w,
      h,
      ...clampToBoard({ x: n.x as number, y: n.y as number, w, h }, orientation),
      rotation: Math.max(-15, Math.min(15, n.rotation as number)),
      color: isStr(n.color) && /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : '#fff27a',
      pin: PIN_COLORS.includes(n.pin as PinColor) ? (n.pin as PinColor) : 'red',
      text: (n.text as string).slice(0, 2000),
      image: n.image as string | undefined,
      z: n.z as number,
      createdAt: isNum(n.createdAt) ? n.createdAt : Date.now(),
      updatedAt: isNum(n.updatedAt) ? n.updatedAt : Date.now(),
    });
  }
  return {
    ok: true,
    board: { version: 1, title: isStr(b.title) ? b.title.slice(0, 80) : 'My board', orientation, notes },
  };
}
