<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue';
import { type Board, BOARD_SIZE, type Surface, SURFACES } from '../core/board';
import { surfaceTile } from '../core/texture';
import { FRAME } from '../core/workspace';
import { useWorkspace } from '../stores/workspace';
import NoteItem from './NoteItem.vue';

const props = defineProps<{ board: Board }>();
const store = useWorkspace();
const scale = inject<Ref<number>>('scale', ref(1));
const size = computed(() => BOARD_SIZE[props.board.orientation]);
const active = computed(() => store.active?.id === props.board.id);
const holdsDrag = computed(() => !!store.draggingId && props.board.notes.some((n) => n.id === store.draggingId));
const moving = ref(false);

const surfaces = Object.entries(SURFACES) as [Surface, string][];
const corkImage = computed(() => {
  const tile = surfaceTile(props.board.surface);
  return tile ? `url(${tile})` : 'none';
});

// ---- drag the board by its frame or its name tag
let start: { px: number; py: number; x: number; y: number; id: number } | null = null;

function onFrameDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  const onFrame = t === e.currentTarget || t.classList.contains('tab') || t.classList.contains('tab-grip');
  if (!onFrame || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  store.setActive(props.board.id);
  store.select(null);
  start = { px: e.clientX, py: e.clientY, x: props.board.x, y: props.board.y, id: e.pointerId };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  moving.value = true;
}

function onFrameMove(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  store.moveBoard(
    props.board.id,
    start.x + (e.clientX - start.px) / scale.value,
    start.y + (e.clientY - start.py) / scale.value,
  );
}

function onFrameUp(e: PointerEvent) {
  if (start && e.pointerId === start.id) {
    start = null;
    moving.value = false;
  }
}

// a press on the empty cork makes this the active board; dragging it then pans the view
// (the workspace picks it up) without moving the board
function onCorkDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (t !== e.currentTarget && !t.classList.contains('empty')) return;
  (document.activeElement as HTMLElement | null)?.blur?.();
  store.select(null);
  store.setActive(props.board.id);
}

function onCorkDblClick(e: MouseEvent) {
  if (e.target !== e.currentTarget) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  store.addNote('sticky', {
    boardId: props.board.id,
    at: { x: (e.clientX - r.left) / scale.value, y: (e.clientY - r.top) / scale.value },
  });
}
</script>

<template>
  <section
    class="board"
    :class="{ active, moving, lifting: holdsDrag }"
    :data-board-id="board.id"
    :style="{
      left: `${board.x}px`,
      top: `${board.y}px`,
      width: `${size.w + FRAME * 2}px`,
      height: `${size.h + FRAME * 2}px`,
      '--frame': `${FRAME}px`,
    }"
    :aria-label="board.title"
    @pointerdown="onFrameDown"
    @pointermove="onFrameMove"
    @pointerup="onFrameUp"
    @pointercancel="onFrameUp"
  >
    <header class="tab">
      <span class="tab-grip" aria-hidden="true">⋮⋮</span>
      <input
        class="tab-title"
        :value="board.title"
        maxlength="80"
        aria-label="Board name"
        @input="store.renameBoard(board.id, ($event.target as HTMLInputElement).value)"
        @pointerdown.stop
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <span class="tab-count">{{ board.notes.length }} notes</span>
      <span class="surfaces" role="group" aria-label="Board surface">
        <button
          v-for="[id, label] in surfaces"
          :key="id"
          class="surface-dot"
          :class="[id, { on: board.surface === id }]"
          :title="label"
          :aria-pressed="board.surface === id"
          @pointerdown.stop
          @click="store.setSurface(board.id, id)"
        />
      </span>
      <button class="tab-btn" title="Remove all notes" @pointerdown.stop @click="store.clearBoard(board.id)">Clear</button>
      <button class="tab-btn danger" title="Delete this board" @pointerdown.stop @click="store.removeBoard(board.id)">
        Delete
      </button>
    </header>
    <div
      class="cork"
      :class="`surface-${board.surface}`"
      :style="{ width: `${size.w}px`, height: `${size.h}px`, '--cork': corkImage }"
      data-testid="cork"
      @pointerdown="onCorkDown"
      @dblclick="onCorkDblClick"
    >
      <NoteItem v-for="n in board.notes" :key="n.id" :note="n" />
      <p v-if="!board.notes.length" class="empty">Double-click anywhere to pin a note</p>
    </div>
  </section>
</template>

