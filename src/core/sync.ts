import type { Workspace } from './workspace';

interface SyncedStore {
  ws: Workspace;
  draggingId: string | null;
  applyRemote(ws: Workspace): void;
  $subscribe(cb: () => void, opts: { flush: 'sync' }): unknown;
}

interface Channel {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

/**
 * Save shortly after every change and tell the other corkboard windows of
 * this browser (app, widget) to pick it up. A window with unsaved
 * changes of its own keeps them; they are saved and announced right after.
 */
export function startAutosave(
  store: SyncedStore,
  io: { save: (ws: Workspace) => Promise<unknown>; load: () => Promise<Workspace | null>; channel: Channel | null; delay?: number },
) {
  const me = Math.random().toString(36).slice(2);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let applying = false;

  async function flush() {
    await io.save(store.ws);
    pending = false;
    io.channel?.postMessage({ type: 'saved', from: me });
  }

  store.$subscribe(
    () => {
      if (applying) return;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), io.delay ?? 400);
    },
    { flush: 'sync' },
  );

  if (io.channel) {
    io.channel.onmessage = async (e: MessageEvent) => {
      if (e.data?.type !== 'saved' || e.data.from === me || pending || store.draggingId) return;
      const ws = await io.load();
      if (!ws || pending) return;
      applying = true;
      try {
        store.applyRemote(ws);
      } finally {
        applying = false;
      }
    };
  }
  return { flush };
}
