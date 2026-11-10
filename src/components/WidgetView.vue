<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import type { Board } from '../core/board';
import { dueLabel } from '../core/dates';
import { DESK_MIN, type DeskConfig, type DeskItem, deskLists, greeting } from '../core/desk';
import { surfaceTile } from '../core/texture';
import { corkRect } from '../core/workspace';
import { useWorkspace } from '../stores/workspace';
import BoardView from './BoardView.vue';
import PushPin from './PushPin.vue';

/**
 * The desktop widget: a little pinboard with a tear-off calendar page and
 * the time, today's reminders on a sticky note (tick them off right here),
 * what's coming up on an index card, and optionally a live mini board.
 * Runs as #widget (a browser pop-up, the Windows app's widget) and as the
 * preview in "Add to desktop".
 */
const props = defineProps<{
  config: DeskConfig;
  boards: readonly Board[];
  preview?: boolean;
  /** inside the Windows app: transparent window, dragged by its top strip */
  desk?: boolean;
  onTop?: boolean;
  /** as tall as its content (no fixed window height) */
  fit?: boolean;
}>();
const emit = defineEmits<{
  board: [id: string];
  open: [];
  reveal: [noteId: string];
  customize: [];
  'on-top': [boolean];
  hide: [];
  /** with `fit`: the height it needs */
  natural: [height: number];
  /** the resize grip (Windows app): live size while dragging, then the final one */
  resizing: [w: number, h: number];
  resized: [w: number, h: number];
}>();
const store = useWorkspace();

const clock = ref(new Date());
let t: ReturnType<typeof setInterval> | undefined;
onMounted(() => (t = setInterval(() => (clock.value = new Date()), 1000)));
onBeforeUnmount(() => clearInterval(t));

const show = (p: DeskConfig['parts'][number]) => props.config.parts.includes(p);
const board = computed(() =>
  show('board') ? (props.boards.find((b) => b.id === props.config.boardId) ?? props.boards[0] ?? null) : null,
);

const lists = computed(() => deskLists(props.boards, clock.value));
const LIMIT = 5;
const cut = (items: DeskItem[]) => items.slice(0, LIMIT);
const more = (items: DeskItem[]) => Math.max(0, items.length - LIMIT);

const month = computed(() => clock.value.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase());
const day = computed(() => clock.value.getDate());
const weekday = computed(() => clock.value.toLocaleDateString('en-GB', { weekday: 'long' }));
const time = computed(() => clock.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
const hello = computed(() => greeting(clock.value));
const summary = computed(() => {
  const n = lists.value.today.length;
  const late = lists.value.today.filter((i) => i.state === 'overdue').length;
  if (!n) return 'Nothing due today';
  return `${n} thing${n === 1 ? '' : 's'} today${late ? ` · ${late} late` : ''}`;
});
/** short "when": just the time today, the day name later on */
function when(i: DeskItem) {
  const label = dueLabel(i.due, clock.value);
  if (i.state === 'today') return label.replace(/^Today /, '');
  if (i.state === 'overdue' && label.startsWith('Today ')) return `late ${label.slice(6)}`;
  return label;
}

const cork = computed(() => {
  const tile = surfaceTile('cork');
  return tile ? `url(${tile})` : 'none';
});

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
const miniFit = computed(() => {
  if (!board.value) return { s: 1, x: 0, y: 0, w: 0, h: 0 };
  // just the cork area: the notes sit straight on the widget, not on a second board
  const r = corkRect(board.value);
  const s = Math.min(boxSize.value.w / r.w, boxSize.value.h / r.h);
  return { s, x: r.x, y: r.y, w: r.w * s, h: r.h * s };
});
provide('scale', computed(() => miniFit.value.s));

// report the height the content needs (the Windows app sizes its widget window to it)
const root = ref<HTMLElement | null>(null);
let rootRo: ResizeObserver | undefined;
onMounted(() => {
  if (!props.fit || typeof ResizeObserver === 'undefined' || !root.value) return;
  rootRo = new ResizeObserver(() => root.value && emit('natural', Math.ceil(root.value.getBoundingClientRect().height)));
  rootRo.observe(root.value);
});
onBeforeUnmount(() => rootRo?.disconnect());

// the resize grip at the bottom-left corner (the window stays anchored at its right edge)
let grip: { x: number; y: number; w: number; h: number; id: number } | null = null;
let raf = 0;
let next: [number, number] | null = null;
function gripDown(e: PointerEvent) {
  e.preventDefault();
  grip = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight, id: e.pointerId };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function gripSize(e: PointerEvent): [number, number] {
  return [Math.max(DESK_MIN.w, Math.round(grip!.w - (e.screenX - grip!.x))), Math.max(DESK_MIN.h, Math.round(grip!.h + (e.screenY - grip!.y)))];
}
function gripMove(e: PointerEvent) {
  if (!grip || e.pointerId !== grip.id) return;
  next = gripSize(e);
  if (!raf) {
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (next) emit('resizing', ...next);
    });
  }
}
function gripUp(e: PointerEvent) {
  if (!grip || e.pointerId !== grip.id) return;
  const [w, h] = gripSize(e);
  grip = null;
  emit('resized', w, h);
}

