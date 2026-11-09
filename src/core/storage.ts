import { del, get, set } from 'idb-keyval';
import { type Board, parseBoard } from './board';

const KEY = 'corkboard:board';

/** IndexedDB (via idb-keyval) — roomy enough for photos, unlike localStorage. */
export async function loadBoard(): Promise<Board | null> {
  try {
    const raw = await get(KEY);
    if (!raw) return null;
    const r = parseBoard(raw);
    return r.ok ? r.board : null;
  } catch {
    return null;
  }
}

export async function saveBoard(board: Board): Promise<boolean> {
  try {
    await set(KEY, JSON.parse(JSON.stringify(board)));
    return true;
  } catch {
    return false;
  }
}

export async function forgetBoard(): Promise<void> {
  await del(KEY).catch(() => undefined);
}
