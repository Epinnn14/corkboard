<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Board } from '../core/board';
import {
  DESK_PARTS,
  DESK_THEMES,
  type DeskConfig,
  type DeskPart,
  defaultWallBoard,
  deskWindowSize,
} from '../core/desk';
import { desktop, type DesktopSettings, WINDOWS_DOWNLOAD } from '../core/desktop';
import WidgetView from './WidgetView.vue';

const props = defineProps<{ boards: readonly Board[]; initial: DeskConfig }>();
const emit = defineEmits<{ close: []; save: [DeskConfig]; open: [DeskConfig]; wall: [boardId: string | null] }>();

const cfg = ref<DeskConfig>({ ...props.initial, wall: false, boardId: props.initial.boardId ?? props.boards[0]?.id ?? null });
watch(cfg, (c) => emit('save', { ...c, wall: false }), { deep: true });

function toggle(p: DeskPart) {
  const on = cfg.value.parts.includes(p);
  if (on && cfg.value.parts.length === 1) return; // keep at least one thing on screen
  cfg.value.parts = on ? cfg.value.parts.filter((x) => x !== p) : DESK_PARTS.map((d) => d.id).filter((id) => id === p || cfg.value.parts.includes(id));
}

// the board itself as the wallpaper
const wallBoardId = ref<string | null>(defaultWallBoard(props.boards, null)?.id ?? null);

// inside the Windows app: real wallpaper controls
const bridge = desktop();
const settings = ref<DesktopSettings | null>(null);
if (bridge) void bridge.getSettings().then((x) => (settings.value = x));
async function setSetting(patch: Partial<DesktopSettings>) {
  if (bridge) settings.value = await bridge.setSettings(patch);
}
function editWall() {
  bridge?.edit();
  emit('close');
}

const previewCfg = computed(() => ({ ...cfg.value, wall: false }));

