<script setup lang="ts">
import { toPng } from 'html-to-image';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { KIND_LABEL, type NoteKind, parseBoard, STICKY_COLORS } from './core/board';
import { useBoard } from './stores/board';
import Corkboard from './components/Corkboard.vue';

const store = useBoard();
const cork = ref<InstanceType<typeof Corkboard> | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const kinds: { kind: NoteKind; icon: string }[] = [
  { kind: 'sticky', icon: '🟨' },
  { kind: 'index', icon: '🗂' },
  { kind: 'lined', icon: '📄' },
  { kind: 'polaroid', icon: '📷' },
  { kind: 'card', icon: '📌' },
];

function say(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 5000);
}

watch(
  () => store.deleted,
  (d) => d && say('Note removed'),
);

const fileSlug = computed(() => store.board.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'corkboard');

function download(href: string, name: string) {
  const a = Object.assign(document.createElement('a'), { href, download: name });
  a.click();
}

async function exportPng() {
  const el = cork.value?.boardEl;
  if (!el) return;
  store.select(null);
  (document.activeElement as HTMLElement | null)?.blur?.();
  await nextTick();
  try {
    const url = await toPng(el, { pixelRatio: 2, style: { transform: 'none' }, cacheBust: true });
    download(url, `${fileSlug.value}.png`);
  } catch {
    say('Could not render the image in this browser');
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(store.board, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `${fileSlug.value}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJson(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  try {
    const r = parseBoard(JSON.parse(await file.text()));
    if (!r.ok) return say(r.error);
    store.replace(r.board);
    say(`Loaded “${r.board.title}” (${r.board.notes.length} notes)`);
  } catch {
    say('That file is not valid JSON');
  }
}

function clearBoard() {
  if (store.notes.length && confirm('Remove every note from this board?')) store.clear();
}

function editing() {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && store.deleted && !editing()) {
    e.preventDefault();
    store.undoRemove();
    toast.value = '';
    return;
  }
  if (editing()) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) store.remove(store.selectedId);
  if (e.key === 'n' || e.key === 'N') store.add('sticky');
  if (e.key === 'Escape') store.select(null);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app">
    <header class="bar">
      <input v-model="store.board.title" class="title" maxlength="80" aria-label="Board title" />
      <div class="spacer" />
      <div class="seg" role="group" aria-label="Board orientation">
        <button :class="{ on: store.board.orientation === 'landscape' }" @click="store.setOrientation('landscape')">
          ▭ Landscape
        </button>
        <button :class="{ on: store.board.orientation === 'portrait' }" @click="store.setOrientation('portrait')">
          ▯ Portrait
        </button>
      </div>
      <button class="ghost" @click="exportPng">Save as image</button>
      <button class="ghost" @click="exportJson">Export</button>
      <button class="ghost" @click="importInput?.click()">Import</button>
      <button class="ghost danger" @click="clearBoard">Clear</button>
      <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importJson" />
    </header>

    <Corkboard ref="cork" />

    <nav class="dock" aria-label="Add a note">
      <button
        v-for="k in kinds"
        :key="k.kind"
        class="add"
        :title="`Add ${KIND_LABEL[k.kind].toLowerCase()}`"
        @click="store.add(k.kind)"
      >
        <span class="ico">{{ k.icon }}</span>{{ KIND_LABEL[k.kind] }}
      </button>
      <span class="sep" />
      <button
        v-for="c in STICKY_COLORS"
        :key="c"
        class="dot"
        :style="{ background: c }"
        :title="`Add a sticky note in ${c}`"
        @click="store.add('sticky', undefined, c)"
      />
    </nav>

    <div v-if="toast" class="toast" role="status">
      {{ toast }}
      <button v-if="store.deleted" @click="store.undoRemove(); toast = ''">Undo</button>
    </div>
  </div>
</template>
