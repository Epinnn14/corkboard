<script setup lang="ts">
import { toJpeg, toPng } from 'html-to-image';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { KIND_LABEL, type NoteKind, STICKERS, STICKY_COLORS } from './core/board';
import { TEMPLATES, type TemplateId } from './core/templates';
import {
  boardsToDocx,
  boardsToMarkdown,
  boardsToPdf,
  boardsToText,
  EXPORTS,
  type ExportFormat,
  IMPORT_ACCEPT,
  readImport,
  textBlob,
} from './core/io';
import { autoOrientation } from './core/workspace';
import type { Board } from './core/board';
import { attentionCount, dueLabel, dueReminders, noteTitle, reminderKey } from './core/dates';
import { isInstalled } from './core/install';
import {
  DEFAULT_DESK,
  type DeskConfig,
  deskHash,
  deskWindowSize,
  parseDeskHash,
  sanitizeDesk,
} from './core/desk';
import { desktop } from './core/desktop';
import { showNotification } from './core/notify';
import { composeWallpaper, type WallpaperKind } from './core/wallpaper';
import { useNow } from './composables/now';
import { useWorkspace } from './stores/workspace';
import AgendaPanel from './components/AgendaPanel.vue';
import DeskSheet from './components/DeskSheet.vue';
import InstallSheet from './components/InstallSheet.vue';
import WidgetView from './components/WidgetView.vue';
import Workspace from './components/Workspace.vue';

const store = useWorkspace();
const space = ref<InstanceType<typeof Workspace> | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const toast = ref('');
const boardsOpen = ref(false);
const fileOpen = ref(false);
const paletteOpen = ref(false);
const stickersOpen = ref(false);
const sheetOpen = ref(false);
const agendaOpen = ref(window.location.hash === '#agenda');
const installOpen = ref(window.location.hash === '#install');
const isWidget = () => window.location.hash.startsWith('#widget');
const routeOf = (): 'app' | 'widget' => (isWidget() ? 'widget' : 'app');
const route = ref(routeOf());
const deskOpen = ref(window.location.hash === '#desk');
const now = useNow();
const attention = computed(() => attentionCount(store.boards, now.value));
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const kinds: { kind: NoteKind; icon: string }[] = [
  { kind: 'sticky', icon: '🟨' },
  { kind: 'index', icon: '🗂️' },
  { kind: 'lined', icon: '📄' },
  { kind: 'polaroid', icon: '📸' },
  { kind: 'card', icon: '📌' },
];

const zoomPct = computed(() => Math.round((store.ws.camera?.zoom ?? 1) * 100));

function say(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 6000);
}

watch(
  () => store.undo,
  (u) => u && say(store.undoLabel),
);

// ---------------------------------------------------------------- reminders
interface Ring {
  noteId: string;
  title: string;
  body: string;
}
const ringing = ref<Ring | null>(null);

async function checkReminders() {
  for (const { note, board } of dueReminders(store.boards, new Date())) {
    const title = `⏰ ${noteTitle(note)}`;
    const body = `${dueLabel(note.due!, new Date())} · ${board.title}`;
    store.markNotified(note.id, reminderKey(note));
    ringing.value = { noteId: note.id, title, body };
    await showNotification(title, body, note.id);
  }
}

function revealNote(id: string) {
  ringing.value = null;
  agendaOpen.value = false;
  if (route.value !== 'app') window.location.hash = '';
  const boardId = store.reveal(id);
  if (boardId) nextTick(() => space.value?.focusBoard(boardId));
}