// the preview is the real widget window, scaled down to fit
const pbox = ref<HTMLElement | null>(null);
const pw = ref({ w: 480, h: 340 });
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !pbox.value) return;
  ro = new ResizeObserver(([e]) => (pw.value = { w: e.contentRect.width, h: e.contentRect.height }));
  ro.observe(pbox.value);
});
onBeforeUnmount(() => ro?.disconnect());
const win = computed(() => deskWindowSize(cfg.value));
const pscale = computed(() => Math.min(1, (pw.value.w - 16) / win.value.w, (pw.value.h - 16) / win.value.h));
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet desk" role="dialog" aria-modal="true" aria-labelledby="desk-title">
      <header class="sheet-head">
        <h2 id="desk-title">Add to desktop</h2>
        <button class="ghost" @click="emit('close')">Close</button>
      </header>

      <article v-if="bridge" class="desk-way desk-board-wall" data-card="desktop-wall">
        <div>
          <h3>🖼️ Your board as the wallpaper</h3>
          <p>
            The board sits on your desktop as the wallpaper. <b>Double-click it</b> (or the corkboard icon by the clock)
            to edit: write, drag, add notes. Press <b>Done</b> and it goes back behind your icons.
          </p>
          <label class="desk-check">
            <input type="checkbox" :checked="settings?.wallpaper" data-field="wall-on" @change="setSetting({ wallpaper: ($event.target as HTMLInputElement).checked })" />
            Show the board as my wallpaper
          </label>
          <label class="desk-check">
            <input type="checkbox" :checked="settings?.startup" data-field="wall-startup" @change="setSetting({ startup: ($event.target as HTMLInputElement).checked })" />
            Start corkboard with Windows
          </label>
          <button class="solid" data-action="wall-edit" :disabled="!settings?.wallpaper" @click="editWall">Edit the wallpaper now</button>
        </div>
        <div class="desk-tip">
          <p>
            The wallpaper shows the board you pick with its 📌 button (your Weekly planner to start with). It's the same
            corkboard as this window: change a note in one, the other follows. Reminders keep ringing all day.
          </p>
          <label class="desk-check">
            Style
            <select :value="settings?.mode" data-field="wall-mode" @change="setSetting({ mode: ($event.target as HTMLSelectElement).value as DesktopSettings['mode'] })">
              <option value="behind">Behind the desktop icons</option>
              <option value="simple">Simple: a window at the back, always editable</option>
            </select>
          </label>
          <p v-if="settings?.wallpaper && settings?.embedded === false" class="desk-warn">
            Windows didn't let corkboard go behind the icons on this PC, so it uses <b>Simple</b>.
          </p>
        </div>
      </article>
      <article v-else class="desk-way desk-board-wall" data-card="get-app">
        <div>
          <h3>🖼️ Your board as the real wallpaper</h3>
          <p>
            Get the free <b>corkboard app for Windows</b>: your Weekly planner becomes the desktop wallpaper, behind your
            icons. Double-click it to write, drag and add notes, press Done and it's wallpaper again. Reminders ring all
            day, and it can start with Windows.
          </p>
          <a class="solid desk-dl" :href="WINDOWS_DOWNLOAD" data-action="get-windows-app">⬇️ Download for Windows</a>
          <p class="desk-step">
            Open the file and corkboard installs itself and appears on your desktop. Windows may say it's from an unknown
            publisher: <i>More info → Run anyway</i>.
          </p>
        </div>
        <div class="desk-tip">
          <p>
            The app keeps its own boards. To bring these along: <b>+ → Backup</b> here, then <b>+ → Import files</b> in the app.
          </p>
          <p><b>No install?</b> Show just the board in its own full-screen window (press <b>F11</b>):</p>
          <label class="desk-check">
            <select v-model="wallBoardId" data-field="wall-board">
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
            </select>
          </label>
          <button class="ghost" data-action="board-wall-open" @click="emit('wall', wallBoardId)">Open full screen</button>
        </div>
      </article>

      <h3 class="desk-or">Or a widget with just what you need</h3>
      <div class="desk-grid">
        <div class="desk-pick">
          <p class="desk-label">Show</p>
          <div class="desk-parts">
            <button
              v-for="p in DESK_PARTS"
              :key="p.id"
              class="desk-part"
              :class="{ on: cfg.parts.includes(p.id) }"
              :aria-pressed="cfg.parts.includes(p.id)"
              :data-part="p.id"
              @click="toggle(p.id)"
            >
              <span class="dp-ico" aria-hidden="true">{{ p.icon }}</span>
              <span class="dp-txt"><b>{{ p.label }}</b><small>{{ p.hint }}</small></span>
              <span class="dp-check" aria-hidden="true">{{ cfg.parts.includes(p.id) ? '✓' : '' }}</span>
            </button>
          </div>
          <label v-if="cfg.parts.includes('board') && boards.length > 1" class="desk-board">
            <span>Board</span>
            <select v-model="cfg.boardId">
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
            </select>
          </label>
          <p class="desk-label">Style</p>
          <div class="desk-themes">
            <button
              v-for="t in DESK_THEMES"
              :key="t.id"
              :class="['desk-theme', `dt-${t.id}`, { on: cfg.theme === t.id }]"
              :aria-pressed="cfg.theme === t.id"
              @click="cfg.theme = t.id"
            >
              {{ t.label }}
            </button>
          </div>
        </div>
        <div ref="pbox" class="desk-preview" aria-label="Preview">
          <div
            class="desk-window"
            :style="{ width: `${win.w}px`, height: `${win.h}px`, transform: `translate(-50%, -50%) scale(${pscale})` }"
          >
            <WidgetView :config="previewCfg" :boards="boards" preview />
          </div>
        </div>
      </div>

      <div class="desk-ways">
        <article class="desk-way">
          <h3>🪟 Widget on your desktop</h3>
          <p>A small corkboard window that stays on your screen. Reminders pop up while it's open.</p>
          <button class="solid" data-action="desk-open" @click="emit('open', cfg)">Open widget</button>
          <p class="desk-tip">
            <b>Open it every time Windows starts:</b> Edge → <code>edge://apps</code> → ⋯ on corkboard →
            <i>Auto-start on device login</i>. Chrome → <code>chrome://apps</code> → right-click corkboard →
            <i>Start app when you sign in</i>.
          </p>
        </article>
      </div>
    </section>
  </div>
</template>