const live = computed(() => !props.preview);
function tick(i: DeskItem) {
  if (live.value) store.toggleItem(i);
}

const menuOpen = ref(false);
function pick(fn: () => void) {
  menuOpen.value = false;
  fn();
}
</script>

<template>
  <div
    ref="root"
    class="widget"
    :class="[`th-${config.theme}`, { preview, desk, wide: !!board, fit: fit && !board && !config.size, sized: !!config.size }]"
  >
    <div class="panel" :style="{ '--cork': cork }">
      <header class="w-head">
        <div v-if="show('clock')" class="cal" aria-label="Today">
          <PushPin class="cal-pin" color="red" />
          <span class="cal-month">{{ month }}</span>
          <span class="cal-day">{{ day }}</span>
          <span class="cal-week">{{ weekday }}</span>
        </div>
        <div class="hello">
          <p class="greet">{{ hello }}</p>
          <p v-if="show('clock')" class="time">{{ time }}</p>
          <p class="sum" :class="{ late: lists.today.some((i) => i.state === 'overdue') }">{{ summary }}</p>
        </div>
      </header>
      <div v-if="!preview" class="w-menu-wrap">
        <button class="w-menu-btn" aria-label="Widget menu" :aria-expanded="menuOpen" data-action="widget-menu" @click="menuOpen = !menuOpen">
          ⋯
        </button>
        <div v-if="menuOpen" class="w-menu" role="menu">
          <button role="menuitem" data-action="widget-open" @click="pick(() => emit('open'))">↗ Open corkboard</button>
          <button role="menuitem" data-action="widget-customize" @click="pick(() => emit('customize'))">🎨 Customize widget</button>
          <button v-if="desk" role="menuitem" data-action="widget-top" @click="pick(() => emit('on-top', !onTop))">
            📌 {{ onTop ? 'Stop keeping on top' : 'Keep on top' }}
          </button>
          <button v-if="desk" role="menuitem" data-action="widget-hide" @click="pick(() => emit('hide'))">✕ Hide widget</button>
        </div>
      </div>

      <div class="w-body">
        <div v-if="show('today') || show('week')" class="w-lists">
          <section v-if="show('today')" class="w-today">
            <PushPin class="w-pin" color="yellow" />
            <h3>Today</h3>
            <ul v-if="lists.today.length" class="items">
              <li v-for="i in cut(lists.today)" :key="i.key" :class="i.state">
                <button
                  class="tick"
                  :aria-label="`Mark “${i.title}” done`"
                  :disabled="!live"
                  data-action="widget-tick"
                  @click="tick(i)"
                />
                <button class="what" :disabled="!live" @click="emit('reveal', i.note.id)">{{ i.title }}</button>
                <span class="when">{{ when(i) }}</span>
              </li>
              <li v-if="more(lists.today)" class="more">+{{ more(lists.today) }} more</li>
            </ul>
            <p v-else class="free">All clear ✨</p>
          </section>

          <section v-if="show('week')" class="w-week">
            <span class="w-tape" aria-hidden="true" />
            <h3>Coming up</h3>
            <ul v-if="lists.week.length" class="items">
              <li v-for="i in cut(lists.week)" :key="i.key" :class="i.state">
                <span class="dot" />
                <button class="what" :disabled="!live" @click="emit('reveal', i.note.id)">{{ i.title }}</button>
                <span class="when">{{ when(i) }}</span>
              </li>
              <li v-if="more(lists.week)" class="more">+{{ more(lists.week) }} more</li>
            </ul>
            <p v-else class="free">A free week ahead</p>
          </section>
        </div>

        <section v-if="board" class="mini">
          <div ref="box" class="box">
            <div class="frame" :style="{ width: `${miniFit.w}px`, height: `${miniFit.h}px` }">
              <div class="scaled" :style="{ transform: `scale(${miniFit.s}) translate(${-miniFit.x}px, ${-miniFit.y}px)` }">
                <BoardView :board="board" />
              </div>
            </div>
          </div>
          <label v-if="boards.length > 1 && !preview && !desk" class="pick">
            <select id="widget-board" :value="board.id" aria-label="Board" @change="emit('board', ($event.target as HTMLSelectElement).value)">
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
            </select>
          </label>
        </section>
      </div>
    </div>
    <span
      v-if="desk"
      class="w-grip"
      title="Drag to resize"
      data-action="widget-resize"
      @pointerdown="gripDown"
      @pointermove="gripMove"
      @pointerup="gripUp"
      @pointercancel="gripUp"
    />
  </div>
