import type { Board, Note } from './board';
import { agenda, type DueState, parseDue } from './dates';
import { parseWorkspace } from './workspace';

/**
 * The desktop widget: what it shows and how it looks. The settings live in
 * the URL (#widget?show=…&theme=…) so each widget window or wallpaper link
 * keeps its own, and the last choice is remembered as the default.
 */
export type DeskPart = 'clock' | 'today' | 'week' | 'board';
export type DeskTheme = 'sticky' | 'paper' | 'dark';

export interface DeskConfig {
  parts: DeskPart[];
  theme: DeskTheme;
  boardId: string | null;
  /** full-screen wallpaper layout (for Lively Wallpaper) */
  wall: boolean;
}

export const DESK_PARTS: { id: DeskPart; label: string; icon: string; hint: string }[] = [
  { id: 'clock', label: 'Date & clock', icon: '🕒', hint: 'big weekday, date and time' },
  { id: 'today', label: "Today's reminders", icon: '⏰', hint: 'overdue and due today' },
  { id: 'week', label: 'Coming up', icon: '📅', hint: 'the next 7 days' },
  { id: 'board', label: 'A board', icon: '📌', hint: 'a live mini board' },
];

export const DESK_THEMES: { id: DeskTheme; label: string }[] = [
  { id: 'sticky', label: 'Sticky' },
  { id: 'paper', label: 'Paper' },
  { id: 'dark', label: 'Dark' },
];

export const DEFAULT_DESK: DeskConfig = { parts: ['clock', 'today', 'week', 'board'], theme: 'sticky', boardId: null, wall: false };

const PART_IDS = DESK_PARTS.map((p) => p.id);
const THEME_IDS = DESK_THEMES.map((t) => t.id);

export function sanitizeDesk(raw: Partial<DeskConfig> | null | undefined, base: DeskConfig = DEFAULT_DESK): DeskConfig {
  const parts = Array.isArray(raw?.parts) ? PART_IDS.filter((p) => raw!.parts!.includes(p)) : base.parts;
  return {
    parts: parts.length ? parts : base.parts,
    theme: raw?.theme && THEME_IDS.includes(raw.theme) ? raw.theme : base.theme,
    boardId: typeof raw?.boardId === 'string' && raw.boardId ? raw.boardId.slice(0, 64) : raw?.boardId === null ? null : base.boardId,
    wall: typeof raw?.wall === 'boolean' ? raw.wall : base.wall,
  };
}

/** `#widget?show=clock,today&theme=dark&board=b1&wall=1&snap=…` → settings + snapshot */
export function parseDeskHash(hash: string, base: DeskConfig = DEFAULT_DESK): { config: DeskConfig; snap: string | null; custom: boolean } {
  const q = hash.indexOf('?');
  if (!hash.startsWith('#widget') || q < 0) return { config: base, snap: null, custom: false };
  const p = new URLSearchParams(hash.slice(q + 1));
  const config = sanitizeDesk(
    {
      parts: p.has('show') ? (p.get('show')!.split(',') as DeskPart[]) : undefined,
      theme: (p.get('theme') as DeskTheme) ?? undefined,
      boardId: p.get('board') ?? undefined,
      wall: p.has('wall') ? p.get('wall') === '1' : undefined,
    },
    base,
  );
  return { config, snap: p.get('snap'), custom: true };
}

export function deskHash(c: DeskConfig, snap?: string): string {
  const p = new URLSearchParams();
  p.set('show', c.parts.join(','));
  p.set('theme', c.theme);
  if (c.boardId && c.parts.includes('board')) p.set('board', c.boardId);
  if (c.wall) p.set('wall', '1');
  if (snap) p.set('snap', snap);
  return `#widget?${p.toString()}`;
}

/** Size of the widget window (and of the preview, scaled down). */
export function deskWindowSize(c: Pick<DeskConfig, 'parts'>): { w: number; h: number } {
  if (c.parts.includes('board')) return { w: 860, h: c.parts.length === 1 ? 500 : 560 };
  return { w: 380, h: 160 + c.parts.length * 150 };
}

export interface DeskItem {
  note: Note;
  board: Board;
  state: DueState;
}

