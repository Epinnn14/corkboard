<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { agenda, dueLabel, noteTitle } from '../core/dates';
import { boardRect } from '../core/workspace';
import { useWorkspace } from '../stores/workspace';
import BoardView from './BoardView.vue';

/**
 * A compact "desk widget": today's date, the clock, what's next and a live
 * mini board. Open corkboard at #widget in a small installed-app window
 * (Windows) or from the home screen (phone).
 */
const store = useWorkspace();
const clock = ref(new Date());
let t: ReturnType<typeof setInterval> | undefined;
onMounted(() => (t = setInterval(() => (clock.value = new Date()), 1000)));
onBeforeUnmount(() => clearInterval(t));

const KEY = 'corkboard:widget-board';
const saved = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
const boardId = ref<string | null>(saved);
const board = computed(() => store.boards.find((b) => b.id === boardId.value) ?? store.active ?? store.boards[0] ?? null);
function pick(id: string) {
  boardId.value = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* fine without it */
  }
}

const upNext = computed(() =>
  agenda(store.boards, clock.value)
    .filter((g) => g.state !== 'done')
    .flatMap((g) => g.items.map((i) => ({ ...i, state: g.state })))
    .slice(0, 5),
);

const weekday = computed(() => clock.value.toLocaleDateString('en-GB', { weekday: 'long' }));
const dateLine = computed(() => clock.value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
const time = computed(() => clock.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

// fit the mini board into its box
const box = ref<HTMLElement | null>(null);
const boxSize = ref({ w: 400, h: 260 });
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (boxSize.value = { w: e.contentRect.width, h: e.contentRect.height }));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());
const fit = computed(() => {
  if (!board.value) return { s: 1, x: 0, y: 0, w: 0, h: 0 };
  const r = boardRect(board.value);
  const s = Math.min(boxSize.value.w / r.w, boxSize.value.h / r.h);
  return { s, x: r.x, y: r.y, w: r.w * s, h: r.h * s };
});
provide('scale', computed(() => fit.value.s));

function openApp() {
  window.location.hash = '';
}
</script>

<template>
  <div class="widget">
    <section class="today">
      <p class="weekday">{{ weekday }}</p>
      <p class="date">{{ dateLine }}</p>
      <p class="time">{{ time }}</p>
      <h2>Up next</h2>
      <ul v-if="upNext.length" class="next">
        <li v-for="{ note, board: b, state } in upNext" :key="note.id" :class="state">
          <span class="dot" />
          <span class="what">{{ noteTitle(note) }}</span>
          <span class="when">{{ dueLabel(note.due!, clock) }}</span>
          <span class="sr-only"> on {{ b.title }}</span>
        </li>
      </ul>
      <p v-else class="free">Nothing due. Enjoy the free time ✨</p>
      <button class="open" @click="openApp">Open corkboard →</button>
    </section>
    <section class="mini">
      <div ref="box" class="box">
        <div v-if="board" class="frame" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }">
          <div class="scaled" :style="{ transform: `scale(${fit.s}) translate(${-fit.x}px, ${-fit.y}px)` }">
            <BoardView :board="board" />
          </div>
        </div>
        <p v-else class="free">No boards yet</p>
      </div>
      <label v-if="store.boards.length > 1" class="pick">
        <span>Board</span>
        <select id="widget-board" :value="board?.id" @change="pick(($event.target as HTMLSelectElement).value)">
          <option v-for="b in store.boards" :key="b.id" :value="b.id">{{ b.title }}</option>
        </select>
      </label>
    </section>
  </div>
</template>

<style scoped>
.widget {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 18px;
  padding: 18px max(16px, env(safe-area-inset-right, 0px)) 18px max(16px, env(safe-area-inset-left, 0px));
  background: radial-gradient(circle, rgba(43, 38, 32, 0.1) 1px, transparent 1.2px) 0 0 / 24px 24px, var(--wall);
  overflow: hidden;
}
.today {
  background: #fff27a;
  border-radius: 4px 4px 28px 4px;
  padding: 22px 20px 18px;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.2), 0 14px 26px rgba(0, 0, 0, 0.16);
  transform: rotate(-1.2deg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.weekday { margin: 0; font: 700 40px/1 'Caveat', cursive; }
.date { margin: 4px 0 0; font-weight: 600; }
.time { margin: 6px 0 14px; font-size: 44px; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; line-height: 1; }
h2 { margin: 0 0 6px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.65; }
.next { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow: hidden; }
.next li { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; font-size: 14px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #2b2620; }
.overdue .dot { background: #d9412b; }
.today .dot { background: #f08c1a; }
.tomorrow .dot { background: #7a5cf0; }
.what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 20px/1.1 'Caveat', cursive; }
.when { font-size: 12px; font-weight: 600; opacity: 0.7; white-space: nowrap; }
.overdue .when { color: #b3301c; opacity: 1; }
.free { margin: 0; font: 20px 'Caveat', cursive; opacity: 0.7; }
.open { margin-top: auto; align-self: flex-start; border: 0; background: #2b2620; color: #fff; border-radius: 999px; padding: 7px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.mini { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.box { flex: 1; min-height: 0; display: grid; place-items: center; }
.frame { position: relative; overflow: hidden; pointer-events: none; }
.scaled { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.scaled :deep(.tab) { display: none; }
.pick { display: flex; gap: 8px; align-items: center; justify-content: flex-end; font-size: 13px; }
.pick span { opacity: 0.6; }
.pick select { font: inherit; border: 1px solid rgba(43, 38, 32, 0.2); border-radius: 8px; padding: 4px 8px; background: #fffdf8; color: inherit; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 620px) {
  .widget { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .today { transform: none; }
  .time { font-size: 38px; }
}
@media (max-width: 620px) and (max-height: 520px) {
  .mini { display: none; }
}
</style>
