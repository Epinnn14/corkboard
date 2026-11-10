<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import {
  boardRect,
  bounds,
  type Camera,
  fit,
  type Size,
  visibleArea,
  zoomAt,
} from '../core/workspace';
import { useWorkspace } from '../stores/workspace';
import BoardView from './BoardView.vue';

const store = useWorkspace();
const viewport = ref<HTMLElement | null>(null);
const size = ref<Size>({ w: 1200, h: 800 });
const cam = computed<Camera>(() => store.ws.camera ?? { x: 0, y: 0, zoom: 0.6 });
const zoom = computed(() => cam.value.zoom);
provide('scale', zoom);

const setCam = (c: Camera) => store.setCamera(c);

function fitAll() {
  const r = bounds(store.boards);
  if (r) setCam(fit({ ...r, y: r.y - 80, h: r.h + 80 }, size.value, 48, 1));
}

function focusBoard(id: string) {
  const b = store.board(id);
  if (!b) return;
  store.setActive(id);
  const r = boardRect(b);
  const TAB = 80; // the name tag sits above the frame
  setCam(fit({ ...r, y: r.y - TAB, h: r.h + TAB }, size.value, 28, 1));
}

function zoomBy(factor: number) {
  setCam(zoomAt(cam.value, factor, { x: size.value.w / 2, y: size.value.h / 2 }));
}

function isVisible(id: string) {
  const b = store.board(id);
  return !!b && visibleArea(b, cam.value, size.value) > 0;
}

defineExpose({ fitAll, focusBoard, zoomBy, isVisible, size });

// ---- after the camera settles, the board you're looking at becomes active
let settle: ReturnType<typeof setTimeout> | undefined;
watch(
  () => store.ws.camera,
  () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (store.selectedId || !store.boards.length) return;
      const best = store.boards
        .map((b) => ({ id: b.id, a: visibleArea(b, cam.value, size.value) }))
        .sort((a, b) => b.a - a.a)[0];
      if (best && best.a > 0) store.setActive(best.id);
    }, 160);
  },
  { deep: true },
);

// ---- pan with one pointer on empty space (on or between the boards), pinch with two
const pointers = new Map<number, { x: number; y: number }>();
let panStart: { x: number; y: number; cam: Camera } | null = null;
let pinchStart: { dist: number; mid: { x: number; y: number }; cam: Camera } | null = null;
const panning = ref(false);

function local(e: PointerEvent) {
  const r = viewport.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  // empty space outside the boards, and the empty cork inside them, both pan
  if (!(t === viewport.value || t.classList.contains('world') || t.matches('.cork, .cork > .empty'))) return;
  (document.activeElement as HTMLElement | null)?.blur?.();
  store.select(null);
  viewport.value!.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  if (pointers.size === 1) {
    panStart = { ...local(e), cam: { ...cam.value } };
    panning.value = true;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      cam: { ...cam.value },
    };
    panStart = null;
  }
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, local(e));
  if (pinchStart && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const z = zoomAt(pinchStart.cam, dist / pinchStart.dist, pinchStart.mid);
    setCam({ ...z, x: z.x + mid.x - pinchStart.mid.x, y: z.y + mid.y - pinchStart.mid.y });
  } else if (panStart) {
    const p = local(e);
    setCam({ ...panStart.cam, x: panStart.cam.x + p.x - panStart.x, y: panStart.cam.y + p.y - panStart.y });
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) {
    panStart = null;
    panning.value = false;
  }
}

/** Mouse wheel zooms; trackpad two-finger scroll pans; pinch (ctrl+wheel) zooms. */
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const r = viewport.value!.getBoundingClientRect();
  const anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
  const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (e.ctrlKey || mouseWheel) {
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    setCam(zoomAt(cam.value, factor, anchor));
  } else {
    setCam({ ...cam.value, x: cam.value.x - e.deltaX, y: cam.value.y - e.deltaY });
  }
}

let ro: ResizeObserver | undefined;
onMounted(() => {
  const el = viewport.value!;
  const r = el.getBoundingClientRect();
  size.value = { w: r.width || 1200, h: r.height || 800 };
  ro = new ResizeObserver(([entry]) => {
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height };
  });
  ro.observe(el);
  el.addEventListener('wheel', onWheel, { passive: false });
  // first time: show every board
  if (!store.ws.camera && store.boards[0]) fitAll();
});
onBeforeUnmount(() => {
  ro?.disconnect();
  viewport.value?.removeEventListener('wheel', onWheel);
  clearTimeout(settle);
});
</script>

<template>
  <div
    ref="viewport"
    class="viewport"
    :class="{ panning }"
    data-testid="viewport"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <div
      class="world"
      :style="{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }"
    >
      <BoardView v-for="b in store.boards" :key="b.id" :board="b" />
    </div>
    <div v-if="!store.boards.length" class="no-boards">
      <p>No boards yet.</p>
      <slot name="empty" />
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background-color: var(--wall);
  background-image: radial-gradient(circle, rgba(43, 38, 32, 0.12) 1px, transparent 1.2px);
  background-size: 28px 28px;
}
.viewport.panning { cursor: grabbing; }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; width: 1px; height: 1px; }
.no-boards {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
  font: 30px 'Caveat', cursive;
  color: rgba(43, 38, 32, 0.6);
  pointer-events: none;
}
.no-boards p { margin: 0; }
.no-boards :slotted(*) { pointer-events: auto; }
</style>
