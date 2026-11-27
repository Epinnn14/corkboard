<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Board } from '../core/board';
import { type AgendaItem, agendaItems } from '../core/dates';
import {
  addSticky,
  addTodo,
  clockText,
  dayKey,
  type DeskBoard,
  finishTimer,
  journalDays,
  lastWeek,
  MODE_LABEL,
  monthGrid,
  MOOD_LABEL,
  MOODS,
  moveWidget,
  nextTint,
  pauseTimer,
  type Pos,
  progress,
  pruneTodos,
  raiseSticky,
  removeSticky,
  removeTodo,
  resetLayout,
  resetTimer,
  sanitizeDeskBoard,
  setJournal,
  setLength,
  setMode,
  startTimer,
  type Sticky,
  type TimerMode,
  timerLeft,
  timerRunning,
  todayTodos,
  toggleTodo,
  toggleWidget,
  updateSticky,
  welcomeDeskBoard,
  type WidgetId,
  widgetPos,
  WIDGETS,
} from '../core/deskboard';
import { showNotification } from '../core/notify';
import { useWorkspace } from '../stores/workspace';

/**
 * The desktop board (#desktop): a pegboard filling the screen with a clock,
 * today's to-dos, sticky notes, a calendar with the boards' agenda, a focus
 * timer, the day's progress and a journal. In the Windows app it is the
 * desktop background, behind every other window.
 */
const props = defineProps<{ boards: readonly Board[]; desk?: boolean }>();
const emit = defineEmits<{ open: []; reveal: [noteId: string]; hide: [] }>();
const store = useWorkspace();

// ------------------------------------------------------------------ state, saved on this device
const KEY = 'corkboard:desktop-board';
function load(): DeskBoard {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeDeskBoard(JSON.parse(raw)) : welcomeDeskBoard();
  } catch {
    return welcomeDeskBoard();
  }
}
const s = ref<DeskBoard>(load());
const saveFailed = ref(false);
function commit(next: DeskBoard) {
  s.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    saveFailed.value = false;
  } catch {
    saveFailed.value = true;
  }
}
// another corkboard window changed it
function onStorage(e: StorageEvent) {
  if (e.key === KEY) s.value = load();
}

// ------------------------------------------------------------------ time
const nowMs = ref(Date.now());
const now = computed(() => new Date(nowMs.value));
const today = computed(() => dayKey(now.value));
// the time in the computer's own format; "PM" (where it has one) goes small beside it
const timeParts = computed(() => {
  const parts = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).formatToParts(now.value);
  const main = parts.filter((x) => x.type !== 'dayPeriod').map((x) => x.value).join('').trim();
  return { main, period: parts.find((x) => x.type === 'dayPeriod')?.value ?? '' };
});
const dayName = computed(() => now.value.toLocaleDateString([], { weekday: 'long' }));
const dateText = computed(() => now.value.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }));
let ticker: ReturnType<typeof setInterval> | undefined;
let lastDay = today.value;
function tick() {
  nowMs.value = Date.now();
  if (today.value !== lastDay) {
    lastDay = today.value;
    commit(pruneTodos(s.value, today.value));
    calMonth.value = { y: now.value.getFullYear(), m: now.value.getMonth() };
    selDay.value = today.value;
    journalDay.value = null;
  }
  checkTimer();
}

// ------------------------------------------------------------------ layout & dragging
const view = ref({ w: window.innerWidth, h: window.innerHeight });
const stacked = computed(() => view.value.w < 760);
const onResize = () => (view.value = { w: window.innerWidth, h: window.innerHeight });
const WIDTH: Record<WidgetId, number> = { clock: 250, todo: 300, calendar: 320, timer: 280, progress: 280, journal: 340 };
const front = ref<string[]>([]); // last touched on top
const zOf = (id: string) => 2 + front.value.indexOf(id) + 1;
function toFront(id: string) {
  front.value = [...front.value.filter((x) => x !== id), id];
}

const drag = ref<{ id: string; px: number; py: number; pos: Pos } | null>(null);
function widgetStyle(id: WidgetId) {
  if (stacked.value) return {};
  const p = drag.value?.id === id ? drag.value.pos : widgetPos(s.value, id);
  const w = WIDTH[id];
  const left = Math.max(8, Math.min(p.x * view.value.w, view.value.w - w - 8));
  const top = Math.max(8, Math.min(p.y * view.value.h, view.value.h - 120));
  return { left: `${left}px`, top: `${top}px`, width: `${w}px`, zIndex: zOf(id) };
}
function stickyStyle(n: Sticky) {
  if (stacked.value) return { '--tint': n.color, '--rot': `${n.rot}deg` };
  const p = drag.value?.id === n.id ? drag.value.pos : n;
  const left = Math.max(4, Math.min(p.x * view.value.w, view.value.w - 184));
  const top = Math.max(4, Math.min(p.y * view.value.h, view.value.h - 120));
  return { left: `${left}px`, top: `${top}px`, zIndex: 40 + s.value.stickies.indexOf(n), '--tint': n.color, '--rot': `${n.rot}deg` };
}

