/**
 * Times written in a note's text become agenda items, no date picker needed:
 *
 *   MONDAY              ← a day as the first line sets the day for the lines below
 *   buy milk 10.00      → Monday 10:00 · buy milk
 *   meeting 11:30       → Monday 11:30 · meeting
 *   dentist fri 3pm     → Friday 15:00 · dentist (a day in the line wins)
 *   g̶y̶m̶ ̶1̶8̶.̶0̶0̶         → done: ticking it in the agenda or widget crosses the line out
 *   ✓ gym 18.00         → done too
 *
 * Days: today / tomorrow / weekday names (English and Indonesian), 12/11, 12 Nov,
 * 2026-11-12. A weekday means its next occurrence (today included). Without any
 * day, a line belongs to the day the note was last edited.
 * Times: 10.00, 10:00, 9.30, 3pm, 10.30am, "jam 10", "pukul 7.30".
 */
import type { Note } from './board';

const pad = (n: number) => String(n).padStart(2, '0');
const toDue = (d: Date, h: number, m: number) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, ahad: 0,
  monday: 1, mon: 1, senin: 1,
  tuesday: 2, tue: 2, tues: 2, selasa: 2,
  wednesday: 3, wed: 3, rabu: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, kamis: 4,
  friday: 5, fri: 5, jumat: 5, "jum'at": 5,
  saturday: 6, sat: 6, sabtu: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, januari: 0,
  feb: 1, february: 1, februari: 1,
  mar: 2, march: 2, maret: 2,
  apr: 3, april: 3,
  may: 4, mei: 4,
  jun: 5, june: 5, juni: 5,
  jul: 6, july: 6, juli: 6,
  aug: 7, august: 7, agu: 7, agt: 7, agustus: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, okt: 9, oktober: 9,
  nov: 10, november: 10, nopember: 10,
  dec: 11, december: 11, des: 11, desember: 11,
};
const RELATIVE: Record<string, number> = { today: 0, tonight: 0, 'hari ini': 0, 'malam ini': 0, 'nanti malam': 0, tomorrow: 1, tmr: 1, besok: 1, lusa: 2 };

