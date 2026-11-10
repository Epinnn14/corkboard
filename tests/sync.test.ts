import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { startAutosave } from '../src/core/sync';
import type { Workspace } from '../src/core/workspace';
import { useWorkspace } from '../src/stores/workspace';

/** Two windows of one browser: separate stores, one storage, one BroadcastChannel. */
function twoWindows() {
  let disk: Workspace | null = null;
  const save = async (ws: Workspace) => void (disk = JSON.parse(JSON.stringify(ws)));
  const load = async () => (disk ? JSON.parse(JSON.stringify(disk)) : null);
  const make = () => {
    setActivePinia(createPinia());
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    const channel = new BroadcastChannel('corkboard-test');
    startAutosave(store, { save, load, channel, delay: 5 });
    return { store, channel };
  };
  return { a: make(), b: make() };
}
const settle = () => new Promise((r) => setTimeout(r, 60));

describe('windows stay in step', () => {
  it('a note added in one window shows up in the other, keeping each camera', async () => {
    const { a, b } = twoWindows();
    a.store.addBoard('landscape');
    await settle();
    expect(b.store.boards).toHaveLength(1);
    b.store.setCamera({ x: 5, y: 6, zoom: 0.5 });
    await settle();
    a.store.addNote('sticky', { text: 'from the wallpaper' });
    await settle();
    expect(b.store.active!.notes.map((n) => n.text)).toEqual(['from the wallpaper']);
    expect(b.store.ws.camera).toEqual({ x: 5, y: 6, zoom: 0.5 });
    a.channel.close();
    b.channel.close();
  });
});