function onHash() {
  route.value = routeOf();
  readDesk();
  if (window.location.hash === '#agenda') agendaOpen.value = true;
  if (window.location.hash === '#install') installOpen.value = true;
  if (window.location.hash.startsWith('#note=')) {
    const id = decodeURIComponent(window.location.hash.slice(6));
    history.replaceState(null, '', window.location.pathname + window.location.search);
    nextTick(() => revealNote(id));
  }
  if (window.location.hash === '#desk') {
    deskOpen.value = true;
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

let reminderTimer: ReturnType<typeof setInterval> | undefined;
let alive = true;
function startReminders() {
  if (!alive) return;
  void checkReminders();
  reminderTimer = setInterval(() => void checkReminders(), 15_000);
  document.addEventListener('visibilitychange', checkReminders);
}
onMounted(() => {
  // several corkboard windows (app, widget pop-ups) may be open: only one of them rings
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) void locks.request('corkboard-reminders', () => new Promise<void>(() => startReminders()));
  else startReminders();
  window.addEventListener('hashchange', onHash);
  window.addEventListener('storage', onStorage);
  if (window.location.hash.startsWith('#note=')) onHash();
  // a click on a notification (handled by the service worker) asks us to show that note
  navigator.serviceWorker?.addEventListener?.('message', (e: MessageEvent) => {
    if (e.data?.type === 'reveal-note') revealNote(e.data.noteId);
  });
});
onBeforeUnmount(() => {
  alive = false;
  clearInterval(reminderTimer);
  document.removeEventListener('visibilitychange', checkReminders);
  window.removeEventListener('hashchange', onHash);
  window.removeEventListener('storage', onStorage);
});

// ------------------------------------------------------------ install (PWA)
type InstallPrompt = Event & { prompt: () => Promise<void> };
const installPrompt = ref<InstallPrompt | null>(null);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt.value = e as InstallPrompt;
});
const installed = isInstalled();
const justInstalled = ref(false);
window.addEventListener('appinstalled', () => {
  justInstalled.value = true;
  installPrompt.value = null;
});
function openInstall() {
  fileOpen.value = false;
  installOpen.value = true;
}
function closeInstall() {
  installOpen.value = false;
  if (window.location.hash === '#install') history.replaceState(null, '', window.location.pathname + window.location.search);
}
async function install() {
  const p = installPrompt.value;
  if (!p) return;
  await p.prompt();
  const choice = await (p as InstallPrompt & { userChoice?: Promise<{ outcome: string }> }).userChoice;
  installPrompt.value = null;
  if (choice?.outcome === 'accepted') justInstalled.value = true;
}

function openWidget() {
  fileOpen.value = false;
  window.location.hash = 'widget';
}

// ------------------------------------------------------- desktop widget
const DESK_KEY = 'corkboard:desk';
function loadDesk(): DeskConfig {
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (raw) return sanitizeDesk(JSON.parse(raw));
    const oldBoard = localStorage.getItem('corkboard:widget-board'); // v1.3 kept only the board
    return sanitizeDesk({ boardId: oldBoard });
  } catch {
    return DEFAULT_DESK;
  }
}
function saveDesk(c: DeskConfig) {
  try {
    localStorage.setItem(DESK_KEY, JSON.stringify(c));
  } catch {
    /* fine without it */
  }
}
const deskCfg = ref<DeskConfig>(DEFAULT_DESK);
let deskCustom = false;
function readDesk() {
  const { config, custom } = parseDeskHash(window.location.hash, loadDesk());
  deskCfg.value = config;
  deskCustom = custom;
}
readDesk();
// "Customize" in another window (the app) changes the saved widget: follow it here
function onStorage(e: StorageEvent) {
  if (e.key === DESK_KEY && route.value === 'widget' && !deskCustom) readDesk();
}

