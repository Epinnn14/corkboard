<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import type { Board } from '../core/board';
import { dueLabel, noteTitle } from '../core/dates';
import { type DeskConfig, type DeskItem, deskLists } from '../core/desk';
import { boardRect } from '../core/workspace';
import BoardView from './BoardView.vue';

/**
 * The desktop widget: any mix of date & clock, today's reminders, the coming
 * week and a mini board, in three styles. Runs in a small app window
 * (#widget), as a Lively wallpaper (wall layout + snapshot) and as the live
 * preview in the "Add to desktop" sheet.
 */
const props = defineProps<{
  config: DeskConfig;
  boards: readonly Board[];
  /** set when showing a wallpaper snapshot: when it was taken */
  snapshotAt?: number | null;
  preview?: boolean;
}>();
const emit = defineEmits<{ board: [id: string]; open: [] }>();

const clock = ref(new Date());
let t: ReturnType<typeof setInterval> | undefined;
onMounted(() => (t = setInterval(() => (clock.value = new Date()), 1000)));
onBeforeUnmount(() => clearInterval(t));

const show = (p: DeskConfig['parts'][number]) => props.config.parts.includes(p);
const board = computed(() =>
  show('board') ? (props.boards.find((b) => b.id === props.config.boardId) ?? props.boards[0] ?? null) : null,
);

const lists = computed(() => deskLists(props.boards, clock.value));
const limit = computed(() => (props.config.wall ? 8 : show('today') && show('week') ? 4 : 7));
const cut = (items: DeskItem[]) => items.slice(0, limit.value);
const more = (items: DeskItem[]) => Math.max(0, items.length - limit.value);