function startDrag(e: PointerEvent, id: string, pos: Pos) {
  if (stacked.value || e.button !== 0) return;
  if ((e.target as HTMLElement).closest('button:not(.grip), input, textarea, select')) return;
  e.preventDefault();
  if (s.value.stickies.some((n) => n.id === id)) commit(raiseSticky(s.value, id));
  else toFront(id);
  drag.value = { id, px: e.clientX, py: e.clientY, pos: { ...pos } };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
  window.addEventListener('pointercancel', endDrag, { once: true });
}
function onDrag(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  d.pos = { x: d.pos.x + (e.clientX - d.px) / view.value.w, y: d.pos.y + (e.clientY - d.py) / view.value.h };
  d.px = e.clientX;
  d.py = e.clientY;
}
function endDrag() {
  window.removeEventListener('pointermove', onDrag);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  // what you see is what's kept: store the place as drawn (clamped to the screen)
  const isSticky = s.value.stickies.some((n) => n.id === d.id);
  const w = isSticky ? 184 : WIDTH[d.id as WidgetId];
  const x = Math.max(8, Math.min(d.pos.x * view.value.w, view.value.w - w - 8)) / view.value.w;
  const y = Math.max(4, Math.min(d.pos.y * view.value.h, view.value.h - 120)) / view.value.h;
  commit(isSticky ? updateSticky(s.value, d.id, { x, y }) : moveWidget(s.value, d.id as WidgetId, { x, y }));
}
/** arrow keys on a grip move its card or note by 1% of the screen (Shift: 5%) */
function nudge(e: KeyboardEvent, id: string, pos: Pos) {
  const step = e.shiftKey ? 0.05 : 0.01;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d || stacked.value) return;
  e.preventDefault();
  const p = { x: pos.x + d[0], y: pos.y + d[1] };
  commit(s.value.stickies.some((n) => n.id === id) ? updateSticky(s.value, id, p) : moveWidget(s.value, id as WidgetId, p));
}

/** one column (phones, narrow windows): nothing to drag, so the grips step out of the way */
const gripAttrs = computed(() => (stacked.value ? { tabindex: -1, 'aria-hidden': 'true' as const } : {}));
const shown = (id: WidgetId) => !s.value.hidden.includes(id);
const menuOpen = ref(false);

// ------------------------------------------------------------------ to-do
const newTodo = ref('');
const todos = computed(() => todayTodos(s.value, today.value));
const prog = computed(() => progress(s.value, today.value));
function submitTodo() {
  if (!newTodo.value.trim()) return;
  commit(addTodo(s.value, newTodo.value));
  newTodo.value = '';
}

// ------------------------------------------------------------------ sticky notes
const removed = ref<{ note: Sticky; index: number } | null>(null);
let removedTimer: ReturnType<typeof setTimeout> | undefined;
function newSticky(at?: Pos) {
  const p = at ?? { x: 0.42 + (s.value.stickies.length % 5) * 0.02, y: 0.3 + (s.value.stickies.length % 5) * 0.03 };
  commit(addSticky(s.value, p));
  const n = s.value.stickies[s.value.stickies.length - 1];
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-sticky="${n.id}"] textarea`)?.focus());
}
function onBoardDblClick(e: MouseEvent) {
  if (e.target !== e.currentTarget || stacked.value) return;
  newSticky({ x: e.clientX / view.value.w - 0.04, y: e.clientY / view.value.h - 0.02 });
}
function dropSticky(n: Sticky) {
  const index = s.value.stickies.indexOf(n);
  commit(removeSticky(s.value, n.id));
  if (!n.text.trim()) return;
  removed.value = { note: n, index };
  clearTimeout(removedTimer);
  removedTimer = setTimeout(() => (removed.value = null), 8000);
}
function undoRemove() {
  const r = removed.value;
  if (!r) return;
  const list = [...s.value.stickies];
  list.splice(r.index, 0, r.note);
  commit({ ...s.value, stickies: list });
  removed.value = null;
}

// ------------------------------------------------------------------ calendar & agenda
const calMonth = ref({ y: now.value.getFullYear(), m: now.value.getMonth() });
const selDay = ref(today.value);
const weeks = computed(() => monthGrid(calMonth.value.y, calMonth.value.m));
const monthTitle = computed(() => new Date(calMonth.value.y, calMonth.value.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }));
const items = computed(() => agendaItems(props.boards, now.value));
const busyDays = computed(() => {
  const m = new Map<string, number>();
  for (const i of items.value) m.set(i.due.slice(0, 10), (m.get(i.due.slice(0, 10)) ?? 0) + 1);
  return m;
});
const dayItems = computed(() => items.value.filter((i) => i.due.slice(0, 10) === selDay.value));
const selTitle = computed(() => {
  if (selDay.value === today.value) return 'Today';
  return new Date(`${selDay.value}T00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
});
function shiftMonth(by: number) {
  const d = new Date(calMonth.value.y, calMonth.value.m + by, 1);
  calMonth.value = { y: d.getFullYear(), m: d.getMonth() };
}
function goToday() {
  calMonth.value = { y: now.value.getFullYear(), m: now.value.getMonth() };
  selDay.value = today.value;
}
const dayLabel = (d: Date) => {
  const n = busyDays.value.get(dayKey(d)) ?? 0;
  const base = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return n ? `${base}, ${n} on the agenda` : base;
};
const tickItem = (i: AgendaItem) => store.toggleItem(i);

