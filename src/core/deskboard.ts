/**
 * The desktop board: a pegboard that fills the screen behind your windows
 * (#desktop, and in the Windows app as the desktop background), with a to-do
 * list for today, sticky notes, a calendar with the boards' agenda, a focus
 * timer, the day's progress and a journal.
 *
 * Everything here is plain data and pure functions; DesktopBoard.vue keeps the
 * state in localStorage and in step between windows.
 */

export type WidgetId = 'clock' | 'todo' | 'calendar' | 'timer' | 'progress' | 'journal';
export type TimerMode = 'focus' | 'break' | 'long';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  /** the day it was ticked (YYYY-MM-DD) */
  doneOn: string | null;
}

export interface Sticky {
  id: string;
  text: string;
  color: string;
  /** top-left corner as a fraction of the screen (0..1), so it survives a new screen size */
  x: number;
  y: number;
  rot: number;
}

export interface DayStats {
  sessions: number;
  minutes: number;
}

export interface JournalEntry {
  text: string;
  /** index into MOODS, or null */
  mood: number | null;
}

export interface Timer {
  mode: TimerMode;
  /** running: when it rings (ms since 1970); paused or stopped: null */
  endsAt: number | null;
  /** paused: what was left; stopped: the full length */
  leftMs: number;
  /** focus sessions finished in a row, for the long break after every fourth */
  streak: number;
}

export interface Pos {
  x: number;
  y: number;
}

export interface DeskBoard {
  version: 1;
  todos: Todo[];
  stickies: Sticky[];
  days: Record<string, DayStats>;
  journal: Record<string, JournalEntry>;
  timer: Timer;
  /** minutes for each timer mode */
  lengths: Record<TimerMode, number>;
  /** where each widget hangs, as fractions of the screen; missing: its default place */
  layout: Partial<Record<WidgetId, Pos>>;
  hidden: WidgetId[];
}

export const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'clock', label: 'Date & clock' },
  { id: 'todo', label: 'To-do today' },
  { id: 'calendar', label: 'Calendar & agenda' },
  { id: 'timer', label: 'Focus timer' },
  { id: 'progress', label: 'Progress' },
  { id: 'journal', label: 'Journal' },
];

/** Default places: three columns, left to right. */
export const DEFAULT_LAYOUT: Record<WidgetId, Pos> = {
  clock: { x: 0.03, y: 0.04 },
  todo: { x: 0.03, y: 0.32 },
  calendar: { x: 0.37, y: 0.04 },
  timer: { x: 0.7, y: 0.09 },
  progress: { x: 0.7, y: 0.48 },
  journal: { x: 0.37, y: 0.6 },
};

export const MODE_LABEL: Record<TimerMode, string> = { focus: 'Focus', break: 'Break', long: 'Long break' };
export const DEFAULT_LENGTHS: Record<TimerMode, number> = { focus: 25, break: 5, long: 15 };
export const MOODS = ['😣', '😕', '😐', '🙂', '😄'] as const;
export const MOOD_LABEL = ['rough', 'meh', 'okay', 'good', 'great'] as const;
export const STICKY_TINTS = ['#fff27a', '#ffb3c7', '#a8dcff', '#b8f2c4', '#ffd29a', '#d9c8ff'] as const;

const MAX_TODOS = 200;
const MAX_STICKIES = 60;
const MAX_TEXT = 2000;
const MAX_JOURNAL = 20_000;

export function emptyDeskBoard(): DeskBoard {
  return {
    version: 1,
    todos: [],
    stickies: [],
    days: {},
    journal: {},
    timer: { mode: 'focus', endsAt: null, leftMs: DEFAULT_LENGTHS.focus * 60_000, streak: 0 },
    lengths: { ...DEFAULT_LENGTHS },
    layout: {},
    hidden: [],
  };
}

/** A first look that isn't empty: a few things to tick and two notes. */
export function welcomeDeskBoard(rnd: () => number = Math.random): DeskBoard {
  let s = emptyDeskBoard();
  for (const t of ['Plan the day', 'One focus session', 'Write a line in the journal']) s = addTodo(s, t, rnd);
  s = addSticky(s, { x: 0.74, y: 0.79 }, rnd, 'Drag me anywhere.\nDouble-click the pegboard for a new note.');
  s = addSticky(s, { x: 0.05, y: 0.76 }, rnd, 'This board stays behind your windows ✨');
  s.stickies[1].color = STICKY_TINTS[2];
  return s;
}

