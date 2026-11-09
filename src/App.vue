<script setup lang="ts">
import { toPng } from 'html-to-image';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { KIND_LABEL, type NoteKind, STICKERS, STICKY_COLORS } from './core/board';
import { TEMPLATES, type TemplateId } from './core/templates';
import { autoOrientation, parseWorkspace } from './core/workspace';
import { useWorkspace } from './stores/workspace';
import Workspace from './components/Workspace.vue';

const store = useWorkspace();
const space = ref<InstanceType<typeof Workspace> | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const toast = ref('');
const boardsOpen = ref(false);
const paletteOpen = ref(false);
const stickersOpen = ref(false);
const sheetOpen = ref(false);
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

async function saveImage() {
  const board = store.active;
  const el = board && document.querySelector<HTMLElement>(`[data-board-id="${board.id}"]`);
  if (!board || !el) return say('Add a board first');
  store.select(null);
  (document.activeElement as HTMLElement | null)?.blur?.();
  await nextTick();
  try {
    const url = await toPng(el, {
      pixelRatio: 1.5,
      cacheBust: true,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('tab')),
    });
    download(url, `${slug(board.title)}.png`);
  } catch {
    say('Could not render the image in this browser');
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(store.ws, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, 'corkboard-workspace.json');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJson(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const r = parseWorkspace(JSON.parse(await file.text()));
    if (!r.ok) return say(r.error);
    const placed = store.importBoards(r.workspace.boards);
    say(`Added ${placed.length} board${placed.length === 1 ? '' : 's'} from ${file.name}`);
    await nextTick();
    space.value?.fitAll();
  } catch {
    say('That file is not valid JSON');
  }
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
  if (editing() || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) store.removeNote(store.selectedId);
  else if (e.key === 'n' || e.key === 'N') addNote('sticky');
  else if (e.key === 'b' || e.key === 'B') newBoard();
  else if (e.key === '0') space.value?.fitAll();
  else if (e.key === '+' || e.key === '=') space.value?.zoomBy(1.2);
  else if (e.key === '-') space.value?.zoomBy(1 / 1.2);
  else if (e.key === 'Escape') {
    store.select(null);
    boardsOpen.value = paletteOpen.value = stickersOpen.value = sheetOpen.value = false;
  }
}

function closeMenus(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (!t.closest('.menu-wrap')) boardsOpen.value = false;
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
  <div class="app">
    <header class="bar">
      <div class="brand"><span class="brand-pin" aria-hidden="true" />corkboard</div>
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
      <button class="solid" title="New board" @click="sheetOpen = true">+ Board</button>
      <div class="spacer" />
      <button class="ghost" title="Save the current board as a PNG" @click="saveImage">Save as image</button>
      <button class="ghost" @click="exportJson">Export</button>
      <button class="ghost" @click="importInput?.click()">Import</button>
      <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importJson" />
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

    <div v-if="toast" class="toast" role="status">
      {{ toast }}
      <button v-if="store.undo" @click="store.undoLast(); toast = ''">Undo</button>
    </div>
  </div>
</template>