// ------------------------------------------------------------------ focus timer
const left = computed(() => timerLeft(s.value, nowMs.value));
const running = computed(() => timerRunning(s.value));
const MODES: TimerMode[] = ['focus', 'break', 'long'];
const fresh = computed(() => !running.value && s.value.timer.leftMs === s.value.lengths[s.value.timer.mode] * 60_000);
const ringPct = computed(() => 1 - left.value / (s.value.lengths[s.value.timer.mode] * 60_000));
function toggleTimer() {
  commit(running.value ? pauseTimer(s.value, Date.now()) : startTimer(s.value, Date.now()));
}
function checkTimer() {
  if (!timerRunning(s.value)) return;
  // read the latest first: another window may have finished it already
  const latest = load();
  const done = finishTimer(latest, Date.now());
  if (!done) {
    if (!timerRunning(latest)) s.value = latest;
    return;
  }
  const late = Date.now() - (latest.timer.endsAt ?? 0);
  commit(done.state);
  if (late > 60_000) return; // it ran out while corkboard was closed: count it, no bell
  chime();
  const body = done.ended === 'focus' ? `Time for a ${MODE_LABEL[done.state.timer.mode].toLowerCase()}.` : 'Ready for the next focus session?';
  void showNotification(done.ended === 'focus' ? 'Focus session done' : 'Break over', body, 'corkboard-timer');
}
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.65);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound: the notification still says it */
  }
}

// ------------------------------------------------------------------ progress
const week = computed(() => lastWeek(s.value, now.value));
const weekMax = computed(() => Math.max(25, ...week.value.map((d) => d.minutes)));
const nothingYet = computed(() => !prog.value.sessions && !prog.value.tasksDone);

// ------------------------------------------------------------------ journal
const journalTab = ref<'write' | 'past'>('write');
const journalDay = ref<string | null>(null); // null: today
const jDay = computed(() => journalDay.value ?? today.value);
const entry = computed(() => s.value.journal[jDay.value] ?? { text: '', mood: null });
const pastDays = computed(() => journalDays(s.value).filter((d) => d !== today.value));
const fmtDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
function openPast(d: string) {
  journalDay.value = d;
  journalTab.value = 'write';
}
function backToToday() {
  journalDay.value = null;
}

// ------------------------------------------------------------------ keys
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false;
}
function onPointerDown(e: PointerEvent) {
  if (!(e.target as HTMLElement).closest('.db-menu-wrap')) menuOpen.value = false;
}

onMounted(() => {
  commit(pruneTodos(s.value, today.value));
  ticker = setInterval(tick, 1000);
  window.addEventListener('resize', onResize);
  window.addEventListener('storage', onStorage);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointerDown, true);
  checkTimer();
});
onBeforeUnmount(() => {
  clearInterval(ticker);
  clearTimeout(removedTimer);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('storage', onStorage);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('pointermove', onDrag);
});
</script>

