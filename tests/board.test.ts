import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  bringToFront,
  clampToBoard,
  createNote,
  emptyBoard,
  findSpot,
  type Note,
  parseBoard,
  STICKY_COLORS,
} from '../src/core/board';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('createNote', () => {
  it('gives each kind its size, a tilt and a pin', () => {
    const board = emptyBoard();
    const sticky = createNote('sticky', board, { rnd: seeded(2) });
    expect(sticky).toMatchObject({ kind: 'sticky', w: 210, h: 210, text: '', z: 1 });
    expect(STICKY_COLORS).toContain(sticky.color);
    expect(Math.abs(sticky.rotation)).toBeLessThanOrEqual(4);
    expect(createNote('polaroid', board).pin).toBe('blue');
    expect(createNote('card', board).pin).toBe('green');
    expect(createNote('index', board).color).toBe('#ffffff');
    const sticker = createNote('sticker', board, { text: '🔥' });
    expect(sticker).toMatchObject({ w: 120, h: 120, text: '🔥' });
  });

  it('centres on a requested point and stays on the board', () => {
    const board = emptyBoard();
    const n = createNote('sticky', board, { at: { x: 800, y: 500 } });
    expect([n.x, n.y]).toEqual([695, 395]);
    const corner = createNote('sticky', board, { at: { x: 0, y: 99999 } });
    expect(corner.x).toBe(12);
    expect(corner.y + corner.h).toBeLessThanOrEqual(BOARD_SIZE.landscape.h - 12);
  });

  it('stacks new notes on top', () => {
    let board = emptyBoard();
    for (let i = 0; i < 3; i++) board = { ...board, notes: [...board.notes, createNote('sticky', board)] };
    expect(board.notes.map((n) => n.z)).toEqual([1, 2, 3]);
  });
});

describe('placement', () => {
  it('finds a free spot when there is room', () => {
    const board = emptyBoard();
    const first = createNote('card', board, { at: { x: 800, y: 500 } });
    const spot = findSpot({ w: 210, h: 210 }, [first], 'landscape', seeded(7));
    const overlaps =
      spot.x < first.x + first.w && spot.x + 210 > first.x && spot.y < first.y + first.h && spot.y + 210 > first.y;
    expect(overlaps).toBe(false);
  });

  it('clamps inside the board for both orientations', () => {
    expect(clampToBoard({ x: -50, y: -50, w: 100, h: 100 }, 'landscape')).toEqual({ x: 12, y: 12 });
    expect(clampToBoard({ x: 5000, y: 5000, w: 100, h: 100 }, 'portrait')).toEqual({ x: 888, y: 1388 });
  });
});

describe('z-order', () => {
  it('bringToFront lifts one note and keeps z compact', () => {
    const board = emptyBoard();
    const notes: Note[] = [1, 2, 3].map((z) => ({ ...createNote('sticky', board), id: `n${z}`, z: z * 10 }));
    const out = bringToFront(notes, 'n1');
    expect(out.find((n) => n.id === 'n1')?.z).toBe(3);
    expect(out.map((n) => n.z).sort()).toEqual([1, 2, 3]);
    expect(bringToFront(out, 'n1')).toBe(out); // already on top: untouched
    expect(bringToFront(out, 'missing')).toBe(out);
  });
});

describe('parseBoard', () => {
  const valid = () => {
    const board = emptyBoard('portrait');
    return { ...board, title: 'Kitchen', notes: [{ ...createNote('sticky', board), text: 'hi' }] };
  };

  it('accepts its own export', () => {
    const r = parseBoard(JSON.parse(JSON.stringify(valid())));
    expect(r.ok && r.board.title).toBe('Kitchen');
    expect(r.ok && r.board.notes[0].text).toBe('hi');
  });

  it('sanitises sloppy values', () => {
    const b = valid();
    Object.assign(b.notes[0], { x: -999, rotation: 90, color: 'red; background:url(x)', pin: 'gold', w: 5, tape: 'glitter' });
    const r = parseBoard(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.board.notes[0]).toMatchObject({ x: 12, rotation: 15, color: '#fff27a', pin: 'red', w: 60 });
      expect(r.board.notes[0].tape).toBeUndefined();
    }
  });

  it('rejects junk with a reason', () => {
    expect(parseBoard(null)).toEqual({ ok: false, error: 'Not a board file' });
    expect(parseBoard({ version: 2, notes: [] }).ok).toBe(false);
    expect(parseBoard({ version: 1 })).toEqual({ ok: false, error: 'Board has no notes list' });
    expect(parseBoard({ notes: [{ ...valid().notes[0], tape: 'glitter' }] }).ok && 'ok').toBe('ok');
    expect(parseBoard({ version: 1, notes: [{ kind: 'banner' }] })).toEqual({ ok: false, error: 'Note 1: unknown kind' });
    const b = valid();
    (b.notes[0] as Note).image = 'javascript:alert(1)';
    expect(parseBoard(b)).toEqual({ ok: false, error: 'Note 1: image must be a data URL' });
  });
});