// ------------------------------------------------------- the Windows app
const bridge = desktop();
const inDeskWidget = !!bridge?.widget;
const onTop = ref(false);
if (bridge) {
  void bridge.getSettings().then((x) => (onTop.value = x.onTop));
  bridge.onSettings((x) => (onTop.value = x.onTop));
}
if (inDeskWidget) document.documentElement.classList.add('cb-desk-widget');
const deskFits = computed(() => !deskCfg.value.parts.includes('board'));
watch(
  () => deskCfg.value.parts.join(','),
  () => {
    if (!inDeskWidget) return;
    // with a board the window has a set size; without, it follows its content (see onNatural)
    const { w, h } = deskWindowSize(deskCfg.value);
    bridge!.resizeWidget(w, h);
  },
  { immediate: true },
);
function onNatural(h: number) {
  if (inDeskWidget && deskFits.value) bridge!.resizeWidget(deskWindowSize(deskCfg.value).w, h);
}
function customizeWidget() {
  if (bridge) bridge.openApp('desk');
  else {
    window.location.hash = '';
    deskOpen.value = true;
  }
}
function openFromWidget() {
  if (bridge) bridge.openApp();
  else leaveWidget();
}
function revealFromWidget(id: string) {
  if (bridge) bridge.openApp(`note:${id}`);
  else revealNote(id);
}
function pickDeskBoard(id: string) {
  deskCfg.value = { ...deskCfg.value, boardId: id };
  saveDesk(deskCfg.value);
  if (deskCustom) history.replaceState(null, '', deskHash(deskCfg.value));
}
function openDesk() {
  fileOpen.value = false;
  deskOpen.value = true;
}
function openDeskWindow(c: DeskConfig) {
  saveDesk(c);
  const { w, h } = deskWindowSize(c);
  const left = Math.max(0, (window.screen?.availWidth ?? 1280) - w - 32);
  const url = window.location.href.replace(/#.*$/, '') + deskHash(c);
  const win = window.open(url, 'corkboard-widget', `popup,width=${w},height=${h},left=${left},top=48`);
  if (!win) say('Your browser blocked the window. Allow pop-ups for corkboard and try again');
  else deskOpen.value = false;
}
function leaveWidget() {
  window.location.hash = '';
}

function viewportSize() {
  return space.value?.size ?? { w: window.innerWidth, h: window.innerHeight };
}

function newBoard(template: TemplateId = 'blank') {
  const b = store.addBoard(autoOrientation(viewportSize()), template);
  boardsOpen.value = false;
  sheetOpen.value = false;
  nextTick(() => space.value?.focusBoard(b.id));
}

function goTo(id: string) {
  boardsOpen.value = false;
  space.value?.focusBoard(id);
}

function addNote(kind: NoteKind, color?: string, text?: string) {
  paletteOpen.value = false;
  stickersOpen.value = false;
  if (!store.boards.length) newBoard();
  const note = store.addNote(kind, { color, text });
  const board = store.active;
  if (note && board && !space.value?.isVisible(board.id)) space.value?.focusBoard(board.id);
}

function slug(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corkboard';
}

function download(href: string, name: string) {
  const a = Object.assign(document.createElement('a'), { href, download: name });
  a.click();
}

const pngOptions = {
  cacheBust: true,
  // the board sits somewhere on the endless canvas; draw it at the origin
  style: { position: 'static', margin: '0' },
  filter: (node: Node) => !(node instanceof HTMLElement && node.classList.contains('tab')),
};

async function renderBoard(b: Board, pixelRatio = 1, format: 'png' | 'jpeg' = 'png'): Promise<string | null> {
  const el = document.querySelector<HTMLElement>(`[data-board-id="${b.id}"]`);
  if (!el) return null;
  try {
    return format === 'png'
      ? await toPng(el, { ...pngOptions, pixelRatio })
      : await toJpeg(el, { ...pngOptions, pixelRatio, quality: 0.82, backgroundColor: '#c88f4d' });
  } catch {
    return null;
  }
}

async function saveImage() {
  const board = store.active;
  if (!board) return say('Add a board first');
  store.select(null);
  (document.activeElement as HTMLElement | null)?.blur?.();
  await nextTick();
  const url = await renderBoard(board, 1.5);
  if (url) download(url, `${slug(board.title)}.png`);
  else say('Could not render the image in this browser');
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const busy = ref(false);

async function saveWallpaper(kind: WallpaperKind) {
  fileOpen.value = false;
  const board = store.active;
  if (!board) return say('Add a board first');
  store.select(null);
  await nextTick();
  const img = await renderBoard(board, 2);
  if (!img) return say('Could not render the board in this browser');
  download(await composeWallpaper(img, kind), `${slug(board.title)}-${kind}-wallpaper.png`);
  say(kind === 'phone' ? 'Phone wallpaper saved. Set it from your Photos/Gallery app' : 'Desktop wallpaper saved. Right-click it → Set as desktop background');
}

async function exportAs(format: ExportFormat) {
  fileOpen.value = false;
  const boards = store.boards;
  if (!boards.length && format !== 'json') return say('Nothing to export yet');
  busy.value = true;
  store.select(null);
  await nextTick();
  try {
    if (format === 'json') downloadBlob(textBlob(JSON.stringify(store.ws, null, 2), 'application/json'), 'corkboard.json');
    if (format === 'txt') downloadBlob(textBlob(boardsToText(boards)), 'corkboard.txt');
    if (format === 'md') downloadBlob(textBlob(boardsToMarkdown(boards), 'text/markdown'), 'corkboard.md');
    if (format === 'docx') {
      say('Preparing the Word file…');
      downloadBlob(await boardsToDocx(boards), 'corkboard.docx');
    }
    if (format === 'pdf') {
      say(`Drawing ${boards.length} board${boards.length === 1 ? '' : 's'} for the PDF…`);
      downloadBlob(await boardsToPdf(boards, (b) => renderBoard(b, 1, 'jpeg')), 'corkboard.pdf');
    }
    say(`Exported ${boards.length} board${boards.length === 1 ? '' : 's'} as ${format.toUpperCase()}`);
  } catch (e) {
    say(`Export failed: ${(e as Error).message || 'unknown error'}`);
  } finally {
    busy.value = false;
  }
}

async function importFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length) return;
  busy.value = true;
  say(files.length === 1 ? `Reading ${files[0].name}…` : `Reading ${files.length} files…`);
  const orientation = autoOrientation(viewportSize());
  const added: Board[] = [];
  let photos = 0;
  const errors: string[] = [];
  for (const file of files) {
    const r = await readImport(file, orientation, store.boards);
    if (r.type === 'error') errors.push(r.message);
    else if (r.type === 'image') {
      if (!store.boards.length) store.addBoard(orientation);
      const note = store.addNote('polaroid', { text: r.name.slice(0, 60) });
      if (note) store.updateNote(note.id, { image: r.dataUrl });
      photos++;
    } else {
      const boards = r.type === 'workspace' ? r.workspace.boards : r.boards;
      added.push(...store.importBoards(boards));
    }
  }
  busy.value = false;
  const parts = [
    added.length ? `${added.length} board${added.length === 1 ? '' : 's'}` : '',
    photos ? `${photos} photo${photos === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  say([parts.length ? `Added ${parts.join(' and ')}` : '', ...errors].filter(Boolean).join(' · '));
  await nextTick();
  if (added[0]) space.value?.focusBoard(added[0].id);
  else if (photos && store.active && !space.value?.isVisible(store.active.id)) space.value?.focusBoard(store.active.id);
}

function editing() {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && store.undo && !editing()) {
    e.preventDefault();
    store.undoLast();
    toast.value = '';
    return;
  }
  if (editing() || e.ctrlKey || e.metaKey || e.altKey || route.value === 'widget') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) store.removeNote(store.selectedId);
  else if (e.key === 'n' || e.key === 'N') addNote('sticky');
  else if (e.key === 'b' || e.key === 'B') sheetOpen.value = true;
  else if (e.key === '0') space.value?.fitAll();
  else if (e.key === '+' || e.key === '=') space.value?.zoomBy(1.2);
  else if (e.key === '-') space.value?.zoomBy(1 / 1.2);
  else if (e.key === 'a' || e.key === 'A') agendaOpen.value = !agendaOpen.value;
  else if (e.key === 'Escape') {
    agendaOpen.value = false;
    if (installOpen.value) closeInstall();
    store.select(null);
    boardsOpen.value = fileOpen.value = paletteOpen.value = stickersOpen.value = sheetOpen.value = deskOpen.value = false;
  }
}

function closeMenus(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (!t.closest('.menu-wrap')) boardsOpen.value = fileOpen.value = false;
  else if (t.closest('.file-menu')) boardsOpen.value = false;
  else fileOpen.value = false;
  if (!t.closest('.palette-wrap')) paletteOpen.value = false;
  if (!t.closest('.stickers-wrap')) stickersOpen.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', closeMenus, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('pointerdown', closeMenus, true);
});
</script>

<template>
  <div v-if="route === 'widget'" class="app">
    <WidgetView
      :config="deskCfg"
      :boards="store.boards"
      :desk="inDeskWidget"
      :on-top="onTop"
      :fit="inDeskWidget && deskFits"
      @natural="onNatural"
      @board="pickDeskBoard"
      @open="openFromWidget"
      @reveal="revealFromWidget"
      @customize="customizeWidget"
      @on-top="bridge?.setSettings({ onTop: $event })"
      @hide="bridge?.setSettings({ widget: false })"
    />
    <div v-if="ringing" class="ring" role="alert">
      <span class="ring-ico" aria-hidden="true">⏰</span>
      <span class="ring-txt"><b>{{ ringing.title.replace('⏰ ', '') }}</b><small>{{ ringing.body }}</small></span>
      <button @click="revealNote(ringing.noteId)">Show</button>
      <button class="ghosty" @click="ringing = null">OK</button>
    </div>
  </div>
  <div v-else class="app">
    <header class="bar">
      <div class="brand" aria-label="corkboard"><span class="brand-pin" aria-hidden="true" />corkboard</div>
      <div class="menu-wrap">
        <button class="ghost" :aria-expanded="boardsOpen" @click="boardsOpen = !boardsOpen">
          Boards <b>{{ store.boards.length }}</b> ▾
        </button>
        <div v-if="boardsOpen" class="menu" role="menu">
          <button
            v-for="b in store.boards"
            :key="b.id"
            class="menu-item"
            :class="{ on: b.id === store.active?.id }"
            role="menuitem"
            @click="goTo(b.id)"
          >
            <span class="mi-shape" :class="b.orientation" aria-hidden="true" />
            <span class="mi-title">{{ b.title || 'Untitled' }}</span>
            <span class="mi-count">{{ b.notes.length }}</span>
          </button>
          <p v-if="!store.boards.length" class="menu-empty">No boards yet</p>
        </div>
      </div>
      <div class="menu-wrap file-menu">
        <button
          class="solid plus"
          :aria-expanded="fileOpen"
          aria-label="Add: new board, import or export"
          title="New board, import, export"
          @click="fileOpen = !fileOpen"
        >
          <span class="plus-sign" aria-hidden="true">+</span>
        </button>
        <div v-if="fileOpen" class="menu" role="menu">
          <button class="menu-item" role="menuitem" data-action="new-board" @click="fileOpen = false; sheetOpen = true">
            <span class="mi-ico" aria-hidden="true">🪵</span>
            <span class="mi-title">New board<small>blank or a template · B</small></span>
          </button>
          <button class="menu-item" role="menuitem" data-action="import" @click="fileOpen = false; importInput?.click()">
            <span class="mi-ico" aria-hidden="true">📥</span>
            <span class="mi-title">Import files<small>txt · md · csv · pdf · docx · images · json</small></span>
          </button>
          <p class="menu-label">Export all boards as</p>
          <button
            v-for="x in EXPORTS"
            :key="x.id"
            class="menu-item"
            role="menuitem"
            :disabled="busy"
            :data-export="x.id"
            @click="exportAs(x.id)"
          >
            <span class="mi-ico" aria-hidden="true">{{ x.icon }}</span>
            <span class="mi-title">{{ x.label }}<small>{{ x.hint }}</small></span>
          </button>
          <p class="menu-label">On your desk &amp; phone</p>
          <button class="menu-item" role="menuitem" data-action="desk" @click="openDesk">
            <span class="mi-ico" aria-hidden="true">📌</span>
            <span class="mi-title">Desktop widget<small>your date, reminders and a board on the desktop</small></span>
          </button>
          <button class="menu-item" role="menuitem" data-action="widget" @click="openWidget">
            <span class="mi-ico" aria-hidden="true">🗓️</span>
            <span class="mi-title">Widget mode<small>date, clock, what's next + a mini board</small></span>
          </button>
          <button class="menu-item" role="menuitem" data-action="wall-desktop" :disabled="busy" @click="saveWallpaper('desktop')">
            <span class="mi-ico" aria-hidden="true">🖥️</span>
            <span class="mi-title">Desktop wallpaper<small>this board, 2560 × 1440</small></span>
          </button>
          <button class="menu-item" role="menuitem" data-action="wall-phone" :disabled="busy" @click="saveWallpaper('phone')">
            <span class="mi-ico" aria-hidden="true">📱</span>
            <span class="mi-title">Phone wallpaper<small>this board, room for the lock-screen clock</small></span>
          </button>
          <button v-if="!installed" class="menu-item" role="menuitem" data-action="install" @click="openInstall">
            <span class="mi-ico" aria-hidden="true">⬇️</span>
            <span class="mi-title">Install app<small>laptop or phone: own icon, works offline</small></span>
          </button>
        </div>
      </div>
      <div class="spacer" />
      <button
        class="ghost agenda-btn"
        :class="{ on: agendaOpen }"
        title="Agenda (A)"
        :aria-label="`Agenda${attention ? `, ${attention} need attention` : ''}`"
        @click="agendaOpen = !agendaOpen"
      >
        📅<span class="agenda-label">Agenda</span><b v-if="attention" class="badge">{{ attention }}</b>
      </button>
      <button class="ghost" title="Save the current board as a PNG image" @click="saveImage">Save</button>
      <input ref="importInput" type="file" :accept="IMPORT_ACCEPT" multiple hidden @change="importFiles" />
    </header>

    <Workspace ref="space">
      <template #empty>
        <button class="solid big" @click="sheetOpen = true">+ Add a board</button>
      </template>
    </Workspace>

    <nav class="dock" aria-label="Add a note">
      <button
        v-for="k in kinds"
        :key="k.kind"
        class="add"
        :title="`Add ${KIND_LABEL[k.kind].toLowerCase()}`"
        @click="addNote(k.kind)"
      >
        <span class="ico">{{ k.icon }}</span>{{ KIND_LABEL[k.kind] }}
      </button>
      <span class="sep" />
      <div class="stickers-wrap">
        <button class="add" :aria-expanded="stickersOpen" title="Stickers" @click="stickersOpen = !stickersOpen">
          <span class="ico">✨</span>Stickers
        </button>
        <div v-if="stickersOpen" class="sticker-sheet" role="group" aria-label="Stickers">
          <button v-for="e in STICKERS" :key="e" class="stk" :title="`Add ${e}`" @click="addNote('sticker', undefined, e)">
            {{ e }}
          </button>
        </div>
      </div>
      <div class="palette-wrap">
        <button class="add" :aria-expanded="paletteOpen" title="Sticky note in a colour" @click="paletteOpen = !paletteOpen">
          <span class="rainbow" aria-hidden="true" />Colours
        </button>
        <div v-if="paletteOpen" class="dock-palette" role="group" aria-label="Sticky note colours">
          <button
            v-for="c in STICKY_COLORS"
            :key="c"
            class="dot"
            :style="{ background: c }"
            :title="`Sticky note ${c}`"
            @click="addNote('sticky', c)"
          />
          <label class="dot custom" title="Pick any colour">
            <input type="color" value="#ffd1dc" @change="addNote('sticky', ($event.target as HTMLInputElement).value)" />
            <span>+</span>
          </label>
        </div>
      </div>
    </nav>

    <div class="zoom" aria-label="Zoom">
      <button title="Zoom out (−)" @click="space?.zoomBy(1 / 1.2)">−</button>
      <button class="pct" title="Show all boards (0)" @click="space?.fitAll()">{{ zoomPct }}%</button>
      <button title="Zoom in (+)" @click="space?.zoomBy(1.2)">+</button>
    </div>

    <div v-if="sheetOpen" class="sheet-backdrop" @click.self="sheetOpen = false">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <h2 id="sheet-title">New board</h2>
          <button class="ghost" @click="sheetOpen = false">Close</button>
        </header>
        <div class="templates">
          <button v-for="t in TEMPLATES" :key="t.id" class="template" :class="`tp-${t.surface}`" @click="newBoard(t.id)">
            <span class="tp-art" aria-hidden="true">
              <span class="tp-emoji">{{ t.emoji }}</span>
            </span>
            <span class="tp-name">{{ t.name }}</span>
            <span class="tp-blurb">{{ t.blurb }}</span>
          </button>
        </div>
        <p class="sheet-foot">
          New boards on this screen are {{ viewportSize().w / viewportSize().h < 0.9 ? 'portrait' : 'landscape' }}. Tall
          screens like phones get portrait boards.
        </p>
      </section>
    </div>

    <DeskSheet
      v-if="deskOpen"
      :boards="store.boards"
      :initial="loadDesk()"
      @save="saveDesk"
      @open="openDeskWindow"
      @close="deskOpen = false"
    />

    <InstallSheet
      v-if="installOpen"
      :can-prompt="!!installPrompt"
      :installed="installed"
      :just-installed="justInstalled"
      @install="install"
      @close="closeInstall"
    />

    <AgendaPanel v-if="agendaOpen" @close="agendaOpen = false" @reveal="revealNote" />

    <div v-if="ringing" class="ring" role="alert">
      <span class="ring-ico" aria-hidden="true">⏰</span>
      <span class="ring-txt"><b>{{ ringing.title.replace('⏰ ', '') }}</b><small>{{ ringing.body }}</small></span>
      <button @click="revealNote(ringing.noteId)">Show</button>
      <button class="ghosty" @click="ringing = null">OK</button>
    </div>

    <div v-if="toast" class="toast" role="status">
      {{ toast }}
      <button v-if="store.undo" @click="store.undoLast(); toast = ''">Undo</button>
    </div>
  </div>
</template>