<template>
  <main class="db" :class="{ stacked, dragging: !!drag }" @dblclick="onBoardDblClick">
    <h1 class="sr-only">Desktop board</h1>

    <nav class="db-tools" aria-label="Desktop board">
      <button class="db-chip db-add" data-action="db-sticky" @click="newSticky()">+ Sticky note</button>
      <div class="db-menu-wrap">
        <button class="db-chip" :aria-expanded="menuOpen" aria-haspopup="true" data-action="db-widgets" @click="menuOpen = !menuOpen">On the board ▾</button>
        <div v-if="menuOpen" class="db-menu">
          <label v-for="w in WIDGETS" :key="w.id" class="db-check">
            <input type="checkbox" :checked="shown(w.id)" :data-widget-toggle="w.id" @change="commit(toggleWidget(s, w.id))" />
            {{ w.label }}
          </label>
          <button class="db-link" data-action="db-reset" @click="commit(resetLayout(s)); menuOpen = false">Put every card back in its place</button>
        </div>
      </div>
      <button class="db-chip" data-action="db-open" @click="emit('open')">Open corkboard</button>
      <button v-if="desk" class="db-chip" data-action="db-hide" title="Turn it back on from the corkboard icon by the clock" @click="emit('hide')">Hide the board</button>
    </nav>

    <p v-if="saveFailed" class="db-warn" role="alert">This device is full or blocks saving: changes stay until you close this window.</p>

    <!-- date & clock -->
    <section v-if="shown('clock')" class="card c-clock" :style="widgetStyle('clock')" aria-labelledby="h-clock" data-widget="clock">
      <header class="hang" @pointerdown="startDrag($event, 'clock', widgetPos(s, 'clock'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the clock (arrow keys)" @keydown="nudge($event, 'clock', widgetPos(s, 'clock'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-clock" class="sr-only">Date and time</h2>
      </header>
      <p class="clk-day">{{ dayName }}</p>
      <p class="clk-time" data-clock>{{ timeParts.main }}<small v-if="timeParts.period">{{ timeParts.period }}</small></p>
      <p class="clk-date">{{ dateText }}</p>
    </section>

    <!-- to-do -->
    <section v-if="shown('todo')" class="card c-todo" :style="widgetStyle('todo')" aria-labelledby="h-todo" data-widget="todo">
      <header class="hang" @pointerdown="startDrag($event, 'todo', widgetPos(s, 'todo'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the to-do list (arrow keys)" @keydown="nudge($event, 'todo', widgetPos(s, 'todo'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-todo">To-do today</h2>
        <span class="count" data-todo-count>{{ prog.tasksDone }}/{{ prog.tasksTotal }} done</span>
      </header>
      <div class="todo-bar" aria-hidden="true"><span :style="{ width: prog.tasksTotal ? `${(prog.tasksDone / prog.tasksTotal) * 100}%` : '0' }" /></div>
      <form class="todo-add" @submit.prevent="submitTodo">
        <label class="sr-only" for="db-todo-new">New to-do</label>
        <input id="db-todo-new" v-model="newTodo" maxlength="200" placeholder="Add something for today" data-field="todo-new" />
        <button type="submit" :disabled="!newTodo.trim()" data-action="todo-add">Add</button>
      </form>
      <ul v-if="todos.length" class="todos">
        <li v-for="t in todos" :key="t.id" :class="{ done: t.done }">
          <label>
            <input type="checkbox" :checked="t.done" data-todo-tick @change="commit(toggleTodo(s, t.id, today))" />
            <span>{{ t.text }}</span>
          </label>
          <button class="x" :aria-label="`Remove ${t.text}`" data-todo-remove @click="commit(removeTodo(s, t.id))">×</button>
        </li>
      </ul>
      <p v-else class="empty">Nothing on the list yet. What's the first thing today?</p>
    </section>

    <!-- calendar & agenda -->
    <section v-if="shown('calendar')" class="card c-cal" :style="widgetStyle('calendar')" aria-labelledby="h-cal" data-widget="calendar">
      <header class="hang" @pointerdown="startDrag($event, 'calendar', widgetPos(s, 'calendar'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the calendar (arrow keys)" @keydown="nudge($event, 'calendar', widgetPos(s, 'calendar'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-cal">{{ monthTitle }}</h2>
        <span class="cal-nav">
          <button aria-label="Previous month" data-action="cal-prev" @click="shiftMonth(-1)">‹</button>
          <button class="cal-today" data-action="cal-today" @click="goToday">Today</button>
          <button aria-label="Next month" data-action="cal-next" @click="shiftMonth(1)">›</button>
        </span>
      </header>
      <table class="grid">
        <thead>
          <tr><th v-for="(d, i) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="i" scope="col">{{ d }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(w, wi) in weeks" :key="wi">
            <td v-for="(d, di) in w" :key="di">
              <button
                v-if="d"
                class="day"
                :class="{ today: dayKey(d) === today, sel: dayKey(d) === selDay, busy: busyDays.has(dayKey(d)) }"
                :aria-pressed="dayKey(d) === selDay"
                :aria-label="dayLabel(d)"
                :data-day="dayKey(d)"
                @click="selDay = dayKey(d)"
              >
                {{ d.getDate() }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <h3 class="ag-title">{{ selTitle }}</h3>
      <ul v-if="dayItems.length" class="agenda">
        <li v-for="i in dayItems" :key="i.key" :class="{ done: i.done }">
          <button class="tick" :aria-pressed="i.done" :aria-label="`${i.done ? 'Untick' : 'Tick'} ${i.title}`" data-agenda-tick @click="tickItem(i)">{{ i.done ? '✓' : '' }}</button>
          <time>{{ i.due.slice(11, 16) }}</time>
          <button class="ag-what" :title="`On ${i.board.title}`" @click="emit('reveal', i.note.id)">{{ i.title }}</button>
        </li>
      </ul>
      <p v-else class="empty">Free. Times you write in your notes ("gym 07.00") land here.</p>
    </section>

    <!-- focus timer -->
    <section v-if="shown('timer')" class="card c-timer" :style="widgetStyle('timer')" aria-labelledby="h-timer" data-widget="timer">
      <header class="hang" @pointerdown="startDrag($event, 'timer', widgetPos(s, 'timer'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the focus timer (arrow keys)" @keydown="nudge($event, 'timer', widgetPos(s, 'timer'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-timer">Focus timer</h2>
        <span class="streak" :aria-label="`${s.timer.streak % 4} of 4 sessions before a long break`">
          <i v-for="n in 4" :key="n" :class="{ on: n <= s.timer.streak % 4 }" aria-hidden="true" />
        </span>
      </header>
      <div class="modes" role="group" aria-label="Timer mode">
        <button v-for="m in MODES" :key="m" :aria-pressed="s.timer.mode === m" :data-mode="m" @click="commit(setMode(s, m))">{{ MODE_LABEL[m] }}</button>
      </div>
      <p class="count-down" :class="{ live: running }" role="timer" aria-live="off" data-timer>{{ clockText(left) }}</p>
      <div class="t-line" aria-hidden="true"><span :style="{ width: `${Math.max(0, Math.min(1, ringPct)) * 100}%` }" /></div>
      <div class="t-actions">
        <button class="go" data-action="timer-toggle" @click="toggleTimer">{{ running ? 'Pause' : fresh ? 'Start' : 'Resume' }}</button>
        <button class="soft" :disabled="fresh" data-action="timer-reset" @click="commit(resetTimer(s))">Reset</button>
      </div>
      <div v-if="!running" class="len">
        <button :aria-label="`Shorter ${MODE_LABEL[s.timer.mode].toLowerCase()}`" data-action="len-down" @click="commit(setLength(s, s.timer.mode, s.lengths[s.timer.mode] - 5))">−</button>
        <span>{{ s.lengths[s.timer.mode] }} min {{ MODE_LABEL[s.timer.mode].toLowerCase() }}</span>
        <button :aria-label="`Longer ${MODE_LABEL[s.timer.mode].toLowerCase()}`" data-action="len-up" @click="commit(setLength(s, s.timer.mode, s.lengths[s.timer.mode] + 5))">+</button>
      </div>
    </section>

    <!-- progress -->
    <section v-if="shown('progress')" class="card c-prog" :style="widgetStyle('progress')" aria-labelledby="h-prog" data-widget="progress">
      <header class="hang" @pointerdown="startDrag($event, 'progress', widgetPos(s, 'progress'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the progress card (arrow keys)" @keydown="nudge($event, 'progress', widgetPos(s, 'progress'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-prog">Today so far</h2>
      </header>
      <dl class="stats">
        <div><dt>focus sessions</dt><dd data-stat="sessions">{{ prog.sessions }}</dd></div>
        <div><dt>minutes focused</dt><dd data-stat="minutes">{{ prog.minutes }}</dd></div>
        <div><dt>to-dos done</dt><dd data-stat="tasks">{{ prog.tasksDone }}</dd></div>
      </dl>
      <p v-if="nothingYet" class="empty">Start a focus session or tick a to-do and it counts here.</p>
      <figure class="week">
        <figcaption>Minutes focused, last 7 days</figcaption>
        <ol>
          <li v-for="d in week" :key="d.day" :class="{ now: d.day === today }" :aria-label="`${fmtDay(d.day)}: ${d.minutes} minutes`">
            <span class="b" :style="{ height: `${(d.minutes / weekMax) * 100}%` }" />
            <small aria-hidden="true">{{ d.label }}</small>
          </li>
        </ol>
      </figure>
    </section>

    <!-- journal -->
    <section v-if="shown('journal')" class="card c-journal" :style="widgetStyle('journal')" aria-labelledby="h-journal" data-widget="journal">
      <header class="hang" @pointerdown="startDrag($event, 'journal', widgetPos(s, 'journal'))">
        <button class="grip" v-bind="gripAttrs" aria-label="Move the journal (arrow keys)" @keydown="nudge($event, 'journal', widgetPos(s, 'journal'))"><span class="peg" aria-hidden="true" /></button>
        <h2 id="h-journal">Journal</h2>
        <span class="tabs" role="group" aria-label="Journal view">
          <button :aria-pressed="journalTab === 'write'" data-action="journal-write" @click="journalTab = 'write'">Write</button>
          <button :aria-pressed="journalTab === 'past'" data-action="journal-past" @click="journalTab = 'past'">Earlier</button>
        </span>
      </header>
      <template v-if="journalTab === 'write'">
        <p class="j-day">
          {{ journalDay ? fmtDay(journalDay) : 'Today' }}
          <button v-if="journalDay" class="db-link" data-action="journal-today" @click="backToToday">back to today</button>
        </p>
        <div class="moods" role="group" aria-label="Mood">
          <button
            v-for="(m, i) in MOODS"
            :key="i"
            :aria-pressed="entry.mood === i"
            :aria-label="MOOD_LABEL[i]"
            :title="MOOD_LABEL[i]"
            :data-mood="i"
            @click="commit(setJournal(s, jDay, { mood: entry.mood === i ? null : i }))"
          >
            {{ m }}
          </button>
        </div>
        <label class="sr-only" for="db-journal">What happened {{ journalDay ? 'that day' : 'today' }}</label>
        <textarea
          id="db-journal"
          :value="entry.text"
          rows="4"
          placeholder="How did today go? One line is enough."
          data-field="journal"
          @input="commit(setJournal(s, jDay, { text: ($event.target as HTMLTextAreaElement).value }))"
        />
      </template>
      <template v-else>
        <ul v-if="pastDays.length" class="past">
          <li v-for="d in pastDays" :key="d">
            <button :data-past="d" @click="openPast(d)">
              <span class="p-mood" aria-hidden="true">{{ s.journal[d].mood !== null ? MOODS[s.journal[d].mood!] : '·' }}</span>
              <b>{{ fmtDay(d) }}</b>
              <span class="p-line">{{ s.journal[d].text.split('\n')[0] || '(mood only)' }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="empty">Earlier days show up here once you've written on them.</p>
      </template>
    </section>

    <!-- sticky notes -->
    <article
      v-for="n in s.stickies"
      :key="n.id"
      class="note"
      :class="{ lifted: drag?.id === n.id }"
      :style="stickyStyle(n)"
      :data-sticky="n.id"
      @pointerdown="startDrag($event, n.id, n)"
    >
      <div class="note-top">
        <button class="grip" v-bind="gripAttrs" aria-label="Move this note (arrow keys)" @keydown="nudge($event, n.id, n)"><span class="tape" aria-hidden="true" /></button>
        <button class="n-btn" aria-label="Change the note's colour" data-action="sticky-color" @click="commit(updateSticky(s, n.id, { color: nextTint(n.color) }))"><span class="swatch" aria-hidden="true" /></button>
        <button class="n-btn" aria-label="Remove this note" data-action="sticky-remove" @click="dropSticky(n)">×</button>
      </div>
      <label class="sr-only" :for="`note-${n.id}`">Sticky note</label>
      <textarea :id="`note-${n.id}`" :value="n.text" maxlength="2000" placeholder="Write here" @input="commit(updateSticky(s, n.id, { text: ($event.target as HTMLTextAreaElement).value }))" />
    </article>

    <div v-if="removed" class="db-toast" role="status">
      Note removed
      <button data-action="sticky-undo" @click="undoRemove">Undo</button>
    </div>
  </main>
</template>

<style scoped>
/*
 * Pegboard: warm mustard hardboard with a regular grid of holes. The holes are the point of a
 * pegboard (it's what the cards hang from), so the dot pattern is the identity motif here.
 * Cards are off-white paper hung on a dark peg; one accent (pin red) marks what's live: today,
 * the running timer, the Start button.
 */
.db {
  --board: #d9a441;
  --hole: rgba(74, 46, 6, 0.55);
  --paper: #fffaf0;
  --ink: #2b2620;
  --muted: #5e544a;
  --accent: #c8321f;
  --line: rgba(43, 38, 32, 0.14);
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: var(--ink);
  background-color: var(--board);
  background-image:
    radial-gradient(circle at 50% 50%, var(--hole) 0 2.6px, rgba(255, 236, 190, 0.35) 3.2px, transparent 3.6px),
    linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.06));
  background-size: 28px 28px, 100% 100%;
  user-select: none;
  font-family: 'Bricolage Grotesque Variable', system-ui, sans-serif;
}
.db.dragging { cursor: grabbing; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

button, label, input[type='checkbox'] { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.45; }
:is(button, input, textarea, a):focus-visible { outline: 2.5px solid var(--ink); outline-offset: 2px; }

/* -------- toolbar (top right, where a desktop has nothing important) */
.db-tools { position: absolute; top: 12px; right: 14px; display: flex; gap: 8px; z-index: 200; flex-wrap: wrap; justify-content: flex-end; }
.db-chip { min-height: 36px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(43, 38, 32, 0.3); background: var(--paper); color: var(--ink); font-weight: 600; font-size: 14px; box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15); }
.db-chip:hover { background: #fff; }
.db-chip:active { transform: translateY(1px); box-shadow: none; }
.db-add { background: #fff27a; }
.db-add:hover { background: #fff59a; }
.db-menu-wrap { position: relative; }
.db-menu { position: absolute; right: 0; top: calc(100% + 6px); width: 250px; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22); display: grid; gap: 6px; }
.db-check { display: flex; align-items: center; gap: 8px; font-size: 14px; min-height: 30px; }
.db-check input { width: 18px; height: 18px; accent-color: var(--ink); }
.db-link { background: none; border: 0; padding: 4px 0; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; font-size: 13px; text-align: left; }
.db-link:hover { color: var(--accent); }
.db-warn { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); margin: 0; background: #fff; border: 1px solid var(--accent); color: #8a1e10; padding: 8px 12px; border-radius: 8px; font-size: 14px; z-index: 210; }

/* -------- cards, hung from a peg */
.card {
  position: absolute;
  background: var(--paper);
  border-radius: 6px;
  padding: 0 16px 14px;
  /* one shadow: the gap between paper and board */
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12), 0 8px 18px rgba(74, 46, 6, 0.28);
  user-select: text;
}
.hang { display: flex; align-items: center; gap: 8px; min-height: 44px; margin: 0 -16px 4px; padding: 0 12px 0 4px; cursor: grab; border-bottom: 1px dashed var(--line); }
.grip { width: 36px; height: 36px; display: grid; place-items: center; background: none; border: 0; border-radius: 6px; cursor: grab; flex: none; }
.grip:hover { background: rgba(43, 38, 32, 0.07); }
.peg { width: 13px; height: 13px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #8d8478 0 15%, #3a332c 55%, #1c1814); box-shadow: 0 2px 2px rgba(0, 0, 0, 0.35); }
.hang h2 { margin: 0; font: 700 24px/1 'Caveat', cursive; letter-spacing: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { margin: 8px 0 0; color: var(--muted); font-size: 14px; line-height: 1.35; }

/* clock: the one big thing */
.c-clock { padding-bottom: 16px; }
.c-clock .hang { border-bottom: 0; margin-bottom: 0; min-height: 36px; }
.clk-day { margin: 0; font: 700 30px/1 'Caveat', cursive; color: var(--accent); }
.clk-time small { font-size: 20px; font-weight: 700; letter-spacing: 0; margin-left: 6px; }
.clk-time { margin: 2px 0 0; font-size: 64px; line-height: 1; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.clk-date { margin: 6px 0 0; font-size: 15px; color: var(--muted); }

/* to-do */
.count { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.todo-bar { height: 6px; border-radius: 3px; background: rgba(43, 38, 32, 0.1); overflow: hidden; margin: 6px 0 10px; }
.todo-bar span { display: block; height: 100%; background: #3c8a57; transition: width 0.3s; }
.todo-add { display: flex; gap: 6px; }
.todo-add input { flex: 1; min-width: 0; min-height: 40px; border: 1px solid rgba(43, 38, 32, 0.3); border-radius: 6px; padding: 6px 10px; font: inherit; font-size: 15px; background: #fff; color: var(--ink); }
.todo-add input::placeholder, textarea::placeholder { color: #776d63; }
.todo-add button { min-height: 40px; min-width: 56px; border-radius: 6px; border: 0; background: var(--ink); color: #fff; font-weight: 600; }
.todo-add button:hover:not(:disabled) { background: #45392d; }
.todos { list-style: none; margin: 8px 0 0; padding: 0; max-height: 34vh; overflow: auto; }
.todos li { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
.todos label { flex: 1; display: flex; align-items: center; gap: 10px; min-height: 42px; font: 22px/1.1 'Caveat', cursive; overflow-wrap: anywhere; }
.todos input { width: 20px; height: 20px; flex: none; accent-color: #3c8a57; }
.todos .done span { text-decoration: line-through; color: var(--muted); }
.x { width: 36px; height: 36px; border: 0; background: none; color: var(--muted); font-size: 20px; border-radius: 6px; flex: none; }
.x:hover { background: rgba(200, 50, 31, 0.1); color: var(--accent); }

/* calendar */
.cal-nav { display: flex; gap: 2px; }
.cal-nav button { min-width: 32px; height: 32px; border: 0; border-radius: 6px; background: none; font-size: 18px; color: var(--ink); }
.cal-nav .cal-today { font-size: 13px; font-weight: 600; padding: 0 6px; }
.cal-nav button:hover { background: rgba(43, 38, 32, 0.08); }
.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.grid th { font-size: 12px; font-weight: 600; color: var(--muted); padding: 2px 0 4px; }
.grid td { text-align: center; padding: 1px; }
.day { position: relative; width: 100%; height: 32px; border: 0; border-radius: 6px; background: none; font-size: 14px; font-variant-numeric: tabular-nums; color: var(--ink); }
.day:hover { background: rgba(43, 38, 32, 0.08); }
.day.busy::after { content: ''; position: absolute; left: 50%; bottom: 3px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--ink); }
.day.today { box-shadow: inset 0 0 0 2px var(--accent); font-weight: 800; }
.day.sel { background: var(--ink); color: #fff; }
.day.sel.busy::after { background: #fff; }
.ag-title { margin: 10px 0 2px; font: 700 21px/1 'Caveat', cursive; }
.agenda { list-style: none; margin: 0; padding: 0; max-height: 150px; overflow: auto; }
.agenda li { display: flex; align-items: center; gap: 8px; min-height: 36px; border-bottom: 1px solid var(--line); }
.agenda time { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; padding: 1px 6px; border: 1px solid rgba(43, 38, 32, 0.35); border-radius: 4px; flex: none; }
.tick { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(43, 38, 32, 0.5); background: none; font-size: 12px; font-weight: 900; line-height: 1; flex: none; color: #fff; }
.tick[aria-pressed='true'] { background: #3c8a57; border-color: #3c8a57; }
.tick:hover { border-color: var(--ink); }
.ag-what { border: 0; background: none; padding: 0; text-align: left; font: 21px/1.1 'Caveat', cursive; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.ag-what:hover { text-decoration: underline; }
.agenda .done .ag-what { text-decoration: line-through; color: var(--muted); }

/* timer */
.streak { display: flex; gap: 4px; }
.streak i { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--ink); }
.streak i.on { background: var(--ink); }
.modes, .tabs { display: flex; background: rgba(43, 38, 32, 0.08); border-radius: 8px; padding: 3px; gap: 2px; }
.modes button, .tabs button { flex: 1; min-height: 32px; border: 0; border-radius: 6px; background: none; font-size: 13px; font-weight: 600; color: var(--muted); padding: 0 4px; white-space: nowrap; }
.modes button:hover, .tabs button:hover { color: var(--ink); }
.modes button[aria-pressed='true'], .tabs button[aria-pressed='true'] { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); }
.tabs { flex: none; }
.count-down { margin: 12px 0 6px; text-align: center; font-size: 58px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.count-down.live { color: var(--accent); }
.t-line { height: 4px; border-radius: 2px; background: rgba(43, 38, 32, 0.1); overflow: hidden; margin-bottom: 12px; }
.t-line span { display: block; height: 100%; background: var(--accent); }
.t-actions { display: flex; gap: 8px; }
.go { flex: 1; min-height: 44px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 700; font-size: 16px; }
.go:hover { background: #a92816; }
.go:active, .soft:active:not(:disabled) { transform: translateY(1px); }
.soft { min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(43, 38, 32, 0.3); background: none; color: var(--ink); font-weight: 600; }
.soft:hover:not(:disabled) { background: rgba(43, 38, 32, 0.06); }
.len { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; font-size: 13px; color: var(--muted); }
.len button { width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(43, 38, 32, 0.25); background: none; font-size: 16px; color: var(--ink); }
.len button:hover { background: rgba(43, 38, 32, 0.06); }

/* progress */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 4px 0 0; }
.stats div { display: flex; flex-direction: column-reverse; }
.stats dt { font-size: 12px; color: var(--muted); line-height: 1.2; min-height: 2.4em; }
.stats dd { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.week { margin: 12px 0 0; }
.week figcaption { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.week ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 64px; align-items: end; }
.week li { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
.week .b { width: 100%; min-height: 2px; background: rgba(43, 38, 32, 0.55); border-radius: 2px 2px 0 0; }
.week .now .b { background: var(--accent); }
.week small { font-size: 11px; color: var(--muted); }

/* journal */
.j-day { margin: 4px 0 6px; font: 700 21px/1 'Caveat', cursive; display: flex; gap: 10px; align-items: baseline; }
.j-day .db-link { font: 13px 'Bricolage Grotesque Variable', system-ui, sans-serif; }
.moods { display: flex; gap: 4px; margin-bottom: 8px; }
.moods button { width: 40px; height: 40px; border-radius: 8px; border: 1px solid transparent; background: none; font-size: 22px; filter: grayscale(0.7); opacity: 0.75; }
.moods button:hover { opacity: 1; filter: none; }
.moods button[aria-pressed='true'] { border-color: var(--ink); background: #fff; filter: none; opacity: 1; }
textarea { width: 100%; resize: vertical; border: 1px solid rgba(43, 38, 32, 0.25); border-radius: 6px; padding: 8px 10px; background: #fff repeating-linear-gradient(transparent 0 27px, rgba(70, 120, 200, 0.18) 27px 28px); background-attachment: local; background-position: 0 8px; font: 21px/28px 'Caveat', cursive; color: var(--ink); }
.past { list-style: none; margin: 4px 0 0; padding: 0; max-height: 220px; overflow: auto; }
.past button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 40px; border: 0; border-bottom: 1px solid var(--line); background: none; text-align: left; color: var(--ink); padding: 0 4px; }
.past button:hover { background: rgba(43, 38, 32, 0.05); }
.past b { font-size: 13px; flex: none; }
.p-line { font: 20px 'Caveat', cursive; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }

/* -------- sticky notes, taped on */
.note {
  position: absolute;
  width: 184px;
  min-height: 150px;
  background: var(--tint);
  transform: rotate(var(--rot));
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.15), 0 8px 14px rgba(74, 46, 6, 0.25);
  border-radius: 2px 2px 14px 2px;
  display: flex;
  flex-direction: column;
}
.note.lifted { transform: rotate(var(--rot)) scale(1.03); box-shadow: 0 16px 26px rgba(74, 46, 6, 0.35); }
.note-top { display: flex; align-items: center; height: 34px; padding: 0 2px; cursor: grab; }
.note-top .grip { flex: 1; width: auto; height: 34px; }
.tape { width: 64px; height: 16px; background: rgba(255, 255, 255, 0.55); box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08); transform: rotate(-2deg); }
.n-btn { width: 32px; height: 32px; border: 0; border-radius: 6px; background: none; font-size: 18px; color: var(--ink); opacity: 0.7; }
.n-btn:hover { opacity: 1; background: rgba(0, 0, 0, 0.07); }
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--ink); background: conic-gradient(#fff27a 0 33%, #ffb3c7 0 66%, #a8dcff 0); }
.note textarea { flex: 1; min-height: 110px; border: 0; background: transparent; resize: none; padding: 0 12px 12px; font: 22px/1.15 'Caveat', cursive; user-select: text; }
.note textarea:focus-visible { outline: 2px dashed rgba(43, 38, 32, 0.5); outline-offset: -4px; }

.db-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 8px 8px 8px 16px; border-radius: 8px; display: flex; gap: 12px; align-items: center; z-index: 220; font-size: 14px; }
.db-toast button { min-height: 32px; border: 0; border-radius: 6px; background: #fff27a; color: var(--ink); font-weight: 700; padding: 0 12px; }

/* -------- narrow windows and phones: one column, nothing to drag */
.db.stacked { position: static; min-height: 100%; overflow: visible; padding: 16px 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.stacked .card, .stacked .note { position: relative; left: auto; top: auto; width: 100%; max-width: 520px; margin: 0 auto; }
.stacked .note { transform: none; }
.stacked .hang, .stacked .note-top { cursor: default; }
.stacked .grip { cursor: default; pointer-events: none; }
.stacked .db-tools { position: static; margin-bottom: 4px; justify-content: flex-start; }
.stacked .todos { max-height: none; }

@media (prefers-reduced-motion: reduce) {
  .todo-bar span { transition: none; }
  .note.lifted { transform: rotate(var(--rot)); }
}
</style>
