<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Board, Note } from '../core/board';
import { googleCalendarUrl, quickDates, REMIND_OPTIONS, toIcs } from '../core/dates';
import { askPermission, permission } from '../core/notify';
import { useNow } from '../composables/now';
import { useWorkspace } from '../stores/workspace';

const props = defineProps<{ note: Note; board: Board }>();
const emit = defineEmits<{ close: [] }>();
const store = useWorkspace();
const now = useNow();
const perm = ref(permission());
const quick = computed(() => quickDates(now.value));

function setDue(due: string) {
  // first time a date is set, remind at the time by default
  store.setDue(props.note.id, due || undefined, props.note.due ? undefined : 0);
}

function setRemind(v: string) {
  store.setDue(props.note.id, props.note.due, v === '' ? null : Number(v));
  if (v !== '' && perm.value === 'default') void allow();
}

async function allow() {
  perm.value = await askPermission();
}

function downloadIcs() {
  const blob = new Blob([toIcs(props.note, props.board)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'reminder.ics' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
</script>

<template>
  <div class="due-editor" role="dialog" aria-label="Date and reminder" @pointerdown.stop @dblclick.stop>
    <header>
      <b>📅 Date &amp; reminder</b>
      <button class="x" aria-label="Close" @click="emit('close')">×</button>
    </header>
    <label class="field">
      <span>When</span>
      <input
        :id="`due-${note.id}`"
        type="datetime-local"
        :value="note.due ?? ''"
        @change="setDue(($event.target as HTMLInputElement).value)"
      />
    </label>
    <div class="quick">
      <button v-for="q in quick" :key="q.label" @click="setDue(q.due)">{{ q.label }}</button>
    </div>
    <template v-if="note.due">
      <label class="field">
        <span>Remind me</span>
        <select
          :id="`remind-${note.id}`"
          :value="note.remind ?? ''"
          @change="setRemind(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in REMIND_OPTIONS" :key="String(o.value)" :value="o.value ?? ''">{{ o.label }}</option>
        </select>
      </label>
      <p v-if="note.remind !== undefined && perm === 'default'" class="hint">
        <button class="link" @click="allow">Allow notifications</button> so this device can remind you.
      </p>
      <p v-else-if="note.remind !== undefined && perm === 'denied'" class="hint warn">
        Notifications are blocked for this site. Turn them on in the browser's site settings, or add it to your calendar.
      </p>
      <p v-else-if="note.remind !== undefined && perm === 'unsupported'" class="hint">
        This browser can't show notifications. Add it to your calendar instead.
      </p>
      <label class="check">
        <input :id="`done-${note.id}`" type="checkbox" :checked="!!note.done" @change="store.toggleDone(note.id)" />
        Done
      </label>
      <div class="cal">
        <span>Add to calendar</span>
        <button @click="downloadIcs">📆 .ics file</button>
        <a :href="googleCalendarUrl(note, board)" target="_blank" rel="noopener">Google Calendar ↗</a>
      </div>
      <button class="clear" @click="store.setDue(note.id, undefined)">Remove date</button>
    </template>
  </div>
</template>

<style scoped>
.due-editor {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  background: #fffdf8;
  color: #2b2620;
  border-radius: 16px;
  padding: 12px 14px 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font: 14px 'Bricolage Grotesque Variable', system-ui, sans-serif;
  white-space: normal;
  cursor: default;
}
header { display: flex; justify-content: space-between; align-items: center; }
.x { border: 0; background: transparent; font-size: 20px; line-height: 1; cursor: pointer; color: inherit; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field span, .cal span { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(43, 38, 32, 0.55); }
.field input, .field select { font: inherit; padding: 7px 9px; border: 1px solid rgba(43, 38, 32, 0.2); border-radius: 9px; background: #fff; color: inherit; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; }
.quick button, .cal button, .cal a {
  font: inherit;
  font-size: 13px;
  border: 1px solid rgba(43, 38, 32, 0.18);
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  cursor: pointer;
  color: inherit;
  text-decoration: none;
}
.quick button:hover, .cal button:hover, .cal a:hover { background: #f4efe4; }
.check { display: flex; gap: 8px; align-items: center; }
.cal { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cal span { width: 100%; }
.hint { margin: 0; font-size: 12.5px; color: rgba(43, 38, 32, 0.7); }
.hint.warn { color: #a3341f; }
.link { border: 0; background: none; padding: 0; color: #2457c5; text-decoration: underline; font: inherit; cursor: pointer; }
.clear { align-self: flex-start; border: 0; background: none; color: #a3341f; font: inherit; font-size: 13px; padding: 0; cursor: pointer; }
</style>
