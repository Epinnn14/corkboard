import { describe, expect, it } from 'vitest';
import { agendaDays, agendaItems } from '../src/core/dates';
import { detectTimes, findDay, findTime, toggleLineDone } from '../src/core/detect';
import { createBoard } from '../src/core/workspace';
import { createNote } from '../src/core/board';

// Tuesday 10 November 2026, 09:00
const now = new Date(2026, 10, 10, 9, 0);
const note = (text: string, extra: object = {}) => ({ text, updatedAt: now.getTime(), ...extra });

describe('times in text', () => {
  it('reads the usual ways of writing a time', () => {
    const t = (s: string) => {
      const r = findTime(s);
      return r && `${String(r.h).padStart(2, '0')}:${String(r.m).padStart(2, '0')}`;
    };
    expect(t('buy milk 10.00')).toBe('10:00');
    expect(t('meeting 11:30')).toBe('11:30');
    expect(t('gym 7.05')).toBe('07:05');
    expect(t('call 3pm')).toBe('15:00');
    expect(t('dinner 7.30 pm')).toBe('19:30');
    expect(t('12am snack')).toBe('00:00');
    expect(t('rapat jam 10')).toBe('10:00');
    expect(t('pukul 14.15 presentasi')).toBe('14:15');
    // not times
    expect(t('Rp 15.000')).toBeNull();
    expect(t('1.500.000')).toBeNull();
    expect(t('3.5 kg rice')).toBeNull();
    expect(t('room 204')).toBeNull();
    expect(t('25.00')).toBeNull();
  });

  it('reads days: weekday (next one, today included), today/tomorrow, dates', () => {
    const d = (s: string) => {
      const r = findDay(s, now);
      return r && `${r.date.getDate()}/${r.date.getMonth() + 1}`;
    };
    expect(d('tuesday')).toBe('10/11');
    expect(d('Monday')).toBe('16/11');
    expect(d('fri')).toBe('13/11');
    expect(d('Senin')).toBe('16/11');
    expect(d('jumat')).toBe('13/11');
    expect(d('tomorrow')).toBe('11/11');
    expect(d('besok')).toBe('11/11');
    expect(d('lusa')).toBe('12/11');
    expect(d('12/11')).toBe('12/11');
    expect(d('3 Dec')).toBe('3/12');
    expect(d('Dec 3rd')).toBe('3/12');
    expect(d('14 Agustus 2027')).toBe('14/8');
    expect(d('2026-11-20')).toBe('20/11');
    expect(d('5 Jan')).toBe('5/1'); // next year: January is long gone
    expect(findDay('5 Jan', now)!.date.getFullYear()).toBe(2027);
    expect(d('minggu depan')).toBeNull(); // "next week", not Sunday
    expect(d('hari minggu')).toBe('15/11');
  });
});

describe('notes → agenda', () => {
  it('a weekday heading sets the day for the lines below (the weekly planner)', () => {
    expect(detectTimes(note('MONDAY\nbuy milk 10.00\nmeeting 11.00\nno time here'), now)).toEqual([
      { line: 1, title: 'buy milk', due: '2026-11-16T10:00', done: false },
      { line: 2, title: 'meeting', due: '2026-11-16T11:00', done: false },
    ]);
  });

  it('a day in the line wins; no day at all means the day the note was written', () => {
    const r = detectTimes(note('Errands\n- dentist fri 3pm\n• call mum 19.00\n✓ gym 7.00'), now);
    expect(r).toEqual([
      { line: 1, title: 'dentist', due: '2026-11-13T15:00', done: false },
      { line: 2, title: 'call mum', due: '2026-11-10T19:00', done: false },
      { line: 3, title: 'gym', due: '2026-11-10T07:00', done: true },
    ]);
  });

  it('a time alone under a heading takes the heading as its title; the note’s own date isn’t doubled', () => {
    expect(detectTimes(note('Friday\n10.00'), now)[0]).toMatchObject({ title: 'Friday', due: '2026-11-13T10:00' });
    expect(detectTimes(note('Dentist 15.00', { due: '2026-11-10T15:00' }), now)).toEqual([]);
  });

  it('ticking crosses the line out (and back), keeping bullets, and it reads as done', () => {
    const text = 'MONDAY\n- buy milk 10.00\nmeeting 11.00';
    const ticked = toggleLineDone(text, 1);
    expect(ticked.split('\n')[1]).toBe('- b̶u̶y̶ ̶m̶i̶l̶k̶ ̶1̶0̶.̶0̶0̶');
    expect(detectTimes(note(ticked), now)[0]).toMatchObject({ title: 'buy milk', due: '2026-11-16T10:00', done: true });
    expect(toggleLineDone(ticked, 1)).toBe(text);
    expect(toggleLineDone('✓ gym 7.00', 0)).toBe('gym 7.00');
  });

  it('the agenda groups by day with times; ticked ones stay, crossed out', () => {
    const b = createBoard([], 'landscape', 'Weekly planner');
    const mon = { ...createNote('index', b, { now: now.getTime() }), text: 'MONDAY\nbuy milk 10.00\nmeeting 11.00' };
    const tue = { ...createNote('index', b, { now: now.getTime() }), text: 'TUESDAY\nstandup 08.30\nlunch with Rani 12.30' };
    const sticky = { ...createNote('sticky', b, { now: now.getTime() }), text: 'Hand in essay', due: '2026-11-09T18:00' };
    b.notes = [mon, tue, sticky];
    const items = agendaItems([b], now);
    expect(items.map((i) => `${i.due.slice(5)} ${i.title}`)).toEqual([
      '11-09T18:00 Hand in essay',
      '11-10T08:30 standup',
      '11-10T12:30 lunch with Rani',
      '11-16T10:00 buy milk',
      '11-16T11:00 meeting',
    ]);
    const days = agendaDays([b], now);
    expect(days.map((d) => [d.title, d.sub, d.items.map((i) => i.title)])).toEqual([
      ['Overdue', '', ['Hand in essay']],
      ['Today', 'Tue 10 Nov', ['standup', 'lunch with Rani']],
      ['Monday 16 Nov', '', ['buy milk', 'meeting']],
    ]);
    // today's "standup" is late (08:30 < 09:00) but stays under Today
    expect(days[1].items[0].state).toBe('overdue');
  });
});

describe('agenda → calendar', () => {
  it('one .ics with everything still to come, memos included, alarm at the time', async () => {
    const { agendaToIcs } = await import('../src/core/dates');
    const b = createBoard([], 'landscape', 'Weekly planner');
    const tue = { ...createNote('index', b, { now: now.getTime() }), text: 'TUESDAY\nstandup 08.30\nlunch with Rani 12.30\ng̶y̶m̶ ̶1̶8̶.̶0̶0̶', memos: { 'lunch with rani@12:30': 'bring the slides' } };
    b.notes = [tue];
    const ics = agendaToIcs(agendaItems([b], now), now);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1); // 08:30 is past, gym is done
    expect(ics).toContain('SUMMARY:lunch with Rani');
    expect(ics).toContain('DTSTART:20261110T123000');
    expect(ics).toContain('DESCRIPTION:bring the slides\\n\\nFrom the board “Weekly planner”');
    expect(ics).toContain('TRIGGER:-PT0M');
  });
});
