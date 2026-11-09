import { describe, expect, it } from 'vitest';
import { createNote, emptyBoard, type Note, parseBoard } from '../src/core/board';
import {
  agenda,
  attentionCount,
  dueLabel,
  dueReminders,
  dueState,
  googleCalendarUrl,
  noteTitle,
  parseDue,
  quickDates,
  reminderKey,
  remindAt,
  toDue,
  toIcs,
} from '../src/core/dates';

// Tuesday 10 Nov 2026, 14:30 local
const NOW = new Date(2026, 10, 10, 14, 30);
const board = emptyBoard('landscape', { x: 0, y: 0 }, 'Sprint');
const note = (text: string, due?: string, extra: Partial<Note> = {}): Note => ({
  ...createNote('sticky', board),
  text,
  ...(due ? { due } : {}),
  ...extra,
});

describe('due dates', () => {
  it('parse and format local wall time', () => {
    const d = parseDue('2026-11-14T09:05');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 14, 9, 5]);
    expect(toDue(d)).toBe('2026-11-14T09:05');
  });

  it('labels relative to today', () => {
    expect(dueLabel('2026-11-10T18:00', NOW)).toBe('Today 18:00');
    expect(dueLabel('2026-11-11T09:00', NOW)).toBe('Tomorrow 09:00');
    expect(dueLabel('2026-11-09T09:00', NOW)).toBe('Yesterday 09:00');
    expect(dueLabel('2026-11-13T09:00', NOW)).toBe('Fri 09:00');
    expect(dueLabel('2026-12-24T19:30', NOW)).toBe('Thu 24 Dec, 19:30');
    expect(dueLabel('2027-01-05T08:00', NOW)).toBe('Tue 5 Jan 2027, 08:00');
  });

  it('states', () => {
    expect(dueState(note('x'), NOW)).toBeNull();
    expect(dueState(note('x', '2026-11-10T14:00'), NOW)).toBe('overdue');
    expect(dueState(note('x', '2026-11-10T23:59'), NOW)).toBe('today');
    expect(dueState(note('x', '2026-11-11T00:00'), NOW)).toBe('tomorrow');
    expect(dueState(note('x', '2026-11-15T10:00'), NOW)).toBe('week');
    expect(dueState(note('x', '2026-11-30T10:00'), NOW)).toBe('later');
    expect(dueState(note('x', '2026-11-01T10:00', { done: true }), NOW)).toBe('done');
  });

  it('quick picks', () => {
    expect(quickDates(NOW).map((q) => [q.label, q.due])).toEqual([
      ['This evening', '2026-11-10T18:00'],
      ['Tomorrow 09:00', '2026-11-11T09:00'],
      ['Next Monday', '2026-11-16T09:00'],
    ]);
    expect(quickDates(new Date(2026, 10, 10, 20, 0))[0]).toEqual({ label: 'Tomorrow evening', due: '2026-11-11T18:00' });
  });
});

describe('reminders', () => {
  it('fire once when the time comes, never for done notes, not days late', () => {
    const a = note('stand-up', '2026-11-10T14:40', { remind: 10 }); // remind 14:30 → now
    const b = note('later', '2026-11-10T16:00', { remind: 10 });
    const c = note('no reminder', '2026-11-10T14:00');
    const d = note('done', '2026-11-10T14:00', { remind: 0, done: true });
    const e = note('ancient', '2026-11-01T09:00', { remind: 0 });
    const f = note('shown', '2026-11-10T14:00', { remind: 0 });
    f.notified = reminderKey(f);
    const b1 = { ...board, notes: [a, b, c, d, e, f] };
    expect(remindAt(a)?.getTime()).toBe(NOW.getTime());
    expect(dueReminders([b1], NOW).map((x) => x.note.text)).toEqual(['stand-up']);
    // changing the time re-arms the reminder
    f.due = '2026-11-10T14:10';
    expect(dueReminders([b1], NOW).map((x) => x.note.text)).toEqual(['stand-up', 'shown']);
  });
});

describe('agenda', () => {
  it('groups in order and counts what needs attention', () => {
    const b1 = {
      ...board,
      notes: [
        note('pay rent', '2026-11-30T09:00'),
        note('submit essay', '2026-11-09T23:59'),
        note('dentist', '2026-11-10T16:00'),
        note('gym', '2026-11-11T07:00'),
        note('old', '2026-11-05T07:00', { done: true }),
        note('undated'),
      ],
    };
    const g = agenda([b1], NOW);
    expect(g.map((x) => [x.title, x.items.map((i) => i.note.text)])).toEqual([
      ['Overdue', ['submit essay']],
      ['Today', ['dentist']],
      ['Tomorrow', ['gym']],
      ['Later', ['pay rent']],
      ['Done', ['old']],
    ]);
    expect(attentionCount([b1], NOW)).toBe(2);
  });

  it('noteTitle uses the first line', () => {
    expect(noteTitle({ kind: 'sticky', text: '\n  Buy milk\nand eggs' })).toBe('Buy milk');
    expect(noteTitle({ kind: 'polaroid', text: '' })).toBe('Photo');
    expect(noteTitle({ kind: 'index', text: 'x'.repeat(100) })).toHaveLength(68);
  });
});

describe('calendar export', () => {
  const n = note('Thesis meeting, room 3; bring draft', '2026-11-14T09:00', { remind: 60 });

  it('ics has a floating start, 30-min event and an alarm', () => {
    const ics = toIcs(n, board, NOW);
    expect(ics).toContain('DTSTART:20261114T090000\r\n');
    expect(ics).toContain('DTEND:20261114T093000\r\n');
    expect(ics).toContain('SUMMARY:Thesis meeting\\, room 3\\; bring draft');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(toIcs({ ...n, remind: undefined }, board)).not.toContain('VALARM');
  });

  it('google calendar link', () => {
    const url = new URL(googleCalendarUrl(n, board));
    expect(url.searchParams.get('dates')).toBe('20261114T090000/20261114T093000');
    expect(url.searchParams.get('text')).toBe('Thesis meeting, room 3; bring draft');
  });

  it('dates survive save/load and junk is dropped', () => {
    const b = { ...board, notes: [{ ...n, done: true, notified: 'k' }, { ...note('bad'), due: 'tomorrow', remind: -5 }] };
    const r = parseBoard(JSON.parse(JSON.stringify(b)));
    expect(r.ok && r.board.notes[0]).toMatchObject({ due: '2026-11-14T09:00', remind: 60, done: true, notified: 'k' });
    expect(r.ok && r.board.notes[1].due).toBeUndefined();
    expect(r.ok && r.board.notes[1].remind).toBeUndefined();
  });
});