// ------------------------------------------------------------------ days

/** "2026-11-27" in local time */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newId(rnd: () => number = Math.random): string {
  return Math.floor(rnd() * 36 ** 8).toString(36).padStart(8, '0') + Date.now().toString(36).slice(-4);
}

// ------------------------------------------------------------------ to-do

export function addTodo(s: DeskBoard, text: string, rnd: () => number = Math.random): DeskBoard {
  const t = text.trim().slice(0, MAX_TEXT);
  if (!t || s.todos.length >= MAX_TODOS) return s;
  return { ...s, todos: [...s.todos, { id: newId(rnd), text: t, done: false, doneOn: null }] };
}

export function toggleTodo(s: DeskBoard, id: string, today: string): DeskBoard {
  return {
    ...s,
    todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneOn: t.done ? null : today } : t)),
  };
}

export function editTodo(s: DeskBoard, id: string, text: string): DeskBoard {
  const t = text.trim().slice(0, MAX_TEXT);
  if (!t) return removeTodo(s, id);
  return { ...s, todos: s.todos.map((x) => (x.id === id ? { ...x, text: t } : x)) };
}

export function removeTodo(s: DeskBoard, id: string): DeskBoard {
  return { ...s, todos: s.todos.filter((t) => t.id !== id) };
}

/** Today's list: everything still open, and what was ticked today. Older ticked ones drop off. */
export function todayTodos(s: DeskBoard, today: string): Todo[] {
  return s.todos.filter((t) => !t.done || t.doneOn === today);
}

/** Forget ticked to-dos from earlier days (kept in the day's count). */
export function pruneTodos(s: DeskBoard, today: string): DeskBoard {
  const todos = s.todos.filter((t) => !t.done || t.doneOn === today);
  return todos.length === s.todos.length ? s : { ...s, todos };
}

// ------------------------------------------------------------------ sticky notes

export function clampPos(p: Pos): Pos {
  const c = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 0.97) : 0);
  return { x: c(p.x), y: c(p.y) };
}

export function addSticky(s: DeskBoard, at: Pos, rnd: () => number = Math.random, text = ''): DeskBoard {
  if (s.stickies.length >= MAX_STICKIES) return s;
  const color = STICKY_TINTS[s.stickies.length % STICKY_TINTS.length];
  const rot = Math.round((rnd() * 6 - 3) * 10) / 10;
  return { ...s, stickies: [...s.stickies, { id: newId(rnd), text: text.slice(0, MAX_TEXT), color, rot, ...clampPos(at) }] };
}

export function updateSticky(s: DeskBoard, id: string, patch: Partial<Omit<Sticky, 'id'>>): DeskBoard {
  return {
    ...s,
    stickies: s.stickies.map((n) => {
      if (n.id !== id) return n;
      const next = { ...n, ...patch };
      if (typeof patch.text === 'string') next.text = patch.text.slice(0, MAX_TEXT);
      return { ...next, ...clampPos(next) };
    }),
  };
}

export function removeSticky(s: DeskBoard, id: string): DeskBoard {
  return { ...s, stickies: s.stickies.filter((n) => n.id !== id) };
}

/** Bring a note to the front (the last one is drawn on top). */
export function raiseSticky(s: DeskBoard, id: string): DeskBoard {
  const i = s.stickies.findIndex((n) => n.id === id);
  if (i < 0 || i === s.stickies.length - 1) return s;
  const list = [...s.stickies];
  const [n] = list.splice(i, 1);
  return { ...s, stickies: [...list, n] };
}

export function nextTint(color: string): string {
  const i = STICKY_TINTS.indexOf(color as (typeof STICKY_TINTS)[number]);
  return STICKY_TINTS[(i + 1) % STICKY_TINTS.length];
}

// ------------------------------------------------------------------ layout

export function widgetPos(s: DeskBoard, id: WidgetId): Pos {
  return s.layout[id] ?? DEFAULT_LAYOUT[id];
}

