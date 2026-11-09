<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { BOARD_SIZE } from '../core/board';
import { corkTile } from '../core/texture';
import { useBoard } from '../stores/board';
import NoteItem from './NoteItem.vue';

const FRAME = 26;
const store = useBoard();
const area = ref<HTMLElement | null>(null);
const boardEl = ref<HTMLElement | null>(null);
const avail = ref({ w: 1200, h: 800 });
const size = computed(() => BOARD_SIZE[store.board.orientation]);
const scale = computed(() =>
  Math.max(0.2, Math.min(avail.value.w / (size.value.w + FRAME * 2), avail.value.h / (size.value.h + FRAME * 2), 1.5)),
);
provide('scale', scale);
defineExpose({ boardEl });

const tile = corkTile();
const corkImage = tile ? `url(${tile})` : 'none';

let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([entry]) => {
    avail.value = { w: entry.contentRect.width, h: entry.contentRect.height };
  });
  if (area.value) ro.observe(area.value);
});
onBeforeUnmount(() => ro?.disconnect());

function toBoard(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale.value, y: (e.clientY - r.top) / scale.value };
}

function onBoardDown(e: PointerEvent) {
  if (e.target === e.currentTarget) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    store.select(null);
  }
}

function onBoardDblClick(e: MouseEvent) {
  if (e.target !== e.currentTarget) return;
  store.add('sticky', toBoard(e));
}
</script>

<template>
  <div ref="area" class="area">
    <div
      class="frame"
      :style="{
        width: `${(size.w + FRAME * 2) * scale}px`,
        height: `${(size.h + FRAME * 2) * scale}px`,
      }"
    >
      <div
        ref="boardEl"
        class="board"
        :style="{
          width: `${size.w + FRAME * 2}px`,
          height: `${size.h + FRAME * 2}px`,
          transform: `scale(${scale})`,
          '--frame': `${FRAME}px`,
        }"
      >
        <div
          class="cork"
          :style="{ width: `${size.w}px`, height: `${size.h}px`, '--cork': corkImage }"
          data-testid="cork"
          @pointerdown="onBoardDown"
          @dblclick="onBoardDblClick"
        >
          <NoteItem v-for="n in store.notes" :key="n.id" :note="n" />
          <p v-if="!store.notes.length" class="empty">Double-click anywhere to pin a note</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.area { flex: 1; min-height: 0; display: grid; place-items: center; padding: 8px 16px 96px; }
.frame { position: relative; }
.board {
  transform-origin: 0 0;
  padding: var(--frame);
  border-radius: 6px;
  /* wooden frame: base tone, grain lines, bevel */
  background:
    repeating-linear-gradient(90deg, rgba(120, 70, 20, 0.12) 0 2px, transparent 2px 9px, rgba(255, 230, 190, 0.1) 9px 10px, transparent 10px 17px),
    repeating-linear-gradient(0deg, rgba(120, 70, 20, 0.12) 0 2px, transparent 2px 11px, rgba(255, 230, 190, 0.08) 11px 12px, transparent 12px 19px),
    linear-gradient(135deg, #e3b778, #c88f4d 40%, #dcae6d 70%, #b98142);
  box-shadow:
    inset 0 0 0 2px rgba(255, 236, 200, 0.55),
    inset 0 0 0 3px rgba(90, 50, 15, 0.35),
    0 18px 40px rgba(0, 0, 0, 0.35),
    0 3px 8px rgba(0, 0, 0, 0.25);
}
.cork {
  position: relative;
  overflow: hidden;
  background-color: #c79559;
  background-image:
    radial-gradient(ellipse at 30% 20%, rgba(255, 220, 170, 0.25), transparent 60%),
    radial-gradient(ellipse at 80% 90%, rgba(90, 50, 15, 0.25), transparent 55%),
    var(--cork);
  box-shadow: inset 0 0 0 1px rgba(80, 45, 10, 0.5), inset 0 3px 10px rgba(60, 30, 5, 0.45);
}
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  font: 34px 'Caveat', cursive;
  color: rgba(60, 35, 10, 0.55);
  pointer-events: none;
}
</style>