/** Today's list (overdue + today) and the coming week (tomorrow … 7 days). */
export function deskLists(boards: readonly Board[], now: Date): { today: DeskItem[]; week: DeskItem[] } {
  const groups = agenda(boards, now);
  const pick = (states: DueState[]) =>
    groups.filter((g) => states.includes(g.state)).flatMap((g) => g.items.map((i) => ({ ...i, state: g.state })));
  const week = pick(['tomorrow', 'week', 'later']).filter((i) => {
    const days = (parseDue(i.note.due!).getTime() - now.getTime()) / 86_400_000;
    return days <= 7;
  });
  return { today: pick(['overdue', 'today']), week };
}

// ------------------------------------------------------------- snapshots
//
// Lively Wallpaper shows web pages in its own browser, which can't see the
// boards saved in Edge/Chrome. So the wallpaper link carries a small copy:
// the chosen board and the dated notes, without photos.

export interface DeskSnapshot {
  v: 1;
  at: number;
  boards: Board[];
}

export function makeSnapshot(boards: readonly Board[], config: DeskConfig, now = Date.now()): DeskSnapshot {
  const strip = (n: Note): Note => {
    const { image: _image, notified: _notified, ...rest } = n;
    return rest as Note;
  };
  const keepBoard = config.parts.includes('board') ? config.boardId ?? boards[0]?.id : null;
  const out: Board[] = [];
  for (const b of boards) {
    const notes = b.id === keepBoard ? b.notes : b.notes.filter((n) => n.due && !n.done);
    if (notes.length || b.id === keepBoard) out.push({ ...b, notes: notes.map(strip) });
  }
  return { v: 1, at: now, boards: out };
}

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(bytes as BodyInit).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** JSON → deflate → base64url ("z…"); plain base64url ("j…") where compression is missing. */
export async function encodeSnapshot(s: DeskSnapshot): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(s));
  if (typeof CompressionStream === 'undefined') return `j${b64url(json)}`;
  return `z${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

export async function decodeSnapshot(code: string): Promise<DeskSnapshot | null> {
  try {
    const raw = unb64url(code.slice(1));
    const bytes = code[0] === 'z' ? await pipe(raw, new DecompressionStream('deflate-raw')) : raw;
    const s = JSON.parse(new TextDecoder().decode(bytes));
    if (s?.v !== 1 || typeof s.at !== 'number') return null;
    // the link is untrusted input: run it through the same checks as an imported file
    const ws = parseWorkspace({ version: 2, boards: s.boards, camera: null });
    return ws.ok ? { v: 1, at: s.at, boards: ws.workspace.boards } : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------- the board as a wallpaper
//
// #wall?board=…  one board filling the screen, editable, every other control
// folded into one round button. `bg` is the plain backdrop around it; `snap`
// carries the board for Lively Wallpaper (its browser has its own storage).

export type WallBg = 'light' | 'dark';

export function wallHash(boardId: string | null, bg: WallBg = 'light', snap?: string): string {
  const p = new URLSearchParams();
  if (boardId) p.set('board', boardId.slice(0, 64));
  if (bg !== 'light') p.set('bg', bg);
  if (snap) p.set('snap', snap);
  const q = p.toString();
  return q ? `#wall?${q}` : '#wall';
}

export function parseWallHash(hash: string): { boardId: string | null; bg: WallBg; snap: string | null } | null {
  if (hash !== '#wall' && !hash.startsWith('#wall?')) return null;
  const p = new URLSearchParams(hash.slice(6));
  const board = p.get('board');
  return {
    boardId: board ? board.slice(0, 64) : null,
    bg: p.get('bg') === 'dark' ? 'dark' : 'light',
    snap: p.get('snap'),
  };
}

/** The board people most likely want on their wall: a weekly planner if there is one. */
export function defaultWallBoard(boards: readonly Board[], active: Board | null): Board | null {
  return boards.find((b) => /weekly planner/i.test(b.title)) ?? active ?? boards[0] ?? null;
}

export function boardSnapshot(board: Board, now = Date.now()): DeskSnapshot {
  return makeSnapshot([board], { parts: ['board'], theme: 'sticky', boardId: board.id, wall: true }, now);
}