export function moveWidget(s: DeskBoard, id: WidgetId, p: Pos): DeskBoard {
  return { ...s, layout: { ...s.layout, [id]: clampPos(p) } };
}

export function toggleWidget(s: DeskBoard, id: WidgetId): DeskBoard {
  const hidden = s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id];
  return { ...s, hidden };
}

export function resetLayout(s: DeskBoard): DeskBoard {
  return { ...s, layout: {}, hidden: [] };
}

// ------------------------------------------------------------------ focus timer

const lengthMs = (s: DeskBoard, m: TimerMode) => s.lengths[m] * 60_000;

export function timerLeft(s: DeskBoard, now: number): number {
  const t = s.timer;
  return t.endsAt === null ? t.leftMs : Math.max(0, t.endsAt - now);
}

export const timerRunning = (s: DeskBoard) => s.timer.endsAt !== null;

export function startTimer(s: DeskBoard, now: number): DeskBoard {
  if (timerRunning(s)) return s;
  const left = s.timer.leftMs > 0 ? s.timer.leftMs : lengthMs(s, s.timer.mode);
  return { ...s, timer: { ...s.timer, endsAt: now + left } };
}

export function pauseTimer(s: DeskBoard, now: number): DeskBoard {
  if (!timerRunning(s)) return s;
  return { ...s, timer: { ...s.timer, endsAt: null, leftMs: timerLeft(s, now) } };
}

export function resetTimer(s: DeskBoard): DeskBoard {
  return { ...s, timer: { ...s.timer, endsAt: null, leftMs: lengthMs(s, s.timer.mode) } };
}

export function setMode(s: DeskBoard, mode: TimerMode): DeskBoard {
  return { ...s, timer: { ...s.timer, mode, endsAt: null, leftMs: lengthMs(s, mode) } };
}

/** Change a mode's minutes (1–120); a stopped timer of that mode shows the new length. */
export function setLength(s: DeskBoard, mode: TimerMode, minutes: number): DeskBoard {
  const m = Math.min(Math.max(Math.round(minutes) || 1, 1), 120);
  const next = { ...s, lengths: { ...s.lengths, [mode]: m } };
  const t = s.timer;
  const untouched = t.endsAt === null && t.leftMs === lengthMs(s, t.mode);
  return t.mode === mode && untouched ? { ...next, timer: { ...t, leftMs: m * 60_000 } } : next;
}

export interface Finished {
  state: DeskBoard;
  /** the mode that just ended */
  ended: TimerMode;
}

/**
 * The running timer reached zero: count a focus session on the day it ended,
 * then line up the next mode (a break, a long break after every fourth focus,
 * focus after a break). The next one waits for Start.
 */
export function finishTimer(s: DeskBoard, now: number): Finished | null {
  if (!timerRunning(s) || timerLeft(s, now) > 0) return null;
  const ended = s.timer.mode;
  let state = s;
  let streak = s.timer.streak;
  if (ended === 'focus') {
    const day = dayKey(new Date(s.timer.endsAt!));
    const before = s.days[day] ?? { sessions: 0, minutes: 0 };
    state = { ...state, days: { ...state.days, [day]: { sessions: before.sessions + 1, minutes: before.minutes + s.lengths.focus } } };
    streak += 1;
  }
  const next: TimerMode = ended === 'focus' ? (streak % 4 === 0 ? 'long' : 'break') : 'focus';
  if (ended === 'long') streak = 0;
  return { state: { ...state, timer: { mode: next, endsAt: null, leftMs: lengthMs(state, next), streak } }, ended };
}

/** "24:59" */
export function clockText(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ progress

export interface Progress {
  sessions: number;
  minutes: number;
  tasksDone: number;
  tasksTotal: number;
}

export function progress(s: DeskBoard, today: string): Progress {
  const d = s.days[today] ?? { sessions: 0, minutes: 0 };
  const list = todayTodos(s, today);
  return { sessions: d.sessions, minutes: d.minutes, tasksDone: list.filter((t) => t.done).length, tasksTotal: list.length };
}

/** Focus minutes for the last 7 days, oldest first, ending today. */
export function lastWeek(s: DeskBoard, today: Date): { day: string; label: string; minutes: number }[] {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({ day: key, label: 'SMTWTFS'[d.getDay()], minutes: s.days[key]?.minutes ?? 0 });
  }
  return out;
}

