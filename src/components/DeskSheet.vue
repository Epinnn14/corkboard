<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Board } from '../core/board';
import {
  DESK_PARTS,
  DESK_THEMES,
  type DeskConfig,
  type DeskPart,
  deskHash,
  deskWindowSize,
  encodeSnapshot,
  makeSnapshot,
} from '../core/desk';
import WidgetView from './WidgetView.vue';

const props = defineProps<{ boards: readonly Board[]; initial: DeskConfig }>();
const emit = defineEmits<{ close: []; save: [DeskConfig]; open: [DeskConfig] }>();

const cfg = ref<DeskConfig>({ ...props.initial, wall: false, boardId: props.initial.boardId ?? props.boards[0]?.id ?? null });
watch(cfg, (c) => emit('save', { ...c, wall: false }), { deep: true });

function toggle(p: DeskPart) {
  const on = cfg.value.parts.includes(p);
  if (on && cfg.value.parts.length === 1) return; // keep at least one thing on screen
  cfg.value.parts = on ? cfg.value.parts.filter((x) => x !== p) : DESK_PARTS.map((d) => d.id).filter((id) => id === p || cfg.value.parts.includes(id));
}

const base = () => window.location.href.replace(/#.*$/, '');
const wallLink = ref('');
const copied = ref(false);
async function copyWall() {
  const c = { ...cfg.value, wall: true };
  const snap = await encodeSnapshot(makeSnapshot(props.boards, c));
  wallLink.value = base() + deskHash(c, snap);
  try {
    await navigator.clipboard.writeText(wallLink.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 4000);
  } catch {
    copied.value = false; // the link stays visible below to copy by hand
  }
}
watch(cfg, () => (wallLink.value = ''), { deep: true });

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
        <article class="desk-way">
          <h3>🌄 Live wallpaper <small>with Lively Wallpaper</small></h3>
          <p>Behind your desktop icons, with a live clock. It shows your reminders as they are now; copy the link again after you change them.</p>
          <button class="solid" data-action="desk-wall" @click="copyWall">{{ copied ? 'Link copied ✓' : 'Copy wallpaper link' }}</button>
          <a v-if="wallLink" class="desk-try" :href="wallLink" target="_blank" rel="noopener">Preview it</a>
          <input v-if="wallLink && !copied" class="desk-link" readonly :value="wallLink" @focus="($event.target as HTMLInputElement).select()" />
          <ol class="desk-tip">
            <li>Open <b>Lively Wallpaper</b> (free in the Microsoft Store) and press <b>+</b></li>
            <li>Paste the link into the URL box and press the arrow</li>
            <li>Choose it as your wallpaper</li>
          </ol>
        </article>
      </div>
    </section>
  </div>
</template>