const weekday = computed(() => clock.value.toLocaleDateString('en-GB', { weekday: 'long' }));
const dateLine = computed(() => clock.value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
const time = computed(() => clock.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
const snapLine = computed(() =>
  props.snapshotAt
    ? new Date(props.snapshotAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '',
);
const hasCard = computed(() => show('clock') || show('today') || show('week'));

// fit the mini board into its box
const box = ref<HTMLElement | null>(null);
const boxSize = ref({ w: 400, h: 260 });
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return;
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
</script>

<template>
  <div
    class="widget"
    :class="[`th-${config.theme}`, { wall: config.wall, solo: !board, 'no-card': !hasCard, preview }]"
  >
    <section v-if="hasCard" class="card">
      <template v-if="show('clock')">
        <p class="weekday">{{ weekday }}</p>
        <p class="date">{{ dateLine }}</p>
        <p class="time">{{ time }}</p>
      </template>

      <template v-if="show('today')">
        <h2>Today</h2>
        <ul v-if="lists.today.length" class="next">
          <li v-for="{ note, state } in cut(lists.today)" :key="note.id" :class="state">
            <span class="dot" />
            <span class="what">{{ noteTitle(note) }}</span>
            <span class="when">{{ dueLabel(note.due!, clock) }}</span>
          </li>
          <li v-if="more(lists.today)" class="more">+{{ more(lists.today) }} more</li>
        </ul>
        <p v-else class="free">Nothing due today ✨</p>
      </template>

      <template v-if="show('week')">
        <h2>Coming up</h2>
        <ul v-if="lists.week.length" class="next">
          <li v-for="{ note, state } in cut(lists.week)" :key="note.id" :class="state">
            <span class="dot" />
            <span class="what">{{ noteTitle(note) }}</span>
            <span class="when">{{ dueLabel(note.due!, clock) }}</span>
          </li>
          <li v-if="more(lists.week)" class="more">+{{ more(lists.week) }} more</li>
        </ul>
        <p v-else class="free">A free week ahead</p>
      </template>

      <p v-if="snapLine" class="snap">From corkboard, {{ snapLine }}</p>
      <button v-else-if="!config.wall && !preview" class="open" @click="emit('open')">Open corkboard →</button>
    </section>

    <section v-if="board" class="mini">
      <div ref="box" class="box">
        <div class="frame" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }">
          <div class="scaled" :style="{ transform: `scale(${fit.s}) translate(${-fit.x}px, ${-fit.y}px)` }">
            <BoardView :board="board" />
          </div>
        </div>
      </div>
      <label v-if="boards.length > 1 && !snapshotAt && !config.wall && !preview" class="pick">
        <span>Board</span>
        <select id="widget-board" :value="board.id" @change="emit('board', ($event.target as HTMLSelectElement).value)">
          <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
        </select>
      </label>
    </section>
  </div>
</template>

<style scoped>
.widget {
  --card: #fff27a;
  --card-ink: #2b2620;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 18px;
  padding: 18px max(16px, env(safe-area-inset-right, 0px)) 18px max(16px, env(safe-area-inset-left, 0px));
  background: radial-gradient(circle, rgba(43, 38, 32, 0.1) 1px, transparent 1.2px) 0 0 / 24px 24px, var(--wall);
  overflow: hidden;
  color: var(--card-ink);
}
.widget.solo { grid-template-columns: minmax(0, 420px); justify-content: center; }
.widget.no-card { grid-template-columns: 1fr; }
.th-paper { --card: #fffdf8; }
.th-dark {
  --card: rgba(30, 27, 24, 0.86);
  --card-ink: #f6f1e7;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1.2px) 0 0 / 24px 24px, #1b1916;
}
.th-dark .pick { color: #f6f1e7; }

.card {
  background: var(--card);
  color: var(--card-ink);
  border-radius: 4px 4px 28px 4px;
  padding: 22px 20px 18px;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.2), 0 14px 26px rgba(0, 0, 0, 0.16);
  transform: rotate(-1.2deg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.solo .card { transform: none; align-self: start; max-height: 100%; }
.th-paper .card {
  border-radius: 6px;
  background: repeating-linear-gradient(transparent 0 27px, rgba(90, 130, 200, 0.18) 27px 28px) 0 14px, var(--card);
  border-left: 3px solid rgba(217, 65, 43, 0.35);
}
.th-dark .card { border-radius: 18px; transform: none; backdrop-filter: blur(14px); box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); }

.weekday { margin: 0; font: 700 40px/1 'Caveat', cursive; }
.date { margin: 4px 0 0; font-weight: 600; }
.time { margin: 6px 0 10px; font-size: 44px; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; line-height: 1; }
h2 { margin: 10px 0 6px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.65; }
.card > h2:first-child { margin-top: 0; }
.next { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.next li { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; font-size: 14px; }
.next li.more { display: block; font-size: 12px; opacity: 0.6; padding-left: 18px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; opacity: 0.8; }
.overdue .dot { background: #d9412b; opacity: 1; }
.today .dot { background: #f08c1a; opacity: 1; }
.tomorrow .dot { background: #7a5cf0; opacity: 1; }
.what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 20px/1.1 'Caveat', cursive; }
.when { font-size: 12px; font-weight: 600; opacity: 0.7; white-space: nowrap; }
.overdue .when { color: #d9412b; opacity: 1; }
.free { margin: 0; font: 20px 'Caveat', cursive; opacity: 0.7; }
.snap { margin: auto 0 0; padding-top: 10px; font-size: 11px; opacity: 0.55; }
.open { margin-top: auto; align-self: flex-start; border: 0; background: var(--card-ink); color: var(--card); border-radius: 999px; padding: 7px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.th-dark .open { color: #1b1916; }
.mini { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.box { flex: 1; min-height: 0; display: grid; place-items: center; }
.frame { position: relative; overflow: hidden; pointer-events: none; }
.scaled { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.scaled :deep(.tab) { display: none; }
.pick { display: flex; gap: 8px; align-items: center; justify-content: flex-end; font-size: 13px; }
.pick span { opacity: 0.6; }
.pick select { font: inherit; border: 1px solid rgba(43, 38, 32, 0.2); border-radius: 8px; padding: 4px 8px; background: #fffdf8; color: #2b2620; }

/* wallpaper (Lively): board on the left, the card big on the right, room for desktop icons */
.wall {
  grid-template-columns: 1fr minmax(320px, 26vw);
  padding: 6vh 4vw 9vh 9vw;
  gap: 4vw;
  align-items: center;
}
.wall.solo { grid-template-columns: minmax(320px, 26vw); justify-content: end; }
.wall .card { padding: 32px 30px 26px; max-height: 100%; align-self: center; }
.wall .weekday { font-size: clamp(40px, 4vw, 72px); }
.wall .time { font-size: clamp(44px, 5vw, 96px); }
.wall .what { font-size: clamp(20px, 1.5vw, 28px); }
.wall .next li { font-size: clamp(14px, 1vw, 17px); }
.wall .mini { height: 100%; order: -1; }
.wall.solo { align-items: start; padding-top: 10vh; }
.wall.solo .card { align-self: start; }
.wall .when { font-size: clamp(12px, 0.85vw, 15px); }
.wall h2 { font-size: clamp(12px, 0.8vw, 14px); margin-top: 16px; }
.wall .next { gap: 10px; }
.wall .date { font-size: clamp(15px, 1.1vw, 20px); }

@media (max-width: 620px) {
  .widget:not(.wall):not(.solo) { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .card { transform: none; }
  .time { font-size: 38px; }
}
@media (max-width: 620px) and (max-height: 520px) {
  .widget:not(.wall) .mini { display: none; }
}
</style>
