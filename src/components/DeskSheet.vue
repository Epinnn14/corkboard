<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Board } from '../core/board';
import { clampSize, DESK_MIN, DESK_PARTS, DESK_SIZES, DESK_THEMES, type DeskConfig, type DeskPart, deskWindowSize } from '../core/desk';
import { desktop, type DesktopSettings, WINDOWS_DOWNLOAD } from '../core/desktop';
import WidgetView from './WidgetView.vue';

const props = defineProps<{ boards: readonly Board[]; initial: DeskConfig }>();
const emit = defineEmits<{ close: []; save: [DeskConfig]; open: [DeskConfig] }>();

const cfg = ref<DeskConfig>({ ...props.initial, boardId: props.initial.boardId ?? props.boards[0]?.id ?? null });
watch(cfg, (c) => emit('save', { ...c }), { deep: true });

function toggle(p: DeskPart) {
  const on = cfg.value.parts.includes(p);
  if (on && cfg.value.parts.length === 1) return; // keep at least one thing on the widget
  cfg.value.parts = on
    ? cfg.value.parts.filter((x) => x !== p)
    : DESK_PARTS.map((d) => d.id).filter((id) => id === p || cfg.value.parts.includes(id));
}

// size: Auto (fits the content), a preset, or any custom size from one sticky note up
const sizeId = computed(() => {
  const s = cfg.value.size;
  if (!s) return 'auto';
  return DESK_SIZES.find((x) => x.size && x.size.w === s.w && x.size.h === s.h)?.id ?? 'custom';
});
function pickSize(id: string) {
  if (id === 'custom') {
    cfg.value.size = clampSize(cfg.value.size ?? deskWindowSize({ parts: cfg.value.parts }));
    customOpen.value = true;
    return;
  }
  customOpen.value = false;
  cfg.value.size = DESK_SIZES.find((x) => x.id === id)?.size ?? null;
}
const customOpen = ref(sizeId.value === 'custom');
function setCustom(axis: 'w' | 'h', v: string) {
  const cur = cfg.value.size ?? deskWindowSize({ parts: cfg.value.parts });
  cfg.value.size = clampSize({ ...cur, [axis]: Number(v) });
}

// inside the Windows app: the widget lives on the desktop already
const bridge = desktop();
const settings = ref<DesktopSettings | null>(null);
if (bridge) void bridge.getSettings().then((x) => (settings.value = x));
async function setSetting(patch: Partial<DesktopSettings>) {
  if (bridge) settings.value = await bridge.setSettings(patch);
}

// the preview is the real widget window, scaled down to fit
const pbox = ref<HTMLElement | null>(null);
const pw = ref({ w: 480, h: 360 });
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !pbox.value) return;
  ro = new ResizeObserver(([e]) => (pw.value = { w: e.contentRect.width, h: e.contentRect.height }));
  ro.observe(pbox.value);
});
onBeforeUnmount(() => ro?.disconnect());
const win = computed(() => deskWindowSize(cfg.value));
const pscale = computed(() => Math.min(1, (pw.value.w - 20) / win.value.w, (pw.value.h - 20) / win.value.h));
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet desk" role="dialog" aria-modal="true" aria-labelledby="desk-title">
      <header class="sheet-head">
        <h2 id="desk-title">Desktop widget</h2>
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
            <select v-model="cfg.boardId" data-field="desk-board">
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.title }}</option>
            </select>
          </label>
          <p class="desk-label">Size</p>
          <div class="desk-sizes" role="group" aria-label="Size">
            <button
              v-for="z in [...DESK_SIZES, { id: 'custom', label: 'Custom' }]"
              :key="z.id"
              class="desk-size"
              :class="{ on: sizeId === z.id || (z.id === 'custom' && customOpen && sizeId === 'custom') }"
              :aria-pressed="sizeId === z.id"
              :data-size="z.id"
              @click="pickSize(z.id)"
            >
              {{ z.label }}
            </button>
          </div>
          <div v-if="sizeId === 'custom' || customOpen" class="desk-custom">
            <label>W <input type="number" :min="DESK_MIN.w" step="10" :value="cfg.size?.w" data-field="size-w" @change="setCustom('w', ($event.target as HTMLInputElement).value)" /></label>
            ×
            <label>H <input type="number" :min="DESK_MIN.h" step="10" :value="cfg.size?.h" data-field="size-h" @change="setCustom('h', ($event.target as HTMLInputElement).value)" /></label>
            <small>px · smallest {{ DESK_MIN.w }} × {{ DESK_MIN.h }} (one sticky note)</small>
          </div>
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
            :style="{
              width: `${win.w}px`,
              height: cfg.parts.includes('board') || cfg.size ? `${win.h}px` : 'auto',
              transform: `translate(-50%, -50%) scale(${pscale})`,
            }"
          >
            <WidgetView :config="cfg" :boards="boards" preview :fit="!cfg.parts.includes('board') && !cfg.size" />
          </div>
        </div>
      </div>

      <div class="desk-ways">
        <article v-if="bridge" class="desk-way" data-card="app-widget">
          <h3>🧩 On your desktop</h3>
          <p>
            Changes show on the widget right away. Drag it by its top strip, resize it from its bottom-left corner, and
            tick reminders off right on it.
          </p>
          <button class="solid" data-action="widget-show" @click="bridge.showWidget()">Show the widget (top right)</button>
          <label class="desk-check">
            <input type="checkbox" :checked="settings?.widget" data-field="widget-on" @change="setSetting({ widget: ($event.target as HTMLInputElement).checked })" />
            Show the widget on my desktop
          </label>
          <label class="desk-check">
            <input type="checkbox" :checked="settings?.onTop" data-field="widget-top" @change="setSetting({ onTop: ($event.target as HTMLInputElement).checked })" />
            Keep it above other windows
          </label>
          <label class="desk-check">
            <input type="checkbox" :checked="settings?.startup" data-field="widget-startup" @change="setSetting({ startup: ($event.target as HTMLInputElement).checked })" />
            Start corkboard with Windows
          </label>
        </article>
        <template v-else>
          <article class="desk-way desk-get" data-card="get-app">
            <h3>🧩 corkboard for Windows</h3>
            <p>
              The widget sits on your desktop from the moment Windows starts, with reminders all day. Free, installs
              itself in a few seconds.
            </p>
            <a class="solid desk-dl" :href="WINDOWS_DOWNLOAD" data-action="get-windows-app">⬇️ Download corkboard.exe</a>
            <p class="desk-tip">Windows may say the publisher is unknown: <i>More info → Run anyway</i>.</p>
          </article>
          <article class="desk-way">
            <h3>🪟 Or here, in a small window</h3>
            <p>Open the widget in its own browser window and keep it beside your work.</p>
            <button class="solid" data-action="desk-open" @click="emit('open', cfg)">Open widget</button>
          </article>
        </template>
      </div>
    </section>
  </div>
</template>