const WEEKDAY_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`, 'iu');
// "minggu" is Sunday, but also "week": only as "hari minggu" or a heading on its own
const MINGGU_RE = /(?<![\p{L}])hari\s+minggu(?![\p{L}])/iu;
const RELATIVE_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(RELATIVE).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`, 'iu');
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const ISO_RE = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
const SLASH_RE = /(?<![\d.:/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/;
const DAY_MONTH_RE = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\.?(?:\\s+(\\d{4}))?(?![\\p{L}])`, 'iu');
const MONTH_DAY_RE = new RegExp(`(?<![\\p{L}])(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\d)`, 'iu');

interface Span {
  index: number;
  length: number;
}

/** A clock time in the line: 10.00, 10:00, 3pm, 10.30am, jam 10, pukul 7.30 */
export function findTime(line: string): (Span & { h: number; m: number }) | null {
  const ampm = (h: number, s?: string) => {
    if (!s) return h;
    const pm = s[0].toLowerCase() === 'p';
    return pm ? (h % 12) + 12 : h % 12;
  };
  let m = /(?:(?<![\p{L}])(?:jam|pukul|at|@)\s*)?(?<![\d.:/,])([01]?\d|2[0-3])[.:]([0-5]\d)(?:\s*([ap])\.?m\.?)?(?![\d.:]\d|\d)/iu.exec(line);
  if (m) {
    const h = Number(m[1]);
    if (m[3] && (h < 1 || h > 12)) return null;
    return { index: m.index, length: m[0].length, h: ampm(h, m[3]), m: Number(m[2]) };
  }
  m = /(?:(?<![\p{L}])(?:at|@)\s*)?(?<![\d.:/,])(1[0-2]|0?[1-9])\s*([ap])\.?m\.?(?![\p{L}])/iu.exec(line);
  if (m) return { index: m.index, length: m[0].length, h: ampm(Number(m[1]), m[2]), m: 0 };
  m = /(?<![\p{L}])(?:jam|pukul)\s+([01]?\d|2[0-3])(?![\d.:])/iu.exec(line);
  if (m) return { index: m.index, length: m[0].length, h: Number(m[1]), m: 0 };
  return null;
}

function nextWeekday(dow: number, now: Date): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

/** A calendar date without a year: this year, or next year if it's long gone. */
function dateWithoutYear(month: number, day: number, now: Date): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(now.getFullYear(), month, day);
  if (d.getMonth() !== month) return null;
  if (startOfDay(now).getTime() - d.getTime() > 60 * 86_400_000) d.setFullYear(d.getFullYear() + 1);
  return d;
}

function fullDate(y: number, month: number, day: number): Date | null {
  const year = y < 100 ? 2000 + y : y;
  const d = new Date(year, month, day);
  return d.getMonth() === month && d.getDate() === day ? d : null;
}

/** A day mentioned in the text: today, tomorrow, a weekday or a date. */
export function findDay(text: string, now: Date, heading = false): (Span & { date: Date }) | null {
  let m = ISO_RE.exec(text);
  if (m) {
    const d = fullDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d) return { index: m.index, length: m[0].length, date: d };
  }
  m = DAY_MONTH_RE.exec(text);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    const d = m[3] ? fullDate(Number(m[3]), month, Number(m[1])) : dateWithoutYear(month, Number(m[1]), now);
    if (d) return { index: m.index, length: m[0].length, date: d };
  }
  m = MONTH_DAY_RE.exec(text);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const d = m[3] ? fullDate(Number(m[3]), month, Number(m[2])) : dateWithoutYear(month, Number(m[2]), now);
    if (d) return { index: m.index, length: m[0].length, date: d };
  }
  m = SLASH_RE.exec(text);
  if (m) {
    // day/month, the way it's written in Indonesia and most of the world
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const d = m[3] ? fullDate(Number(m[3]), month, day) : dateWithoutYear(month, day, now);
    if (d) return { index: m.index, length: m[0].length, date: d };
  }
  m = RELATIVE_RE.exec(text);
  if (m) {
    const d = startOfDay(now);
    d.setDate(d.getDate() + RELATIVE[m[1].toLowerCase()]);
    return { index: m.index, length: m[0].length, date: d };
  }
  m = WEEKDAY_RE.exec(text);
  if (m) return { index: m.index, length: m[0].length, date: nextWeekday(WEEKDAYS[m[1].toLowerCase()], now) };
  m = MINGGU_RE.exec(text) ?? (heading ? /^minggu$/i.exec(text.trim()) : null);
  if (m) return { index: m.index, length: m[0].length, date: nextWeekday(0, now) };
  return null;
}

const DONE_RE = /^\s*(?:✓|✔|☑|\[x\])\s*/i;
/** U+0336 COMBINING LONG STROKE OVERLAY: crossed-out text that survives plain text */
const STRIKE = '\u0336';
const unstrike = (s: string) => s.split(STRIKE).join('');
const isStruck = (s: string) => s.includes(STRIKE);
const BULLET_RE = /^\s*(?:[-–—•*·]|\d+[.)])\s+/;

export interface Detected {
  /** line number in the note's text */
  line: number;
  title: string;
  due: string;
  done: boolean;
}

function clean(s: string): string {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:@–—-]+|[\s,;:@–—-]+$/g, '')
    .replace(/(?<![\p{L}])(?:at|on|jam|pukul|hari)$/iu, '')
    .replace(/^(?:at|on|jam|pukul)(?![\p{L}])/iu, '')
    .trim();
}

/** Every line of a note with a time in it, as a dated item. */
export function detectTimes(note: Pick<Note, 'text' | 'due' | 'updatedAt'>, now: Date): Detected[] {
  const lines = note.text.split('\n');
  const out: Detected[] = [];
  // a first line that is only a day ("MONDAY", "Senin", "12 Nov") sets the day for the note
  const first = lines.findIndex((l) => l.trim());
  let headingDay: Date | null = null;
  let headingText = '';
  if (first >= 0) {
    const t = unstrike(lines[first]).trim().replace(/[:.!]+$/, '');
    const d = findDay(t, now, true);
    if (d && clean(t.slice(0, d.index) + t.slice(d.index + d.length)) === '' && !findTime(t)) {
      headingDay = d.date;
      headingText = t;
    }
  }
  const fallback = startOfDay(new Date(note.updatedAt || now.getTime()));

  lines.forEach((line, i) => {
    if (i === first && headingDay) return;
    const raw = unstrike(line);
    const time = findTime(raw);
    if (!time) return;
    const done = DONE_RE.test(raw) || isStruck(line);
    let rest = raw.slice(0, time.index) + ' ' + raw.slice(time.index + time.length);
    const day = findDay(rest, now);
    if (day) rest = rest.slice(0, day.index) + ' ' + rest.slice(day.index + day.length);
    const date = day?.date ?? headingDay ?? fallback;
    let title = clean(rest.replace(DONE_RE, '').replace(BULLET_RE, ''));
    if (!title) title = headingText || 'Reminder';
    out.push({ line: i, title: title.length > 70 ? `${title.slice(0, 67)}…` : title, due: toDue(date, time.h, time.m), done });
  });
  // a time the note already has as its date isn't a second item
  return note.due ? out.filter((d) => d.due !== note.due) : out;
}

/** Tick or untick a line: crosses it out (or back in); an old ✓ in front goes too. */
export function toggleLineDone(text: string, line: number): string {
  const lines = text.split('\n');
  const l = lines[line];
  if (l === undefined) return text;
  if (isStruck(l) || DONE_RE.test(l)) {
    lines[line] = unstrike(l).replace(/^(\s*)(?:✓|✔|☑|\[x\])\s*/i, '$1');
  } else {
    const lead = /^\s*(?:(?:[-–—•*·]|\d+[.)])\s+)?/.exec(l)![0];
    const body = l.slice(lead.length).replace(/\s+$/, '');
    lines[line] = lead + Array.from(body, (c) => c + STRIKE).join('') + l.slice(lead.length + body.length);
  }
  return lines.join('\n');
}
