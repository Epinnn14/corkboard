import type { Board, Note } from './board';
import { agenda, type DueState, parseDue } from './dates';

/**
 * The desktop widget: what it shows and how it looks. The settings live in
 * the URL (#widget?show=…&theme=…) so a widget window can keep its own, and
 * the last choice is remembered as the default.
 */
export type DeskPart = 'clock' | 'today' | 'week' | 'board';
export type DeskTheme = 'cork' | 'paper' | 'dark';

export interface DeskConfig {
  parts: DeskPart[];
  theme: DeskTheme;
  boardId: string | null;
}

export const DESK_PARTS: { id: DeskPart; label: string; icon: string; hint: string }[] = [
  { id: 'clock', label: 'Date & clock', icon: '🗓️', hint: 'a tear-off calendar page and the time' },
  { id: 'today', label: "Today's reminders", icon: '⏰', hint: 'overdue and due today, tick them off' },
  { id: 'week', label: 'Coming up', icon: '📅', hint: 'the next 7 days' },
  { id: 'board', label: 'A board', icon: '📌', hint: 'a live mini board' },
];

export const DESK_THEMES: { id: DeskTheme; label: string }[] = [
  { id: 'cork', label: 'Cork' },
  { id: 'paper', label: 'Paper' },
  { id: 'dark', label: 'Dark' },
];

export const DEFAULT_DESK: DeskConfig = { parts: ['clock', 'today', 'week'], theme: 'cork', boardId: null };

const PART_IDS = DESK_PARTS.map((p) => p.id);
const THEME_IDS = DESK_THEMES.map((t) => t.id);

export function sanitizeDesk(raw: Partial<DeskConfig> | null | undefined, base: DeskConfig = DEFAULT_DESK): DeskConfig {
  const parts = Array.isArray(raw?.parts) ? PART_IDS.filter((p) => raw!.parts!.includes(p)) : base.parts;
  // v1.4 called the cork look "sticky"
  const theme = (raw?.theme as string) === 'sticky' ? 'cork' : raw?.theme;
  return {
    parts: parts.length ? parts : base.parts,
    theme: theme && THEME_IDS.includes(theme) ? theme : base.theme,
    boardId: typeof raw?.boardId === 'string' && raw.boardId ? raw.boardId.slice(0, 64) : raw?.boardId === null ? null : base.boardId,
  };
}

/** `#widget?show=clock,today&theme=dark&board=b1` → settings */
export function parseDeskHash(hash: string, base: DeskConfig = DEFAULT_DESK): { config: DeskConfig; custom: boolean } {
  const q = hash.indexOf('?');
  if (!hash.startsWith('#widget') || q < 0) return { config: base, custom: false };
  const p = new URLSearchParams(hash.slice(q + 1));
  const config = sanitizeDesk(
    {
      parts: p.has('show') ? (p.get('show')!.split(',') as DeskPart[]) : undefined,
      theme: (p.get('theme') as DeskTheme) ?? undefined,
      boardId: p.get('board') ?? undefined,
    },
    base,
  );
  return { config, custom: true };
}

export function deskHash(c: DeskConfig): string {
  const p = new URLSearchParams();
  p.set('show', c.parts.join(','));
  p.set('theme', c.theme);
  if (c.boardId && c.parts.includes('board')) p.set('board', c.boardId);
  return `#widget?${p.toString()}`;
}

/** Size of the widget window (and of the preview, scaled down). */
export function deskWindowSize(c: Pick<DeskConfig, 'parts'>): { w: number; h: number } {
  const has = (p: DeskPart) => c.parts.includes(p);
  const column = 24 + (has('clock') ? 168 : 64) + (has('today') ? 210 : 0) + (has('week') ? 196 : 0);
  if (has('board')) return { w: c.parts.length === 1 ? 640 : 860, h: Math.max(470, column) };
  return { w: 360, h: column };
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

/** "Good morning" … by the hour. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