</template>

<style scoped>
.widget {
  --ink: #2b2620;
  --muted: rgba(43, 38, 32, 0.6);
  --sticky: #fff27a;
  --card: #fffdf8;
  height: 100%;
  padding: 10px;
  background: radial-gradient(circle, rgba(43, 38, 32, 0.1) 1px, transparent 1.2px) 0 0 / 24px 24px, #ece6db;
  color: var(--ink);
  overflow: hidden;
  font-family: 'Bricolage Grotesque Variable', system-ui, sans-serif;
}
.widget.desk { background: transparent; }
.widget.fit, .fit .panel { height: auto; }
.widget { container-type: size; position: relative; }
.widget.fit { container-type: inline-size; }

/* the frame */
.panel {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18), 0 16px 34px rgba(0, 0, 0, 0.22);
}
.th-cork .panel {
  background: var(--cork) 0 0 / 220px, #c99a5e;
  border: 9px solid transparent;
  border-image: linear-gradient(135deg, #e3b778, #c88f4d 40%, #dcae6d 70%, #b98142) 1;
  border-radius: 0;
  padding: 12px;
  outline: 1px solid rgba(90, 50, 15, 0.35);
  outline-offset: -1px;
}
.th-paper .panel {
  background: radial-gradient(circle, rgba(70, 80, 110, 0.18) 1px, transparent 1.3px) 0 0 / 14px 14px, #fbf8f1;
}
.th-dark {
  --ink: #f6f1e7;
  --muted: rgba(246, 241, 231, 0.6);
  --sticky: #2f2b25;
  --card: #26231f;
}
.th-dark:not(.desk) { background: radial-gradient(circle, rgba(255, 255, 255, 0.06) 1px, transparent 1.2px) 0 0 / 24px 24px, #121110; }
.th-dark .panel { background: rgba(24, 22, 20, 0.92); backdrop-filter: blur(18px); border: 1px solid rgba(255, 255, 255, 0.08); }
/* notes only: no backdrop at all, just the papers on your desktop */
.th-bare .panel { background: none; box-shadow: none; padding: 12px 8px; }
.th-bare .hello { background: rgba(255, 253, 248, 0.94); border-radius: 12px; padding: 8px 12px; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.2); }
.th-bare .greet, .th-bare .sum:not(.late) { color: #6b5d4c; }
.th-bare .w-menu-btn { background: rgba(43, 38, 32, 0.55); }

/* header: calendar page + greeting; it's also the strip that drags the app's widget window */
.w-head { display: flex; align-items: center; gap: 14px; min-height: 40px; -webkit-app-region: drag; }
.w-head button, .w-head select { -webkit-app-region: no-drag; }
.cal {
  position: relative;
  flex: none;
  width: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  color: #2b2620;
  border-radius: 4px 4px 2px 2px;
  padding-bottom: 10px;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.15);
  transform: rotate(-3deg);
  /* torn bottom edge */
  -webkit-mask: radial-gradient(5px at 50% 100%, transparent 98%, #000) 0 0 / 10px 100%;
  mask: radial-gradient(5px at 50% 100%, transparent 98%, #000) 0 0 / 10px 100%;
}
.cal-pin { position: absolute; top: -9px; left: 50%; width: 22px; height: 22px; margin-left: -11px; z-index: 2; }
.cal-month { align-self: stretch; text-align: center; background: #d9412b; color: #fff; font-weight: 800; letter-spacing: 0.16em; font-size: 13px; padding: 9px 0 4px; border-radius: 4px 4px 0 0; }
.cal-day { font-size: 50px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; margin-top: 4px; font-variant-numeric: tabular-nums; }
.cal-week { font: 700 19px/1 'Caveat', cursive; color: #5c534a; }
.hello { flex: 1; min-width: 0; color: var(--ink); }
.th-cork .hello { background: rgba(255, 253, 248, 0.92); border-radius: 12px; padding: 8px 12px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15); }
.greet { margin: 0; font: 700 22px/1.05 'Caveat', cursive; color: var(--muted); }
.th-cork .greet { color: #6b5d4c; }
.time { margin: 0; font-size: 40px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.sum { margin: 4px 0 0; font-size: 12.5px; font-weight: 600; color: var(--muted); }
.th-cork .sum { color: #6b5d4c; }
.sum.late { color: #d9412b; }

.w-menu-wrap { position: absolute; top: 12px; right: 12px; z-index: 25; -webkit-app-region: no-drag; }
.th-cork .w-menu-wrap { top: 6px; right: 6px; }
.w-head { padding-right: 34px; }
/* section titles also drag the Windows app's widget (the header hides on small widgets) */
.desk h3 { -webkit-app-region: drag; }
.w-menu-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.18);
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.widget:hover .w-menu-btn, .w-menu-btn[aria-expanded='true'] { opacity: 1; }
.th-paper .w-menu-btn { background: rgba(43, 38, 32, 0.08); color: #2b2620; }
.w-menu {
  position: absolute;
  right: 0;
  top: 36px;
  z-index: 20;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  background: #fffdf8;
  border-radius: 14px;
  padding: 6px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3);
}
.w-menu button { border: 0; background: transparent; text-align: left; padding: 8px 10px; border-radius: 9px; font: inherit; font-size: 14px; color: #2b2620; cursor: pointer; }
.w-menu button:hover { background: rgba(43, 38, 32, 0.07); }

/* body */
.w-body { flex: 1; min-height: 0; display: flex; gap: 14px; }
/* lists scroll (without a scrollbar) when the widget is smaller than its content */
.w-lists { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; scrollbar-width: none; padding: 10px 6px 6px; margin: -10px -6px -6px; }
.w-lists::-webkit-scrollbar { display: none; }
.fit .w-lists { overflow: visible; }
.w-today, .w-week { flex: none; }
.wide .w-lists { flex: 0 0 300px; }
.w-today, .w-week { position: relative; padding: 16px 14px 12px; color: #2b2620; }
.w-today { background: var(--sticky); transform: rotate(-0.8deg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18), 0 10px 18px rgba(0, 0, 0, 0.16); border-radius: 2px 2px 18px 2px; }
.w-week {
  background: repeating-linear-gradient(transparent 0 25px, rgba(90, 130, 200, 0.22) 25px 26px) 0 30px / 100% calc(100% - 30px) no-repeat,
    linear-gradient(transparent 0 29px, rgba(217, 65, 43, 0.4) 29px 30px, transparent 30px) 0 0 / 100% 100% no-repeat, var(--card);
  transform: rotate(0.6deg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.14);
}
.th-dark .w-today, .th-dark .w-week { color: var(--ink); background: var(--card); border: 1px solid rgba(255, 255, 255, 0.07); transform: none; border-radius: 14px; }
.th-dark .w-today { box-shadow: inset 3px 0 0 #fff27a; }
.th-paper .w-week { transform: none; }
.w-pin { position: absolute; top: -10px; left: 50%; width: 22px; height: 22px; margin-left: -11px; }
.th-dark .w-pin { display: none; }
.w-tape { position: absolute; top: -8px; left: 50%; width: 70px; height: 18px; margin-left: -35px; transform: rotate(-3deg); background: repeating-linear-gradient(45deg, rgba(200, 180, 255, 0.85) 0 6px, rgba(230, 220, 255, 0.85) 6px 12px); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.th-dark .w-tape { display: none; }
h3 { margin: 0 0 8px; font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; opacity: 0.6; }
.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.items li { display: grid; grid-template-columns: 20px 1fr auto; gap: 8px; align-items: center; min-height: 26px; }
.items li.more { display: block; padding-left: 28px; font-size: 12px; opacity: 0.6; min-height: 0; }
.tick {
  color: inherit;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid currentColor;
  background: transparent;
  opacity: 0.55;
  padding: 0;
  cursor: pointer;
  transition: transform 0.12s, background 0.12s, opacity 0.12s;
}
.tick:hover:not(:disabled) { opacity: 1; transform: scale(1.12); background: rgba(43, 38, 32, 0.12); }
.overdue .tick { color: #d9412b; opacity: 1; }
.dot { width: 9px; height: 9px; border-radius: 50%; justify-self: center; background: currentColor; opacity: 0.5; }
.tomorrow .dot { background: #7a5cf0; opacity: 1; }
.what { border: 0; background: transparent; padding: 0; text-align: left; color: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 22px/1.1 'Caveat', cursive; }
.what:disabled { cursor: default; }
.what:hover:not(:disabled) { text-decoration: underline; text-decoration-thickness: 1px; }
.when { font-size: 12px; font-weight: 700; opacity: 0.65; white-space: nowrap; font-variant-numeric: tabular-nums; }
.overdue .when { color: #d9412b; opacity: 1; }
.free { margin: 0; font: 22px 'Caveat', cursive; opacity: 0.7; }

.mini { flex: 1; min-width: 0; min-height: 120px; display: flex; flex-direction: column; gap: 6px; }
/* the board's notes sit straight on the widget: no second cork board, no frame */
.mini :deep(.board) { background: none; box-shadow: none; }
.mini :deep(.cork) { background: none !important; box-shadow: none !important; overflow: visible; }
.mini :deep(.empty) { color: var(--muted); }
.box { flex: 1; min-height: 0; display: grid; place-items: center; }
.frame { position: relative; overflow: hidden; pointer-events: none; }
.scaled { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.scaled :deep(.tab) { display: none; }
.pick { display: flex; justify-content: flex-end; }
.pick select { font: inherit; font-size: 13px; border: 0; border-radius: 999px; padding: 4px 10px; background: rgba(255, 253, 248, 0.92); color: #2b2620; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15); }

/* the resize grip, bottom-left (Windows app) */
.w-grip {
  position: absolute;
  left: 4px;
  bottom: 4px;
  width: 22px;
  height: 22px;
  cursor: nesw-resize;
  border-radius: 6px;
  background: linear-gradient(45deg, transparent 0 30%, rgba(0, 0, 0, 0.35) 30% 36%, transparent 36% 50%, rgba(0, 0, 0, 0.35) 50% 56%, transparent 56% 70%, rgba(0, 0, 0, 0.35) 70% 76%, transparent 76%);
  opacity: 0;
  transition: opacity 0.15s;
  -webkit-app-region: no-drag;
  z-index: 30;
}
.widget:hover .w-grip { opacity: 0.8; }
.th-dark .w-grip { filter: invert(1); }

@container (max-width: 560px) {
  .w-body { flex-direction: column; }
  .wide .w-lists { flex: 0 1 auto; }
}
/* small widgets: first the calendar page goes, then the whole header; the sticky stays */
@container (max-width: 300px) {
  .cal { display: none; }
}
@container (max-width: 270px) {
  .what { font-size: 19px; }
  .when { font-size: 10.5px; }
  .items li { gap: 6px; }
}
@container (max-height: 300px) {
  .w-head { display: none; }
  .panel { padding-top: 16px; }
}
@container (max-width: 560px) and (max-height: 640px) {
  .wide .mini { display: none; }
}
@media (max-width: 420px) {
  .greet { font-size: 19px; }
  .time { font-size: 36px; }
  .th-cork .hello { padding: 7px 10px; }
}
@media (max-width: 300px) {
  .cal { width: 86px; }
  .cal-day { font-size: 40px; }
  .time { font-size: 32px; }
}
</style>
