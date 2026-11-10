<script setup lang="ts">
import { computed } from 'vue';
import { type AgendaItem, agendaDays, dueLabel, longDate, timeOf } from '../core/dates';
import { useNow } from '../composables/now';
import { useWorkspace } from '../stores/workspace';

const emit = defineEmits<{ close: []; reveal: [noteId: string] }>();
const store = useWorkspace();
const now = useNow();
const days = computed(() => agendaDays(store.boards, now.value));
const late = (i: AgendaItem) => !i.done && (i.state === 'overdue');
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
    <div v-if="!days.length" class="empty">
      <p class="big">📅</p>
      <p>Nothing scheduled yet.</p>
      <p class="muted">Write a time in a note (“buy milk 10.00”), or select a note and tap 📅 to give it a date and a reminder.</p>
    </div>
    <section v-for="d in days" :key="d.key" class="day" :class="{ overdue: d.key === 'overdue', today: d.title === 'Today' }">
      <h3>{{ d.title }} <small v-if="d.sub">{{ d.sub }}</small></h3>
      <ul>
        <li v-for="i in d.items" :key="i.key" :class="{ done: i.done, late: late(i) }">
          <input
            :id="`agenda-done-${i.key}`"
            type="checkbox"
            :checked="i.done"
            :aria-label="`Mark “${i.title}” as done`"
            @change="store.toggleItem(i)"
          />
          <button class="item" @click="emit('reveal', i.note.id)">
            <span class="time">{{ d.key === 'overdue' ? dueLabel(i.due, now).replace(/ \d\d:\d\d$/, '') : timeOf(i.due) }}</span>
            <span class="txt">
              <b>{{ i.title }}</b>
              <small>
                <template v-if="d.key === 'overdue'">{{ timeOf(i.due) }} · </template>{{ i.board.title }}<template
                  v-if="i.line === undefined && i.note.remind !== undefined"
                > · ⏰</template><template v-if="i.line !== undefined"> · from the note</template>
              </small>
            </span>
          </button>
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
  width: min(360px, 100vw);
  background: #fffdf8;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.18);
  z-index: 15000;
  overflow-y: auto;
  padding: calc(16px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
header { display: flex; justify-content: space-between; align-items: flex-start; }
h2 { margin: 0; font-size: 26px; letter-spacing: -0.03em; }
header p { margin: 2px 0 0; color: rgba(43, 38, 32, 0.6); }
.x { border: 0; background: transparent; font-size: 26px; line-height: 1; cursor: pointer; color: inherit; }
.empty { text-align: center; padding: 40px 10px; }
.empty .big { font-size: 40px; margin: 0; }
.muted { color: rgba(43, 38, 32, 0.6); font-size: 13.5px; }
.day h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; display: flex; gap: 8px; align-items: baseline; }
.day h3 small { font-size: 12px; letter-spacing: 0; text-transform: none; font-weight: 500; color: rgba(43, 38, 32, 0.55); }
.overdue h3 { color: #d9412b; }
.today h3 { color: #d97a0c; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li { display: flex; align-items: center; gap: 8px; }
li input { width: 18px; height: 18px; accent-color: #3c9a5f; flex: none; }
.item { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: center; text-align: left; border: 0; background: transparent; padding: 8px; border-radius: 10px; cursor: pointer; color: inherit; font: inherit; }
.item:hover { background: rgba(43, 38, 32, 0.06); }
.swatch { width: 14px; height: 14px; border-radius: 4px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
.txt { min-width: 0; display: flex; flex-direction: column; }
.txt b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.txt small { color: rgba(43, 38, 32, 0.6); font-size: 12.5px; }
.time { flex: none; min-width: 46px; font-weight: 800; font-variant-numeric: tabular-nums; font-size: 15px; }
.late .time { color: #d9412b; }
.txt b { transition: color 0.2s; text-decoration: line-through; text-decoration-color: transparent; transition: text-decoration-color 0.25s, color 0.25s; }
/* ticked: the words get crossed out, right where they are */
.done .txt b { text-decoration-color: rgba(43, 38, 32, 0.7); text-decoration-thickness: 2px; color: rgba(43, 38, 32, 0.45); }
.done .time { color: rgba(43, 38, 32, 0.35); text-decoration: line-through; }
</style>
