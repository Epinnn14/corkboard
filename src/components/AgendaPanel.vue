<script setup lang="ts">
import { computed } from 'vue';
import { type AgendaItem, agendaDays, agendaItems, agendaToIcs, dueLabel, longDate, parseDue, timeOf } from '../core/dates';
import { useNow } from '../composables/now';
import { useWorkspace } from '../stores/workspace';

const emit = defineEmits<{ close: []; reveal: [noteId: string] }>();
const store = useWorkspace();
const now = useNow();
const days = computed(() => agendaDays(store.boards, now.value));
const late = (i: AgendaItem) => !i.done && i.state === 'overdue';

function saveMemo(i: AgendaItem, e: Event) {
  const v = (e.target as HTMLTextAreaElement).value;
  if (v !== i.memo) store.setMemo(i.note.id, i.memoKey, v);
}
const upcoming = computed(() => agendaItems(store.boards, now.value).filter((i) => !i.done && parseDue(i.due) >= now.value));
/** one .ics with everything still to come: open it and it lands in the laptop's calendar */
function toCalendar() {
  const url = URL.createObjectURL(new Blob([agendaToIcs(upcoming.value)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'corkboard-agenda.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function grow(e: Event) {
  const t = e.target as HTMLTextAreaElement;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}
</script>

<template>
  <aside class="agenda" aria-label="Agenda">
    <header>
      <div>
        <h2>Agenda</h2>
        <p>{{ longDate(now) }}</p>
      </div>
      <button class="x" aria-label="Close agenda" @click="emit('close')">×</button>
    </header>
    <button v-if="upcoming.length" class="to-cal" data-action="agenda-ics" @click="toCalendar">
      📆 Add {{ upcoming.length }} to my calendar <small>.ics · Windows Calendar, Outlook, Google</small>
    </button>
    <div v-if="!days.length" class="empty">
      <p class="big">📅</p>
      <p>Nothing scheduled yet.</p>
      <p class="muted">Write a time in a note (“buy milk 10.00”), or select a note and tap 📅 to give it a date and a reminder.</p>
    </div>

    <section
      v-for="d in days"
      :key="d.key"
      class="day"
      :class="{ overdue: d.key === 'overdue', today: d.title === 'Today' }"
    >
      <h3>
        <span class="d-name">{{ d.title }}</span>
        <span v-if="d.sub" class="d-date">{{ d.sub }}</span>
        <span class="d-count">{{ d.items.filter((i) => i.done).length }}/{{ d.items.length }}</span>
      </h3>
      <ul>
        <li v-for="i in d.items" :key="i.key" :class="{ done: i.done, late: late(i) }">
          <input
            :id="`agenda-done-${i.key}`"
            class="check"
            type="checkbox"
            :checked="i.done"
            :aria-label="`Mark “${i.title}” as done`"
            @change="store.toggleItem(i)"
          />
          <span class="time" :title="d.key === 'overdue' ? dueLabel(i.due, now) : undefined">
            <small v-if="d.key === 'overdue'">{{ dueLabel(i.due, now).replace(/ \d\d:\d\d$/, '') }}</small>
            {{ timeOf(i.due) }}
          </span>
          <span class="body">
            <button class="what" :title="`Show it on “${i.board.title}”`" @click="emit('reveal', i.note.id)">{{ i.title }}</button>
            <textarea
              class="memo"
              rows="1"
              :value="i.memo"
              placeholder="+ add a note"
              maxlength="300"
              :aria-label="`Your note on “${i.title}”`"
              data-field="memo"
              @input="grow"
              @focus="grow"
              @change="saveMemo(i, $event)"
              @keydown.enter.exact.prevent="($event.target as HTMLTextAreaElement).blur()"
            />
          </span>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.agenda {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(380px, 100vw);
  background: #f4efe6;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.18);
  z-index: 15000;
  overflow-y: auto;
  padding: calc(16px + env(safe-area-inset-top, 0px)) max(14px, env(safe-area-inset-right, 0px)) 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
header { display: flex; justify-content: space-between; align-items: flex-start; padding: 0 4px; }
h2 { margin: 0; font-size: 26px; letter-spacing: -0.03em; }
header p { margin: 2px 0 0; color: rgba(43, 38, 32, 0.6); }
.x { border: 0; background: transparent; font-size: 26px; line-height: 1; cursor: pointer; color: inherit; }
.empty { text-align: center; padding: 40px 10px; }
.empty .big { font-size: 40px; margin: 0; }
.muted { color: rgba(43, 38, 32, 0.6); font-size: 13.5px; }

.to-cal { flex: none; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; border: 1px dashed rgba(43, 38, 32, 0.25); background: transparent; border-radius: 12px; padding: 8px 12px; font: inherit; font-weight: 650; font-size: 14px; color: inherit; cursor: pointer; text-align: left; }
.to-cal small { font-weight: 500; color: rgba(43, 38, 32, 0.55); font-size: 12px; }
.to-cal:hover { background: rgba(43, 38, 32, 0.05); }
/* one box per day, as tall as its items: the panel scrolls, the boxes don't squash */
.day {
  flex: none;
  background: #fffdf8;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 6px 16px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.day h3 {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px 9px;
  border-bottom: 1px solid rgba(43, 38, 32, 0.08);
  font-size: 15px;
  letter-spacing: -0.01em;
}
.d-name { font-weight: 800; }
.d-date { font-size: 12.5px; font-weight: 500; color: rgba(43, 38, 32, 0.55); }
.d-count { margin-left: auto; font-size: 11.5px; font-weight: 700; color: rgba(43, 38, 32, 0.5); background: rgba(43, 38, 32, 0.07); border-radius: 999px; padding: 1px 8px; }
.today h3 { background: #fff6c2; }
.today .d-name { color: #a35b00; }
.overdue h3 { background: #ffe7e2; }
.overdue .d-name { color: #c2321d; }

ul { list-style: none; margin: 0; padding: 4px 0; }
li {
  display: grid;
  grid-template-columns: 22px auto 1fr;
  align-items: start;
  gap: 10px;
  padding: 8px 14px;
}
li + li { border-top: 1px dashed rgba(43, 38, 32, 0.1); }
.check { width: 18px; height: 18px; margin: 5px 0 0; accent-color: #3c9a5f; cursor: pointer; }
/* the time in its own little box */
.time {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 4px 6px;
  border-radius: 9px;
  background: rgba(43, 38, 32, 0.06);
  border: 1px solid rgba(43, 38, 32, 0.1);
  font-weight: 800;
  font-size: 14.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.time small { font-size: 10px; font-weight: 700; opacity: 0.8; }
.today li:not(.done) .time { background: #fff27a; border-color: rgba(163, 91, 0, 0.25); }
.late .time, .today li.late .time { background: #ffe0d9; border-color: rgba(194, 50, 29, 0.3); color: #c2321d; }
.body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.what {
  border: 0;
  background: transparent;
  padding: 3px 0 0;
  text-align: left;
  font: inherit;
  font-weight: 650;
  font-size: 15px;
  color: inherit;
  cursor: pointer;
  overflow-wrap: anywhere;
  text-decoration: line-through;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.25s, color 0.25s;
}
.what:hover { color: #6b4a1e; }
.memo {
  border: 0;
  background: transparent;
  resize: none;
  padding: 2px 0;
  font: inherit;
  font-size: 13px;
  color: rgba(43, 38, 32, 0.75);
  overflow: hidden;
  min-height: 20px;
  border-radius: 6px;
}
.memo::placeholder { color: rgba(43, 38, 32, 0.35); }
.memo:focus { outline: 0; background: rgba(43, 38, 32, 0.05); padding: 2px 6px; }
/* ticked: crossed out, right where it is */
.done .what { text-decoration-color: rgba(43, 38, 32, 0.7); text-decoration-thickness: 2px; color: rgba(43, 38, 32, 0.45); }
.done .time { opacity: 0.45; text-decoration: line-through; }
.done .memo { color: rgba(43, 38, 32, 0.4); }
</style>
