import { describe, expect, it } from 'vitest';
import { type Board, createNote } from '../src/core/board';
import { toDue } from '../src/core/dates';
import {
  DEFAULT_DESK,
  decodeSnapshot,
  deskHash,
  deskLists,
  encodeSnapshot,
  makeSnapshot,
  parseDeskHash,
  sanitizeDesk,
} from '../src/core/desk';
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
    { ...createNote('polaroid', a, { text: 'pic', now: 1 }), image: 'data:image/png;base64,AAAA' },
  ];
  const b = createBoard([a], 'landscape', 'Work');
  b.notes = [{ ...createNote('index', b, { text: 'Report', now: 1 }), due: at(2) }];
  return [a, b];
}

describe('desk settings', () => {
  it('round-trips through the hash and falls back to the saved default', () => {
    const c = { parts: ['today', 'board'] as const, theme: 'dark' as const, boardId: 'b1', wall: true };
    const h = deskHash({ ...c, parts: [...c.parts] });
    expect(h).toBe('#widget?show=today%2Cboard&theme=dark&board=b1&wall=1');
    expect(parseDeskHash(h)).toEqual({ config: { ...c, parts: ['today', 'board'] }, snap: null, custom: true });
    const saved = { ...DEFAULT_DESK, theme: 'paper' as const };
    expect(parseDeskHash('#widget', saved)).toEqual({ config: saved, snap: null, custom: false });
  });

  it('ignores junk', () => {
    expect(sanitizeDesk({ parts: ['nope'] as never, theme: 'neon' as never })).toEqual(DEFAULT_DESK);
    expect(parseDeskHash('#widget?show=week,clock,week&theme=x').config.parts).toEqual(['clock', 'week']);
  });
});

describe('desk lists', () => {
  it('today = overdue + today (not done), week = the next 7 days', () => {
    const { today, week } = deskLists(boards(), now);
    expect(today.map((i) => i.note.text)).toEqual(['Essay', 'Gym']);
    expect(week.map((i) => i.note.text)).toEqual(['Meeting', 'Report', 'Exam']);
  });
});

describe('wallpaper snapshot', () => {
  it('keeps the chosen board and the dated notes, drops photos, survives encoding', async () => {
    const bs = boards();
    const snap = makeSnapshot(bs, { ...DEFAULT_DESK, boardId: bs[0].id }, 123);
    expect(snap.boards.map((b) => b.title)).toEqual(['Uni', 'Work']);
    expect(snap.boards[0].notes).toHaveLength(8);
    expect(snap.boards[0].notes.some((n) => n.image)).toBe(false);

    const noBoard = makeSnapshot(bs, { ...DEFAULT_DESK, parts: ['today', 'week'] }, 123);
    expect(noBoard.boards[0].notes.map((n) => n.text)).toEqual(['Essay', 'Gym', 'Meeting', 'Exam', 'Holiday']);

    const code = await encodeSnapshot(snap);
    expect(code).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    const back = await decodeSnapshot(code);
    expect(back?.at).toBe(123);
    expect(back?.boards[0].notes.map((n) => n.text)).toEqual(snap.boards[0].notes.map((n) => n.text));
    expect(deskLists(back!.boards, now).today.map((i) => i.note.text)).toEqual(['Essay', 'Gym']);
  });

  it('rejects broken or tampered links', async () => {
    expect(await decodeSnapshot('zgarbage')).toBeNull();
    const bad = 'j' + btoa(JSON.stringify({ v: 1, at: 1, boards: [{ id: 'x', title: 'X', notes: [{ kind: 'evil' }] }] })).replace(/=+$/, '');
    expect(await decodeSnapshot(bad)).toBeNull();
  });
});