<style scoped>
.board {
  position: absolute;
  padding: var(--frame);
  border-radius: 6px;
  cursor: move;
  background:
    repeating-linear-gradient(90deg, rgba(120, 70, 20, 0.12) 0 2px, transparent 2px 9px, rgba(255, 230, 190, 0.1) 9px 10px, transparent 10px 17px),
    repeating-linear-gradient(0deg, rgba(120, 70, 20, 0.12) 0 2px, transparent 2px 11px, rgba(255, 230, 190, 0.08) 11px 12px, transparent 12px 19px),
    linear-gradient(135deg, #e3b778, #c88f4d 40%, #dcae6d 70%, #b98142);
  box-shadow:
    inset 0 0 0 2px rgba(255, 236, 200, 0.55),
    inset 0 0 0 3px rgba(90, 50, 15, 0.35),
    0 18px 40px rgba(0, 0, 0, 0.3),
    0 3px 8px rgba(0, 0, 0, 0.2);
}
.board.active { box-shadow: inset 0 0 0 2px rgba(255, 236, 200, 0.55), inset 0 0 0 3px rgba(90, 50, 15, 0.35), 0 0 0 6px rgba(43, 38, 32, 0.18), 0 24px 50px rgba(0, 0, 0, 0.35); }
.board.moving { box-shadow: 0 40px 80px rgba(0, 0, 0, 0.35); z-index: 5; }
.board.lifting { z-index: 10; }

.tab {
  position: absolute;
  left: 18px;
  bottom: calc(100% + 10px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: #fbf8f1;
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  font: 22px 'Bricolage Grotesque Variable', system-ui, sans-serif;
  color: #2b2620;
  white-space: nowrap;
}
.tab-grip { color: rgba(43, 38, 32, 0.4); letter-spacing: -4px; cursor: move; }
.tab-title {
  font: 700 34px 'Caveat', cursive;
  border: 0;
  background: transparent;
  color: inherit;
  width: 12ch;
  padding: 0 4px;
  border-radius: 6px;
  cursor: text;
}
.tab-title:focus { outline: 2px solid rgba(43, 38, 32, 0.3); }
.tab-count { color: rgba(43, 38, 32, 0.55); font-size: 18px; }
.tab-btn {
  font: inherit;
  font-size: 18px;
  background: transparent;
  border: 1px solid rgba(43, 38, 32, 0.2);
  border-radius: 999px;
  padding: 3px 12px;
  cursor: pointer;
  color: inherit;
  opacity: 0;
  transition: opacity 0.15s;
}
.board.active .tab-btn, .board:hover .tab-btn { opacity: 1; }
.tab-btn.danger { color: #a3341f; }

.cork {
  position: relative;
  overflow: hidden;
  cursor: default;
  background-color: #c79559;
  background-image:
    radial-gradient(ellipse at 30% 20%, rgba(255, 220, 170, 0.25), transparent 60%),
    radial-gradient(ellipse at 80% 90%, rgba(90, 50, 15, 0.25), transparent 55%),
    var(--cork);
  box-shadow: inset 0 0 0 1px rgba(80, 45, 10, 0.5), inset 0 3px 10px rgba(60, 30, 5, 0.45);
}
.board.lifting .cork { overflow: visible; }
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  font: 40px 'Caveat', cursive;
  color: rgba(60, 35, 10, 0.55);
  pointer-events: none;
}
.surface-felt .empty { color: rgba(220, 228, 255, 0.55); }
.cork.surface-felt { background-color: #242e4a; background-image: radial-gradient(ellipse at 30% 20%, rgba(140, 160, 220, 0.18), transparent 60%), var(--cork); box-shadow: inset 0 0 0 1px rgba(5, 8, 20, 0.6), inset 0 3px 12px rgba(0, 0, 0, 0.5); }
.cork.surface-blush { background-color: #f4cdd0; background-image: radial-gradient(ellipse at 70% 10%, rgba(255, 255, 255, 0.35), transparent 60%), var(--cork); box-shadow: inset 0 0 0 1px rgba(150, 80, 90, 0.35), inset 0 3px 10px rgba(120, 60, 70, 0.25); }
.cork.surface-paper { background-color: #faf9f5; background-image: var(--cork); box-shadow: inset 0 0 0 1px rgba(60, 60, 80, 0.2), inset 0 3px 10px rgba(40, 40, 60, 0.12); }
.surfaces { display: inline-flex; gap: 6px; opacity: 0; transition: opacity 0.15s; }
.board.active .surfaces, .board:hover .surfaces { opacity: 1; }
.surface-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(43, 38, 32, 0.2); padding: 0; cursor: pointer; }
.surface-dot.on { border-color: #2b2620; box-shadow: 0 0 0 2px #fbf8f1 inset; }
.surface-dot.cork { background: #c79559; }
.surface-dot.felt { background: #242e4a; }
.surface-dot.blush { background: #f4cdd0; }
.surface-dot.paper { background: radial-gradient(circle, #9aa 1px, transparent 1.5px) 0 0 / 6px 6px, #faf9f5; }
</style>
