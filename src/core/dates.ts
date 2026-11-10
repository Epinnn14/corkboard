/**
 * Due dates and reminders. Dates are stored as local wall time
 * ("2026-11-14T09:00"), the same string <input type="datetime-local"> uses.
 */
import type { Board, Note } from './board';
import { detectTimes } from './detect';

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

/**
 * One thing on the agenda: a note with a date (set with 📅), or a line of a
 * note with a time written in it ("buy milk 10.00", see detect.ts).
 */
export interface AgendaItem {
  key: string;
  note: Note;
  board: Board;
  due: string;
  title: string;
  done: boolean;
  state: DueState;
  /** found in the note's text: the line it came from */
  line?: number;
  /** where your own note on this item is kept (Note.memos) */
  memoKey: string;
  memo: string;
}

/** A detected line's memo follows its words and time, not its line number (lines move). */
export function memoKeyFor(title: string, due: string | null): string {
  return due === null ? 'due' : `${title.toLowerCase().replace(/\s+/g, ' ').trim()}@${due.slice(11, 16)}`;
}

function stateOf(due: string, done: boolean, now: Date): DueState {
  return dueState({ due, done }, now)!;
}

/** Everything with a time, from dates and from the notes' text, in time order. */
export function agendaItems(boards: readonly Board[], now: Date): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const board of boards) {
    for (const note of board.notes) {
      if (note.due) {
        const done = !!note.done;
        items.push({ key: note.id, note, board, due: note.due, title: noteTitle(note), done, state: stateOf(note.due, done, now), memoKey: 'due', memo: note.memos?.due ?? '' });
      }
      for (const d of detectTimes(note, now)) {
        const memoKey = memoKeyFor(d.title, d.due);
        items.push({
          key: `${note.id}#${d.line}`,
          note,
          board,
          due: d.due,
          title: d.title,
          done: d.done,
          state: stateOf(d.due, d.done, now),
          line: d.line,
          memoKey,
          memo: note.memos?.[memoKey] ?? '',
        });
      }
    }
  }
  return items.sort((a, b) => parseDue(a.due).getTime() - parseDue(b.due).getTime());
}

export interface AgendaGroup {
  state: DueState;
  title: string;
  items: AgendaItem[];
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
  const items = agendaItems(boards, now);
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.state === g.state) })).filter((g) => g.items.length);
}

export interface AgendaDay {
  /** 'overdue', or the day as YYYY-MM-DD */
  key: string;
  title: string;
  /** "Tue 10 Nov" under Today / Tomorrow, empty otherwise */
  sub: string;
  items: AgendaItem[];
}

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The agenda by day and time: what's late from earlier days first, then one
 * group per day from today on. Ticked items stay in their day, crossed out.
 */
export function agendaDays(boards: readonly Board[], now: Date): AgendaDay[] {
  const out: AgendaDay[] = [];
  const late: AgendaItem[] = [];
  const days = new Map<string, AgendaItem[]>();
  for (const i of agendaItems(boards, now)) {
    const diff = dayDiff(parseDue(i.due), now);
    if (diff < 0) {
      if (!i.done) late.push(i);
      continue;
    }
    const k = i.due.slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), i]);
  }
  if (late.length) out.push({ key: 'overdue', title: 'Overdue', sub: '', items: late });
  for (const [k, items] of days) {
    const d = parseDue(`${k}T00:00`);
    const diff = dayDiff(d, now);
    const short = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const title = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${LONG_DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    out.push({ key: k, title, sub: diff <= 1 ? short : '', items });
  }
  return out;
}

/** "10:00" */
export function timeOf(due: string): string {
  return due.slice(11, 16);
}

/** How many things need attention (overdue + today) — for the agenda badge. */
export function attentionCount(boards: readonly Board[], now: Date): number {
  return agendaItems(boards, now).filter((i) => i.state === 'overdue' || i.state === 'today').length;
}

/** Times written in notes ring at the time, once (`seen` remembers which already did). */
export function textReminders(boards: readonly Board[], now: Date, seen: ReadonlySet<string>): AgendaItem[] {
  return agendaItems(boards, now).filter((i) => {
    if (i.line === undefined || i.done || seen.has(textReminderKey(i))) return false;
    const t = parseDue(i.due).getTime();
    return t <= now.getTime() && now.getTime() - t < DAY;
  });
}
export const textReminderKey = (i: Pick<AgendaItem, 'note' | 'title' | 'due'>) => `${i.note.id}|${i.title}|${i.due}`;

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

/** Everything still to come, as one calendar file (Windows Calendar, Outlook, Google, Apple): one event each, alarm at the time. */
export function agendaToIcs(items: readonly AgendaItem[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//corkboard//EN'];
  for (const i of items) {
    if (i.done || parseDue(i.due).getTime() < now.getTime()) continue;
    const start = parseDue(i.due);
    const end = new Date(start.getTime() + 30 * 60_000);
    const remind = i.line === undefined ? i.note.remind : 0;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${i.key.replace(/#/g, '-')}-${i.due.replace(/[-:T]/g, '')}@corkboard`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(i.title)}`,
      `DESCRIPTION:${icsEscape(`${i.memo ? `${i.memo}\n\n` : ''}From the board “${i.board.title}”`)}`,
    );
    if (remind !== undefined) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(i.title)}`, `TRIGGER:-PT${remind}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
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
