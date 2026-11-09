/**
 * Due dates and reminders. Dates are stored as local wall time
 * ("2026-11-14T09:00"), the same string <input type="datetime-local"> uses.
 */
import type { Board, Note } from './board';

export type DueState = 'done' | 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At the time' },
  { value: 10, label: '10 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 60 * 24, label: '1 day before' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export function parseDue(due: string): Date {
  const [d, t] = due.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min);
}

export function toDue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY = 86_400_000;

export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
}

export function dueState(note: Pick<Note, 'due' | 'done'>, now: Date): DueState | null {
  if (!note.due) return null;
  if (note.done) return 'done';
  const due = parseDue(note.due);
  if (due.getTime() < now.getTime()) return 'overdue';
  const diff = dayDiff(due, now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

/** Short label for a note's date chip: "Today 09:00", "Tomorrow", "Fri 09:00", "14 Nov". */
export function dueLabel(due: string, now: Date): string {
  const d = parseDue(due);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = dayDiff(d, now);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  if (diff === -1) return `Yesterday ${time}`;
  if (diff > 1 && diff < 7) return `${DAYS[d.getDay()]} ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}, ${time}`;
}

/** Long date for headers and the widget: "Tuesday, 10 November 2026". */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Quick picks for the date editor. */
export function quickDates(now: Date): { label: string; due: string }[] {
  const at = (days: number, h: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, 0);
    return toDue(d);
  };
  const evening = now.getHours() < 17 ? at(0, 18) : at(1, 18);
  const nextMonday = (8 - now.getDay()) % 7 || 7;
  return [
    { label: now.getHours() < 17 ? 'This evening' : 'Tomorrow evening', due: evening },
    { label: 'Tomorrow 09:00', due: at(1, 9) },
    { label: 'Next Monday', due: at(nextMonday, 9) },
  ];
}

export function remindAt(note: Pick<Note, 'due' | 'remind'>): Date | null {
  if (!note.due || note.remind === undefined) return null;
  return new Date(parseDue(note.due).getTime() - note.remind * 60_000);
}

export const reminderKey = (n: Pick<Note, 'due' | 'remind'>) => `${n.due}|${n.remind}`;

export interface DueItem {
  note: Note;
  board: Board;
}

/** Reminders that should fire now: time reached, not done, not already shown, at most a day late. */
export function dueReminders(boards: readonly Board[], now: Date): DueItem[] {
  const out: DueItem[] = [];
  for (const board of boards) {
    for (const note of board.notes) {
      const at = remindAt(note);
      if (!at || note.done || note.notified === reminderKey(note)) continue;
      const t = at.getTime();
      if (t <= now.getTime() && now.getTime() - t < DAY) out.push({ note, board });
    }
  }
  return out;
}

export interface AgendaGroup {
  state: DueState;
  title: string;
  items: DueItem[];
}

const GROUPS: { state: DueState; title: string }[] = [
  { state: 'overdue', title: 'Overdue' },
  { state: 'today', title: 'Today' },
  { state: 'tomorrow', title: 'Tomorrow' },
  { state: 'week', title: 'This week' },
  { state: 'later', title: 'Later' },
  { state: 'done', title: 'Done' },
];

export function agenda(boards: readonly Board[], now: Date): AgendaGroup[] {
  const items: (DueItem & { state: DueState })[] = [];
  for (const board of boards) {
    for (const note of board.notes) {
      const state = dueState(note, now);
      if (state) items.push({ note, board, state });
    }
  }
  items.sort((a, b) => parseDue(a.note.due!).getTime() - parseDue(b.note.due!).getTime());
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.state === g.state) })).filter((g) => g.items.length);
}

/** How many things need attention (overdue + today) — for the agenda badge. */
export function attentionCount(boards: readonly Board[], now: Date): number {
  let n = 0;
  for (const b of boards) for (const note of b.notes) {
    const s = dueState(note, now);
    if (s === 'overdue' || s === 'today') n++;
  }
  return n;
}

export function noteTitle(note: Pick<Note, 'text' | 'kind'>): string {
  const first = note.text.split('\n').find((l) => l.trim())?.trim() ?? '';
  if (first) return first.length > 70 ? `${first.slice(0, 67)}…` : first;
  return note.kind === 'polaroid' ? 'Photo' : 'Untitled note';
}

// ------------------------------------------------------------- calendars

const icsDate = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
}

/** An .ics event (floating local time) with an alarm, for phone and laptop calendars. */
export function toIcs(note: Note, board: Board, now = new Date()): string {
  const start = parseDue(note.due!);
  const end = new Date(start.getTime() + 30 * 60_000);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//corkboard//EN',
    'BEGIN:VEVENT',
    `UID:${note.id}@corkboard`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(noteTitle(note))}`,
    `DESCRIPTION:${icsEscape(`${note.text}\n\nFrom the board “${board.title}”`)}`,
  ];
  if (note.remind !== undefined) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(noteTitle(note))}`, `TRIGGER:-PT${note.remind}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function googleCalendarUrl(note: Note, board: Board): string {
  const start = parseDue(note.due!);
  const end = new Date(start.getTime() + 30 * 60_000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: noteTitle(note),
    dates: `${icsDate(start)}/${icsDate(end)}`,
    details: `${note.text}\n\nFrom the board “${board.title}”`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
