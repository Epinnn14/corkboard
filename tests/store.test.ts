import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { agendaItems } from '../src/core/dates';
import { boardRect, corkRect } from '../src/core/workspace';
import { loadWorkspace, saveWorkspace } from '../src/core/storage';
import { useWorkspace, welcomeWorkspace } from '../src/stores/workspace';

beforeEach(() => setActivePinia(createPinia()));

function fresh() {
  const s = useWorkspace();
  s.replace({ version: 2, boards: [], camera: null });
  s.addBoard('landscape');
  return s;
}

describe('workspace store', () => {
  it('notes: add, edit, remove + undo, duplicate keeps tape and photo', () => {
    const s = fresh();
    const n = s.addNote('polaroid')!;
    s.updateNote(n.id, { text: 'beach', image: 'data:image/jpeg;base64,AAAA' });
    s.cycleFastener(n.id);
    expect(s.find(n.id)?.note.tape).toBe('pink-stripes');
    s.duplicateNote(n.id);
    expect(s.active!.notes[1]).toMatchObject({ text: 'beach', image: 'data:image/jpeg;base64,AAAA', tape: 'pink-stripes' });
    s.removeNote(n.id);
    expect(s.undoLabel).toBe('Note removed');
    s.undoLast();
    expect(s.active!.notes).toHaveLength(2);
  });

  it('cycleFastener goes through every tape and back to a pin', () => {
    const s = fresh();
    const n = s.addNote('sticky')!;
    for (let i = 0; i < 5; i++) s.cycleFastener(n.id);
    expect(s.find(n.id)?.note.tape).toBe('lilac-check');
    s.cycleFastener(n.id);
    expect(s.find(n.id)?.note.tape).toBeUndefined();
  });

  it('a note dropped over another board moves there, keeping its screen position', () => {
    const s = fresh();
    const a = s.active!;
    const b = s.addBoard('landscape');
    const n = s.addNote('sticky', { boardId: a.id, at: { x: 300, y: 300 } })!;
    const ca = corkRect(a);
    const cb = corkRect(b);
    s.dragNote(n.id, cb.x - ca.x + 500, cb.y - ca.y + 400);
    s.dropNote(n.id);
    expect(a.notes).toHaveLength(0);
    expect(s.board(b.id)!.notes[0]).toMatchObject({ id: n.id, x: 500, y: 400 });
    expect(s.activeId).toBe(b.id);
    expect(s.draggingId).toBeNull();
  });

  it('a note dropped on empty space snaps back onto its own board', () => {
    const s = fresh();
    const n = s.addNote('sticky')!;
    s.dragNote(n.id, -5000, -5000);
    s.dropNote(n.id);
    expect(s.find(n.id)?.note).toMatchObject({ x: 12, y: 12 });
  });

  it('boards: template, rename, surface, clear + undo, delete + undo', () => {
    const s = fresh();
    const k = s.addBoard('landscape', 'kanban');
    expect(k).toMatchObject({ title: 'Kanban', surface: 'felt' });
    s.renameBoard(k.id, 'Sprint 12');
    s.setSurface(k.id, 'paper');
    expect(s.board(k.id)).toMatchObject({ title: 'Sprint 12', surface: 'paper' });
    const count = s.board(k.id)!.notes.length;
    s.clearBoard(k.id);
    expect(s.board(k.id)!.notes).toHaveLength(0);
    s.undoLast();
    expect(s.board(k.id)!.notes).toHaveLength(count);
    s.removeBoard(k.id);
    expect(s.boards).toHaveLength(1);
    expect(s.undoLabel).toBe('“Sprint 12” deleted');
    s.undoLast();
    expect(s.boards.map((b) => b.id)).toContain(k.id);
  });

  it('welcome workspace: a how-to board, a filled-in weekly planner whose times reach the agenda, a kanban', () => {
    const ws = welcomeWorkspace('landscape');
    expect(ws.boards.map((b) => b.title)).toEqual(['Start here', 'Weekly planner', 'Kanban']);
    const start = ws.boards[0].notes.map((n) => n.text);
    expect(start.some((t) => t.startsWith('👋 Welcome to corkboard'))).toBe(true);
    expect(start.some((t) => t.startsWith('HOW TO USE'))).toBe(true);
    expect(ws.boards[0].notes.some((n) => n.kind === 'sticker')).toBe(true);
    // every day of the planner has plans with times; nothing on the how-to board pretends to be one
    const items = agendaItems(ws.boards, new Date(2026, 10, 10, 9, 0));
    expect(new Set(items.map((i) => i.board.title))).toEqual(new Set(['Weekly planner']));
    expect(items).toHaveLength(14);
    expect(items.filter((i) => i.due.startsWith('2026-11-10')).map((i) => `${i.due.slice(11)} ${i.title}`)).toEqual([
      '08:00 class',
      '12:30 lunch with Rani',
    ]);
    // no boards overlap
    const r = ws.boards.map(boardRect);
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++)
        expect(r[i].x + r[i].w <= r[j].x || r[j].x + r[j].w <= r[i].x || r[i].y + r[i].h <= r[j].y || r[j].y + r[j].h <= r[i].y).toBe(true);
  });
});

describe('IndexedDB storage', () => {
  it('round-trips the workspace', async () => {
    const ws = welcomeWorkspace();
    expect(await saveWorkspace(ws)).toBe(true);
    const loaded = await loadWorkspace();
    expect(loaded?.boards.map((b) => b.notes.length)).toEqual(ws.boards.map((b) => b.notes.length));
  });
});
