<script setup lang="ts">
import { computed } from 'vue';
import { agenda, dueLabel, longDate, noteTitle } from '../core/dates';
import { useNow } from '../composables/now';
import { useWorkspace } from '../stores/workspace';

const emit = defineEmits<{ close: []; reveal: [noteId: string] }>();
const store = useWorkspace();
const now = useNow();
const groups = computed(() => agenda(store.boards, now.value));
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
    <div v-if="!groups.length" class="empty">
      <p class="big">📅</p>
      <p>Nothing scheduled yet.</p>
      <p class="muted">Select a note and tap 📅 to give it a date and a reminder.</p>
    </div>
    <section v-for="g in groups" :key="g.state" class="group" :class="g.state">
      <h3>{{ g.title }} <span>{{ g.items.length }}</span></h3>
      <ul>
        <li v-for="{ note, board } in g.items" :key="note.id">
          <input
            :id="`agenda-done-${note.id}`"
            type="checkbox"
            :checked="!!note.done"
            :aria-label="`Mark “${noteTitle(note)}” as done`"
            @change="store.toggleDone(note.id)"
          />
          <button class="item" @click="emit('reveal', note.id)">
            <span class="swatch" :style="{ background: note.kind === 'sticky' || note.kind === 'card' ? note.color : '#fff' }" />
            <span class="txt">
              <b>{{ noteTitle(note) }}</b>
              <small>{{ dueLabel(note.due!, now) }}<template v-if="note.remind !== undefined"> · ⏰</template> · {{ board.title }}</small>
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
.group h3 { margin: 0 0 6px; font-size: 12.5px; letter-spacing: 0.06em; text-transform: uppercase; display: flex; gap: 6px; align-items: center; }
.group h3 span { background: rgba(43, 38, 32, 0.08); border-radius: 999px; padding: 0 7px; font-size: 11.5px; }
.overdue h3 { color: #d9412b; }
.today h3 { color: #d97a0c; }
.tomorrow h3 { color: #6a4ce0; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li { display: flex; align-items: center; gap: 8px; }
li input { width: 18px; height: 18px; accent-color: #3c9a5f; flex: none; }
.item { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: center; text-align: left; border: 0; background: transparent; padding: 8px; border-radius: 10px; cursor: pointer; color: inherit; font: inherit; }
.item:hover { background: rgba(43, 38, 32, 0.06); }
.swatch { width: 14px; height: 14px; border-radius: 4px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
.txt { min-width: 0; display: flex; flex-direction: column; }
.txt b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.txt small { color: rgba(43, 38, 32, 0.6); font-size: 12.5px; }
.done .txt b { text-decoration: line-through; color: rgba(43, 38, 32, 0.5); }
</style>
