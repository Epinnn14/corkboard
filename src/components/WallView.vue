<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import type { Board, NoteKind } from '../core/board';
import type { WallBg } from '../core/desk';
import { boardRect } from '../core/workspace';
import { useWorkspace } from '../stores/workspace';
import BoardView from './BoardView.vue';

/**
 * One board as the whole screen: a plain backdrop, the board in the middle,
 * fully editable (click a note to write, drag it, double-click to add), and
 * every other control folded into one round button at the bottom right.
 */
const props = defineProps<{ board: Board; boards: readonly Board[]; bg: WallBg; attention: number }>();
const emit = defineEmits<{ pick: [id: string]; bg: [WallBg]; agenda: []; open: []; desk: [] }>();
const store = useWorkspace();

const root = ref<HTMLElement | null>(null);
const view = ref({ w: window.innerWidth, h: window.innerHeight });
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !root.value) return;
  ro = new ResizeObserver(([e]) => (view.value = { w: e.contentRect.width, h: e.contentRect.height }));
  ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

const fit = computed(() => {
  const r = boardRect(props.board);
  const m = Math.min(48, view.value.w * 0.04);
  const s = Math.max(0.1, Math.min((view.value.w - m * 2) / r.w, (view.value.h - m * 2) / r.h));
  return { s, x: r.x, y: r.y, w: r.w * s, h: r.h * s };
});
provide('scale', computed(() => fit.value.s));

const open = ref(false);
const boardsOpen = ref(false);
function toggle() {
  open.value = !open.value;
  boardsOpen.value = false;
}
function close() {
  open.value = false;
  boardsOpen.value = false;
}

const ADD: { kind: NoteKind; icon: string; label: string }[] = [
  { kind: 'sticky', icon: '🟨', label: 'Sticky note' },
  { kind: 'index', icon: '🗂️', label: 'Index card' },
  { kind: 'lined', icon: '📄', label: 'Lined paper' },
  { kind: 'polaroid', icon: '📸', label: 'Photo' },
];
async function add(kind: NoteKind) {
  store.addNote(kind, { boardId: props.board.id });
  close();
  // ready to type straight away
  await nextTick();
  root.value?.querySelector<HTMLTextAreaElement>('.note.selected textarea')?.focus();
}

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const full = ref(!!document.fullscreenElement);
const onFull = () => (full.value = !!document.fullscreenElement);
onMounted(() => document.addEventListener('fullscreenchange', onFull));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFull));
async function toggleFull() {
  close();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed here (e.g. inside Lively): nothing to do */
  }
}

function onBackdrop(e: PointerEvent) {
  if (e.target !== e.currentTarget) return;
  store.select(null);
  close();
}
</script>

<template>
  <div ref="root" class="wallview" :class="`bg-${bg}`" @pointerdown="onBackdrop">
    <div class="wv-stage" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }">
      <div class="wv-scaled" :style="{ transform: `scale(${fit.s}) translate(${-fit.x}px, ${-fit.y}px)` }">
        <BoardView :board="board" />
      </div>
    </div>

    <div class="fab-wrap" @pointerdown.stop>
      <div v-if="open" class="fab-menu" role="menu" aria-label="corkboard">
        <p class="fab-label">Add to “{{ board.title }}”</p>
        <div class="fab-add">
          <button v-for="a in ADD" :key="a.kind" role="menuitem" :title="a.label" :data-add="a.kind" @click="add(a.kind)">
            <span aria-hidden="true">{{ a.icon }}</span><small>{{ a.label }}</small>
          </button>
        </div>
        <button class="fab-item" role="menuitem" data-action="wall-agenda" @click="close(); emit('agenda')">
          <span aria-hidden="true">📅</span> Agenda <b v-if="attention" class="badge">{{ attention }}</b>
        </button>
        <button v-if="boards.length > 1" class="fab-item" role="menuitem" :aria-expanded="boardsOpen" @click="boardsOpen = !boardsOpen">
          <span aria-hidden="true">🔀</span> Show another board <i>▸</i>
        </button>
        <div v-if="boardsOpen" class="fab-boards">
          <button
            v-for="b in boards"
            :key="b.id"
            :class="{ on: b.id === board.id }"
            @click="emit('pick', b.id); close()"
          >
            {{ b.title }}
          </button>
        </div>
        <button class="fab-item" role="menuitem" data-action="wall-bg" @click="emit('bg', bg === 'light' ? 'dark' : 'light')">
          <span aria-hidden="true">{{ bg === 'light' ? '🌙' : '☀️' }}</span> {{ bg === 'light' ? 'Dark' : 'Light' }} background
        </button>
        <button class="fab-item" role="menuitem" @click="toggleFull">
          <span aria-hidden="true">⛶</span> {{ full ? 'Exit full screen' : 'Full screen' }}
        </button>
        <button class="fab-item" role="menuitem" data-action="wall-desk" @click="close(); emit('desk')">
          <span aria-hidden="true">🖥️</span> Add to desktop…
        </button>
        <button class="fab-item" role="menuitem" data-action="wall-open" @click="emit('open')">
          <span aria-hidden="true">↗</span> Open full corkboard
        </button>
      </div>
      <button class="fab" :class="{ open }" :aria-expanded="open" aria-label="corkboard menu" data-action="fab" @click="toggle">
        <span aria-hidden="true">{{ open ? '✕' : '📌' }}</span>
        <b v-if="attention && !open" class="badge">{{ attention }}</b>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wallview {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 40%, #f3eee5, #e3dccf);
}
.bg-dark { background: radial-gradient(120% 90% at 50% 40%, #2c2925, #161412); }
.wv-stage { position: relative; }
.wv-scaled { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.wv-scaled :deep(.tab) { display: none; }
.wv-scaled :deep(.board) { cursor: default; }

.fab-wrap {
  position: fixed;
  right: max(18px, env(safe-area-inset-right, 0px));
  bottom: max(18px, env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  z-index: 50;
}
.fab {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 0;
  background: #2b2620;
  color: #fff;
  font-size: 22px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.2s, transform 0.2s;
}
.fab:hover, .fab:focus-visible, .fab.open { opacity: 1; transform: scale(1.05); }
.fab .badge { position: absolute; top: -2px; right: -2px; }
.fab-menu {
  width: 270px;
  background: #fffdf8;
  color: #2b2620;
  border-radius: 18px;
  padding: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transform-origin: bottom right;
  animation: pop 0.16s ease-out;
}
@keyframes pop { from { opacity: 0; transform: scale(0.9) translateY(8px); } }
.fab-label { margin: 2px 6px 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fab-add { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
.fab-add button { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid rgba(43, 38, 32, 0.12); background: #fff; border-radius: 12px; padding: 8px 2px 6px; font-size: 22px; color: inherit; cursor: pointer; }
.fab-add button:hover { background: #fff6b8; }
.fab-add small { font-size: 10.5px; line-height: 1.1; text-align: center; }
.fab-item { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; padding: 8px 8px; border-radius: 10px; font: inherit; font-size: 14.5px; color: inherit; cursor: pointer; }
.fab-item:hover { background: rgba(43, 38, 32, 0.06); }
.fab-item i { margin-left: auto; font-style: normal; opacity: 0.5; }
.fab-item .badge { margin-left: auto; }
.fab-boards { display: flex; flex-direction: column; margin: 0 0 4px 34px; max-height: 180px; overflow: auto; }
.fab-boards button { border: 0; background: transparent; text-align: left; padding: 5px 8px; border-radius: 8px; font: inherit; font-size: 14px; color: inherit; cursor: pointer; }
.fab-boards button.on { font-weight: 700; background: #fff27a; }
</style>