// ------------------------------------------------------------------ journal

export function setJournal(s: DeskBoard, day: string, patch: Partial<JournalEntry>): DeskBoard {
  const before = s.journal[day] ?? { text: '', mood: null };
  const entry: JournalEntry = { ...before, ...patch };
  entry.text = entry.text.slice(0, MAX_JOURNAL);
  const journal = { ...s.journal };
  if (!entry.text.trim() && entry.mood === null) delete journal[day];
  else journal[day] = entry;
  return { ...s, journal };
}

/** Days with an entry, newest first. */
export function journalDays(s: DeskBoard): string[] {
  return Object.keys(s.journal).sort().reverse();
}

// ------------------------------------------------------------------ calendar

/** The month as weeks of days, Monday first; days of other months are null. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ------------------------------------------------------------------ loading

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES: TimerMode[] = ['focus', 'break', 'long'];
const IDS = WIDGETS.map((w) => w.id);

/** Read saved data, keeping what makes sense and dropping the rest. */
export function sanitizeDeskBoard(raw: unknown): DeskBoard {
  const base = emptyDeskBoard();
  if (!isObj(raw)) return base;
  const todos: Todo[] = (Array.isArray(raw.todos) ? raw.todos : [])
    .filter(isObj)
    .map((t) => ({
      id: str(t.id, 40) || newId(),
      text: str(t.text),
      done: !!t.done,
      doneOn: typeof t.doneOn === 'string' && DAY_RE.test(t.doneOn) ? t.doneOn : null,
    }))
    .filter((t) => t.text.trim())
    .slice(0, MAX_TODOS);
  const stickies: Sticky[] = (Array.isArray(raw.stickies) ? raw.stickies : [])
    .filter(isObj)
    .map((n) => ({
      id: str(n.id, 40) || newId(),
      text: str(n.text),
      color: /^#[0-9a-f]{6}$/i.test(str(n.color, 7)) ? str(n.color, 7) : STICKY_TINTS[0],
      rot: Math.min(Math.max(num(n.rot, 0), -8), 8),
      ...clampPos({ x: num(n.x, 0.5), y: num(n.y, 0.5) }),
    }))
    .slice(0, MAX_STICKIES);
  const days: Record<string, DayStats> = {};
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (DAY_RE.test(k) && isObj(v)) days[k] = { sessions: Math.max(0, num(v.sessions, 0)), minutes: Math.max(0, num(v.minutes, 0)) };
    }
  }
  const journal: Record<string, JournalEntry> = {};
  if (isObj(raw.journal)) {
    for (const [k, v] of Object.entries(raw.journal)) {
      if (!DAY_RE.test(k) || !isObj(v)) continue;
      const mood = typeof v.mood === 'number' && v.mood >= 0 && v.mood < MOODS.length ? Math.floor(v.mood) : null;
      journal[k] = { text: str(v.text, MAX_JOURNAL), mood };
    }
  }
  const lengths = { ...DEFAULT_LENGTHS };
  if (isObj(raw.lengths)) {
    for (const m of MODES) lengths[m] = Math.min(Math.max(Math.round(num(raw.lengths[m], lengths[m])), 1), 120);
  }
  const t = isObj(raw.timer) ? raw.timer : {};
  const mode = MODES.includes(t.mode as TimerMode) ? (t.mode as TimerMode) : 'focus';
  const timer: Timer = {
    mode,
    endsAt: typeof t.endsAt === 'number' && Number.isFinite(t.endsAt) ? t.endsAt : null,
    leftMs: Math.min(Math.max(num(t.leftMs, lengths[mode] * 60_000), 0), 120 * 60_000),
    streak: Math.max(0, Math.floor(num(t.streak, 0))),
  };
  const layout: Partial<Record<WidgetId, Pos>> = {};
  if (isObj(raw.layout)) {
    for (const id of IDS) {
      const p = raw.layout[id];
      if (isObj(p)) layout[id] = clampPos({ x: num(p.x, 0), y: num(p.y, 0) });
    }
  }
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter((h): h is WidgetId => IDS.includes(h as WidgetId));
  return { version: 1, todos, stickies, days, journal, timer, lengths, layout, hidden: [...new Set(hidden)] };
}
