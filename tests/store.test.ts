import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBoard } from '../src/core/board';
import { loadBoard, saveBoard } from '../src/core/storage';
import { useBoard, welcomeBoard } from '../src/stores/board';

beforeEach(() => setActivePinia(createPinia()));

describe('board store', () => {
  it('add selects the new note; remove + undo restores it', () => {
    const s = useBoard();
    s.replace(emptyBoard());
    const n = s.add('sticky');
    expect(s.selectedId).toBe(n.id);
    s.update(n.id, { text: 'milk' });
    s.remove(n.id);
    expect(s.notes).toHaveLength(0);
    expect(s.selectedId).toBeNull();
    s.undoRemove();
    expect(s.notes[0].text).toBe('milk');
    s.undoRemove(); // nothing left to undo
    expect(s.notes).toHaveLength(1);
  });

  it('move clamps to the board and select brings to front', () => {
    const s = useBoard();
    s.replace(emptyBoard());
    const a = s.add('sticky');
    const b = s.add('sticky');
    s.move(a.id, -500, 99999);
    expect(s.notes.find((n) => n.id === a.id)).toMatchObject({ x: 12, y: 1000 - 210 - 12 });
    s.select(a.id);
    const za = s.notes.find((n) => n.id === a.id)!.z;
    const zb = s.notes.find((n) => n.id === b.id)!.z;
    expect(za).toBeGreaterThan(zb);
  });

  it('duplicate copies text, colour and photo', () => {
    const s = useBoard();
    s.replace(emptyBoard());
    const p = s.add('polaroid');
    s.update(p.id, { text: 'beach', image: 'data:image/jpeg;base64,AAAA' });
    s.duplicate(p.id);
    expect(s.notes).toHaveLength(2);
    expect(s.notes[1]).toMatchObject({ kind: 'polaroid', text: 'beach', image: 'data:image/jpeg;base64,AAAA' });
    expect(s.selectedId).toBe(s.notes[1].id);
  });

  it('orientation switch and clear', () => {
    const s = useBoard();
    s.replace(welcomeBoard());
    expect(s.notes.length).toBeGreaterThan(5);
    s.setOrientation('portrait');
    expect(s.board.orientation).toBe('portrait');
    expect(s.notes.every((n) => n.x + n.w <= 1000 && n.y + n.h <= 1500)).toBe(true);
    s.clear();
    expect(s.notes).toHaveLength(0);
  });
});

describe('IndexedDB storage', () => {
  it('round-trips a board', async () => {
    const board = welcomeBoard();
    expect(await saveBoard(board)).toBe(true);
    const loaded = await loadBoard();
    expect(loaded?.notes.map((n) => n.text)).toEqual(board.notes.map((n) => n.text));
  });
});
