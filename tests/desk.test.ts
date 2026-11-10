import { describe, expect, it } from 'vitest';
import { type Board, createNote } from '../src/core/board';
import { toDue } from '../src/core/dates';
import { DEFAULT_DESK, dayList, deskHash, deskLists, deskWindowSize, greeting, parseDeskHash, sanitizeDesk } from '../src/core/desk';
import { createBoard } from '../src/core/workspace';

const now = new Date(2026, 10, 10, 9, 0);
const at = (days: number, h = 18) => toDue(new Date(2026, 10, 10 + days, h, 0));

function boards(): Board[] {
  const a = createBoard([], 'landscape', 'Uni');
  const note = (text: string, due?: string, extra: object = {}) => ({ ...createNote('sticky', a, { text, now: 1 }), ...(due ? { due } : {}), ...extra });
  a.notes = [
    note('Essay', at(-1)),
    note('Gym', at(0)),
    note('Meeting', at(1)),
    note('Exam', at(5)),
    note('Holiday', at(20)),
    note('Done thing', at(0), { done: true }),
    note('Plain note'),
  ];
  const b = createBoard([a], 'landscape', 'Work');
  b.notes = [{ ...createNote('index', b, { text: 'Report', now: 1 }), due: at(2) }];
  return [a, b];
}

describe('widget settings', () => {
  it('round-trips through the hash and falls back to the saved default', () => {
    const c = { parts: ['today', 'board'] as ('today' | 'board')[], theme: 'dark' as const, boardId: 'b1', size: null };
    const h = deskHash(c);
    expect(h).toBe('#widget?show=today%2Cboard&theme=dark&board=b1');
    expect(parseDeskHash(h)).toEqual({ config: c, custom: true });
    const sized = { ...c, theme: 'bare' as const, size: { w: 500, h: 320 } };
    expect(deskHash(sized)).toBe('#widget?show=today%2Cboard&theme=bare&board=b1&w=500&h=320');
    expect(parseDeskHash(deskHash(sized)).config).toEqual(sized);
    const saved = { ...DEFAULT_DESK, theme: 'paper' as const };
    expect(parseDeskHash('#widget', saved)).toEqual({ config: saved, custom: false });
  });

  it('ignores junk and upgrades the v1.4 "sticky" style to cork', () => {
    expect(sanitizeDesk({ parts: ['nope'] as never, theme: 'neon' as never })).toEqual(DEFAULT_DESK);
    expect(sanitizeDesk({ theme: 'sticky' as never }).theme).toBe('cork');
    expect(parseDeskHash('#widget?show=week,clock,week&theme=x').config.parts).toEqual(['clock', 'week']);
  });

  it('any size from one sticky note (220 × 220) up', () => {
    expect(sanitizeDesk({ size: { w: 50, h: 9000 } }).size).toEqual({ w: 220, h: 3000 });
    expect(sanitizeDesk({ size: { w: 'x', h: 2 } as never }).size).toBeNull();
    expect(deskWindowSize({ parts: ['clock'], size: { w: 1500, h: 900 } })).toEqual({ w: 1500, h: 900 });
    expect(parseDeskHash('#widget?show=today&w=100&h=100').config.size).toEqual({ w: 220, h: 220 });
  });

  it('window size follows what it shows', () => {
    expect(deskWindowSize({ parts: ['clock', 'today', 'week'] })).toEqual({ w: 360, h: 598 });
    expect(deskWindowSize({ parts: ['today'] })).toEqual({ w: 360, h: 298 });
    expect(deskWindowSize({ parts: ['clock', 'board'] }).w).toBe(860);
  });
});

describe('widget lists', () => {
  it('today = overdue + today (not done), coming up = the next 7 days', () => {
    const { today, week } = deskLists(boards(), now);
    expect(today.map((i) => i.note.text)).toEqual(['Essay', 'Gym']);
    expect(week.map((i) => i.note.text)).toEqual(['Meeting', 'Report', 'Exam']);
  });

  it("one day's list: today (plus what's still open from before, and what's ticked), or any other day", () => {
    const bs = boards();
    expect(dayList(bs, now, 0).map((i) => `${i.title}${i.done ? ' ✓' : ''}`)).toEqual(['Essay', 'Gym', 'Done thing ✓']);
    expect(dayList(bs, now, 1).map((i) => i.title)).toEqual(['Meeting']);
    expect(dayList(bs, now, 2).map((i) => i.title)).toEqual(['Report']);
    expect(dayList(bs, now, 3)).toEqual([]);
  });

  it('greets by the hour', () => {
    expect([3, 9, 14, 20].map((h) => greeting(new Date(2026, 0, 1, h)))).toEqual(['Up late', 'Good morning', 'Good afternoon', 'Good evening']);
  });
});
