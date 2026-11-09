import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, createNote, emptyBoard, STICKY_COLORS, TAPES } from '../src/core/board';
import { buildTemplate, TEMPLATES } from '../src/core/templates';
import {
  autoOrientation,
  boardAt,
  boardRect,
  bounds,
  createBoard,
  fit,
  FRAME,
  MAX_ZOOM,
  newBoardSpot,
  parseWorkspace,
  placeImported,
  toWorld,
  visibleArea,
  zoomAt,
} from '../src/core/workspace';

const overlap = (a: ReturnType<typeof boardRect>, b: ReturnType<typeof boardRect>) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('boards in the workspace', () => {
  it('auto orientation follows the screen shape', () => {
    expect(autoOrientation({ w: 1440, h: 900 })).toBe('landscape');
    expect(autoOrientation({ w: 390, h: 844 })).toBe('portrait');
  });

  it('new boards fill a grid and never overlap, even around moved boards', () => {
    const boards = [createBoard([], 'landscape')];
    for (let i = 0; i < 7; i++) boards.push(createBoard(boards, i % 2 ? 'portrait' : 'landscape'));
    for (let i = 0; i < boards.length; i++)
      for (let j = i + 1; j < boards.length; j++) expect(overlap(boardRect(boards[i]), boardRect(boards[j]))).toBe(false);
    // the user drags one board somewhere else; the next board still finds free space
    boards[2] = { ...boards[2], x: 9000, y: 9000 };
    const next = createBoard(boards, 'landscape');
    for (const b of boards) expect(overlap(boardRect(next), boardRect(b))).toBe(false);
    expect(boards.map((b) => b.title).slice(0, 3)).toEqual(['My board', 'Board 2', 'Board 3']);
    expect(newBoardSpot([], 'portrait')).toEqual({ x: 0, y: 0 });
  });

  it('boardAt finds the cork under a point, ignoring the frame', () => {
    const a = createBoard([], 'landscape');
    const b = createBoard([a], 'landscape');
    expect(boardAt([a, b], { x: FRAME + 10, y: FRAME + 10 })?.id).toBe(a.id);
    expect(boardAt([a, b], { x: b.x + FRAME + 5, y: b.y + 500 })?.id).toBe(b.id);
    expect(boardAt([a, b], { x: 5, y: 5 })).toBeUndefined();
  });
});

describe('camera', () => {
  const vp = { w: 1200, h: 800 };

  it('fit centres a rect inside the viewport', () => {
    const r = boardRect(createBoard([], 'landscape'));
    const c = fit(r, vp, 40);
    const centre = toWorld(c, { x: 600, y: 400 });
    expect(centre.x).toBeCloseTo(r.x + r.w / 2);
    expect(centre.y).toBeCloseTo(r.y + r.h / 2);
    expect(r.w * c.zoom).toBeLessThanOrEqual(vp.w - 80 + 0.001);
  });

  it('zoomAt keeps the point under the cursor fixed and clamps', () => {
    const c = { x: 100, y: 50, zoom: 0.5 };
    const anchor = { x: 300, y: 200 };
    const before = toWorld(c, anchor);
    const z = zoomAt(c, 1.7, anchor);
    expect(toWorld(z, anchor).x).toBeCloseTo(before.x);
    expect(toWorld(z, anchor).y).toBeCloseTo(before.y);
    expect(zoomAt(c, 1000, anchor).zoom).toBe(MAX_ZOOM);
  });

  it('visibleArea and bounds', () => {
    const a = createBoard([], 'landscape');
    const b = createBoard([a], 'portrait');
    expect(visibleArea(a, { x: 0, y: 0, zoom: 1 }, vp)).toBe(1200 * 800);
    expect(visibleArea(b, { x: 0, y: 0, zoom: 1 }, vp)).toBe(0);
    const all = bounds([a, b])!;
    expect(all.x).toBe(0);
    expect(all.w).toBe(b.x + boardRect(b).w);
    expect(bounds([])).toBeNull();
  });
});

describe('templates', () => {
  it('every template builds on both orientations with notes inside the cork', () => {
    for (const t of TEMPLATES) {
      for (const o of ['landscape', 'portrait'] as const) {
        const b = buildTemplate(t.id, [], o, () => 0.5);
        expect(b.surface).toBe(t.surface);
        const { w, h } = BOARD_SIZE[o];
        for (const n of b.notes) {
          expect(n.x).toBeGreaterThanOrEqual(0);
          expect(n.y).toBeGreaterThanOrEqual(0);
          expect(n.x + n.w).toBeLessThanOrEqual(w);
          expect(n.y + n.h).toBeLessThanOrEqual(h);
        }
        if (t.id === 'blank') expect(b.notes).toHaveLength(0);
        else expect(b.notes.length).toBeGreaterThan(3);
      }
    }
    const week = buildTemplate('week', [], 'landscape');
    expect(week.notes.filter((n) => n.kind === 'index').map((n) => n.text.trim())).toEqual([
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
    ]);
  });
});

describe('files', () => {
  it('round-trips a workspace and migrates a v1 single-board file', () => {
    const a = buildTemplate('mood', [], 'landscape');
    const ws = { version: 2, boards: [a], camera: { x: 1, y: 2, zoom: 0.5 } };
    const r = parseWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(r.ok && r.workspace.boards[0].notes.length).toBe(a.notes.length);
    expect(r.ok && r.workspace.boards[0].surface).toBe('blush');
    expect(r.ok && r.workspace.boards[0].notes.some((n) => TAPES.includes(n.tape!))).toBe(true);

    const legacy = { version: 1, title: 'Old', orientation: 'landscape', notes: [{ ...createNote('sticky', emptyBoard()), text: 'hi' }] };
    const m = parseWorkspace(legacy);
    expect(m.ok && m.workspace.boards[0]).toMatchObject({ title: 'Old', surface: 'cork', x: 0, y: 0 });
  });

  it('rejects junk and sanitises', () => {
    expect(parseWorkspace(null).ok).toBe(false);
    expect(parseWorkspace({ version: 3, boards: [] }).ok).toBe(false);
    const bad = parseWorkspace({ version: 2, boards: [{ notes: [{ kind: 'nope' }] }] });
    expect(bad).toEqual({ ok: false, error: 'Board 1: Note 1: unknown kind' });
    const b = createBoard([], 'landscape');
    const r = parseWorkspace({ version: 2, boards: [{ ...b, surface: 'lava' }, { ...b }], camera: { x: 'a' } });
    expect(r.ok && r.workspace.boards[0].surface).toBe('cork');
    expect(r.ok && new Set(r.workspace.boards.map((x) => x.id)).size).toBe(2);
    expect(r.ok && r.workspace.camera).toBeNull();
  });

  it('imported boards are placed beside existing ones', () => {
    const a = createBoard([], 'landscape');
    const [b] = placeImported([a], [{ ...createBoard([], 'landscape'), id: a.id }]);
    expect(b.id).not.toBe(a.id);
    expect(overlap(boardRect(a), boardRect(b))).toBe(false);
  });

  it('palette has 12 distinct colours', () => {
    expect(new Set(STICKY_COLORS).size).toBe(12);
  });
});
