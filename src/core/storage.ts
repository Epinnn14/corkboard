import { del, get, set } from 'idb-keyval';
import { parseWorkspace, type Workspace } from './workspace';

const KEY = 'corkboard:workspace';
const LEGACY_KEY = 'corkboard:board'; // v1.0 stored a single board here

/** IndexedDB (via idb-keyval) — roomy enough for photos, unlike localStorage. */
export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const raw = (await get(KEY)) ?? (await get(LEGACY_KEY));
    if (!raw) return null;
    const r = parseWorkspace(raw);
    return r.ok ? r.workspace : null;
  } catch {
    return null;
  }
}

export async function saveWorkspace(ws: Workspace): Promise<boolean> {
  try {
    await set(KEY, JSON.parse(JSON.stringify(ws)));
    await del(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}
