<script setup lang="ts">
import { computed, inject, nextTick, ref, type Ref, watch } from 'vue';
import { CARD_COLORS, isHexColor, type Note, STICKY_COLORS } from '../core/board';
import { dueLabel, dueState } from '../core/dates';
import { fileToDataUrl } from '../core/image';
import { useNow } from '../composables/now';
import DueEditor from './DueEditor.vue';
import { useWorkspace } from '../stores/workspace';
import PushPin from './PushPin.vue';

const props = defineProps<{ note: Note }>();
const store = useWorkspace();
const scale = inject<Ref<number>>('scale', ref(1));

const editor = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const paletteOpen = ref(false);
const dueOpen = ref(false);
const now = useNow();
const board = computed(() => store.find(props.note.id)?.board ?? null);
const state = computed(() => dueState(props.note, now.value));
const chip = computed(() => (props.note.due ? dueLabel(props.note.due, now.value) : ''));
watch(
  () => store.selectedId === props.note.id,
  (sel) => {
    if (!sel) dueOpen.value = paletteOpen.value = false;
  },
);
const selected = computed(() => store.selectedId === props.note.id);
const swatches = computed<readonly string[]>(() =>
  props.note.kind === 'sticky' ? STICKY_COLORS : props.note.kind === 'card' ? CARD_COLORS : [],
);

function setColor(c: string) {
  if (isHexColor(c)) store.updateNote(props.note.id, { color: c.toLowerCase() });
}

const style = computed(() => ({
  left: `${props.note.x}px`,
  top: `${props.note.y}px`,
  width: `${props.note.w}px`,
  height: `${props.note.h}px`,
  zIndex: String(props.note.z),
  '--rot': `${dragging.value ? props.note.rotation * 0.4 : props.note.rotation}deg`,
  '--paper': props.note.color,
}));

const placeholder: Record<Note['kind'], string> = {
  sticky: 'Write something…',
  index: 'Title\nnotes…',
  lined: 'Notes…',
  polaroid: 'caption',
  card: 'Write something…',
  sticker: '',
};

// ---- drag: anywhere on the note moves it; a click without movement starts editing
let start: { px: number; py: number; x: number; y: number; id: number } | null = null;
// where the press began: with pointer capture, pointerup always targets the note itself
let pressedPhoto = false;

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest('.note-tools')) return;
  // while editing, dragging inside the text selects text; the top strip (.grip) still moves the note
  if (target === editor.value && document.activeElement === editor.value) return;
  e.preventDefault();
  pressedPhoto = props.note.kind === 'polaroid' && !!target.closest('.photo');
  store.select(props.note.id);
  start = { px: e.clientX, py: e.clientY, x: props.note.x, y: props.note.y, id: e.pointerId };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  const dx = (e.clientX - start.px) / scale.value;
  const dy = (e.clientY - start.py) / scale.value;
  if (!dragging.value && Math.hypot(dx, dy) < 4) return;
  dragging.value = true;
  paletteOpen.value = false;
  dueOpen.value = false;
  store.dragNote(props.note.id, start.x + dx, start.y + dy);
}

async function onPointerUp(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  const wasDrag = dragging.value;
  start = null;
  dragging.value = false;
  if (wasDrag) {
    store.dropNote(props.note.id);
    return;
  }
  if (props.note.kind === 'sticker') return;
  if (pressedPhoto) {
    // a tap on the picture (not the caption) picks a photo straight away
    pressedPhoto = false;
    fileInput.value?.click();
    return;
  }
  await nextTick();
  editor.value?.focus();
}

function onInput(e: Event) {
  store.updateNote(props.note.id, { text: (e.target as HTMLTextAreaElement).value });
}

async function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    store.updateNote(props.note.id, { image: await fileToDataUrl(file) });
  } catch {
    store.updateNote(props.note.id, { text: 'That file is not an image' });
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    paletteOpen.value = false;
    dueOpen.value = false;
    editor.value?.blur();
    store.select(null);
  }
}
</script>

<template>
  <div
    class="note"
    :class="[note.kind, { selected, dragging }]"
    :style="style"
    :data-id="note.id"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div v-if="note.kind === 'sticker'" class="sticker" aria-label="Sticker">{{ note.text }}</div>
    <div class="grip" title="Drag to move" />
    <div v-if="note.kind !== 'sticker'" class="paper">
      <div v-if="note.kind === 'polaroid'" class="photo" :title="note.image ? 'Click to change the photo' : 'Click to add a photo'">
        <img v-if="note.image" :src="note.image" alt="" draggable="false" />
        <span v-else class="photo-hint">📸 tap to add a photo</span>
      </div>
      <div v-if="note.kind === 'index'" class="index-rule" />
      <textarea
        ref="editor"
        class="ink"
        :value="note.text"
        :placeholder="placeholder[note.kind]"
        :maxlength="note.kind === 'polaroid' ? 60 : 2000"
        spellcheck="false"
        @input="onInput"
        @keydown="onKey"
      />
    </div>

    <span v-if="note.tape && note.kind !== 'sticker'" class="tape" :class="note.tape" aria-hidden="true" />
    <template v-else-if="note.kind === 'sticker'" />
    <template v-else-if="note.kind === 'card'">
      <PushPin class="pin tl" :color="note.pin" />
      <PushPin class="pin tr" :color="note.pin" />
      <PushPin class="pin bl" :color="note.pin" />
      <PushPin class="pin br" :color="note.pin" />
    </template>
    <PushPin v-else class="pin top" :color="note.pin" />

    <button
      v-if="note.due"
      class="due-chip"
      :class="state"
      :title="note.done ? 'Done — click to undo' : 'Mark as done'"
      @pointerdown.stop
      @dblclick.stop
      @click="store.toggleDone(note.id)"
    >
      <span aria-hidden="true">{{ note.done ? '✔' : note.remind !== undefined ? '⏰' : '📅' }}</span>{{ chip }}
    </button>
    <div v-if="selected && !dragging" class="note-tools" @pointerdown.stop @dblclick.stop>
      <template v-if="swatches.length">
        <button
          class="swatch current"
          :style="{ background: note.color }"
          :aria-expanded="paletteOpen"
          title="Change colour"
          @click="paletteOpen = !paletteOpen; dueOpen = false"
        />
        <div v-if="paletteOpen" class="palette" role="group" aria-label="Colours">
          <button
            v-for="c in swatches"
            :key="c"
            class="swatch"
            :class="{ on: c === note.color }"
            :style="{ background: c }"
            :title="c"
            @click="setColor(c)"
          />
          <label class="custom" title="Any colour">
            <input type="color" :value="note.color" @input="setColor(($event.target as HTMLInputElement).value)" />
            <span>+</span>
          </label>
        </div>
      </template>
      <button v-if="note.kind === 'polaroid'" class="tool" title="Choose photo" @click="fileInput?.click()">🖼</button>
      <button
        v-if="note.kind !== 'sticker'"
        class="tool"
        :title="note.tape ? 'Next tape (last one goes back to a pin)' : 'Use washi tape instead of a pin'"
        @click="store.cycleFastener(note.id)"
      >
        {{ note.tape ? '🎀' : '📍' }}
      </button>
      <button
        class="tool"
        :class="{ on: dueOpen }"
        title="Date & reminder"
        :aria-expanded="dueOpen"
        @click="dueOpen = !dueOpen; paletteOpen = false"
      >
        📅
      </button>
      <DueEditor v-if="dueOpen && board" :note="note" :board="board" @close="dueOpen = false" />
      <button class="tool" title="Duplicate" @click="store.duplicateNote(note.id)">⧉</button>
      <button class="tool danger" title="Remove (Delete)" @click="store.removeNote(note.id)">🗑</button>
    </div>
    <input
      v-if="note.kind === 'polaroid'"
      ref="fileInput"
      class="hidden-file"
      type="file"
      accept="image/*"
      @change="onPhoto"
    />
  </div>
</template>

<style scoped>
.note {
  position: absolute;
  transform: rotate(var(--rot));
  transform-origin: 50% 0;
  touch-action: none;
  cursor: grab;
  transition: transform 0.15s ease, filter 0.15s ease;
  user-select: none;
}
.note.dragging { cursor: grabbing; transition: none; filter: drop-shadow(0 18px 18px rgba(0, 0, 0, 0.35)); }
.note.selected .paper { outline: 2px dashed rgba(40, 30, 10, 0.45); outline-offset: 4px; }

.paper {
  position: absolute;
  inset: 0;
  background: var(--paper);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.25), 0 8px 14px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}
.ink {
  flex: 1;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: #2b2620;
  font: 400 26px/1.25 'Caveat', 'Comic Sans MS', cursive;
  padding: 34px 18px 14px;
  cursor: inherit;
  overflow: hidden;
}
.ink:focus { cursor: text; }
.ink::placeholder { color: rgba(43, 38, 32, 0.35); }

/* sticky: soft gradient and a lifted bottom corner */
.sticky .paper {
  background: linear-gradient(170deg, color-mix(in srgb, var(--paper) 88%, white) 0%, var(--paper) 55%, color-mix(in srgb, var(--paper) 90%, black) 100%);
  border-bottom-right-radius: 60px 6px;
}
.sticky .paper::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 60%;
  height: 20%;
  z-index: -1;
  box-shadow: 8px 10px 14px rgba(0, 0, 0, 0.35);
  transform: rotate(4deg);
}
.sticky .ink { font-size: 30px; }

/* index card: red header rule, blue rules aligned to the text lines (26px) */
.index .paper {
  background:
    linear-gradient(var(--paper) 0 46px, rgba(231, 111, 111, 0.85) 46px 49px, transparent 49px),
    linear-gradient(transparent 24px, rgba(122, 172, 222, 0.7) 24px 26px) 0 22px / 100% 26px repeat-y,
    var(--paper);
}
.index .ink { font: 400 21px/26px 'Patrick Hand', 'Comic Sans MS', cursive; padding: 22px 18px 8px; }

/* lined notebook paper with a margin line and a perforated top edge */
.lined .paper {
  background:
    linear-gradient(#f7f7f4 0 39px, transparent 39px),
    linear-gradient(90deg, transparent 37px, rgba(231, 111, 111, 0.55) 37px 40px, transparent 40px),
    linear-gradient(transparent 24px, rgba(150, 180, 214, 0.65) 24px 26px) 0 40px / 100% 26px repeat-y,
    #f7f7f4;
  -webkit-mask: radial-gradient(circle 4px at 10px 0, transparent 98%, #000) -6px 0 / 16px 100% repeat-x;
  mask: radial-gradient(circle 4px at 10px 0, transparent 98%, #000) -6px 0 / 16px 100% repeat-x;
}
.lined .ink { font: 400 21px/26px 'Patrick Hand', 'Comic Sans MS', cursive; padding: 40px 14px 8px 48px; }

/* polaroid */
.polaroid .paper { background: #fbfbf8; padding: 14px 14px 0; }
.photo { height: 190px; background: linear-gradient(135deg, #ffd6e0, #e3d3ff 50%, #c7e6ff); overflow: hidden; display: grid; place-items: center; }
.photo img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.photo-hint { color: rgba(43, 38, 32, 0.6); font: 18px 'Patrick Hand', cursive; }
.polaroid .ink { text-align: center; padding: 10px 6px 4px; font-size: 24px; }

/* plain card with four pins */
.card .paper { background: linear-gradient(160deg, color-mix(in srgb, var(--paper) 92%, white), var(--paper)); }
.card .ink { font: 400 22px/1.3 'Patrick Hand', 'Comic Sans MS', cursive; padding: 30px 24px 18px; }

.pin { position: absolute; pointer-events: none; z-index: 2; }

/* die-cut sticker: thick white outline + soft shadow */
.sticker {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 86px;
  line-height: 1;
  filter: drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff)
    drop-shadow(0 5px 6px rgba(0, 0, 0, 0.3));
}
.note.sticker.selected .sticker { outline: 2px dashed rgba(40, 30, 10, 0.45); outline-offset: 2px; border-radius: 16px; }

/* washi tape */
.tape {
  position: absolute;
  left: calc(50% - 60px);
  top: -16px;
  width: 120px;
  height: 32px;
  transform: rotate(-4deg);
  z-index: 2;
  pointer-events: none;
  opacity: 0.88;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  clip-path: polygon(0 0, 100% 0, 97% 16%, 100% 32%, 97% 48%, 100% 64%, 97% 80%, 100% 100%, 0 100%, 3% 84%, 0 68%, 3% 52%, 0 36%, 3% 20%);
}
.tape.pink-stripes { background: repeating-linear-gradient(45deg, #ff9fbf 0 8px, #ffd3e2 8px 16px); }
.tape.mint-dots { background: radial-gradient(circle, #fff 2.2px, transparent 2.6px) 0 0 / 12px 12px, #8fe0c5; }
.tape.sun-grid { background: linear-gradient(rgba(255, 255, 255, 0.55) 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(90deg, rgba(255, 255, 255, 0.55) 1px, transparent 1px) 0 0 / 8px 8px, #ffd45c; }
.tape.kraft { background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent), #c9a27a; }
.tape.lilac-check { background: repeating-conic-gradient(#c8b2ff 0 25%, #eee6ff 0 50%) 0 0 / 12px 12px; }
.grip { position: absolute; left: 0; right: 0; top: 0; height: 26px; z-index: 1; }
.note.selected .grip { cursor: move; }
.pin.top { left: calc(50% - 15px); top: -14px; }
.pin.tl { left: -8px; top: -10px; }
.pin.tr { right: -8px; top: -10px; }
.pin.bl { left: -8px; bottom: -14px; }
.pin.br { right: -8px; bottom: -14px; }

.note-tools {
  position: absolute;
  left: 50%;
  bottom: -54px;
  transform: translateX(-50%) rotate(calc(var(--rot) * -1));
  display: flex;
  gap: 6px;
  align-items: center;
  background: #2b2620;
  padding: 6px 8px;
  border-radius: 999px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  z-index: 3;
  cursor: default;
  white-space: nowrap;
}
.swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; flex: none; }
.swatch.on, .swatch.current { border-color: #fff; }
.palette {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(7, 22px);
  gap: 8px;
  padding: 10px;
  background: #2b2620;
  border-radius: 14px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.custom {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: conic-gradient(#ff6b6b, #ffd166, #06d6a0, #4cc9f0, #9b5de5, #ff6b6b);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.custom span { color: #fff; font-weight: 700; font-size: 14px; text-shadow: 0 0 3px rgba(0, 0, 0, 0.6); }
.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; padding: 0; border: 0; }
.tool { background: transparent; border: 0; color: #fff; font-size: 17px; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.tool:hover, .tool.on { background: rgba(255, 255, 255, 0.16); }

/* date chip, bottom-right of the note */
.due-chip {
  position: absolute;
  right: -10px;
  bottom: -12px;
  z-index: 3;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  border: 0;
  border-radius: 999px;
  padding: 4px 10px;
  font: 600 14px 'Bricolage Grotesque Variable', system-ui, sans-serif;
  background: #2b2620;
  color: #fff;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  white-space: nowrap;
  transform: rotate(calc(var(--rot) * -1));
}
.due-chip.overdue { background: #d9412b; }
.due-chip.today { background: #f08c1a; }
.due-chip.tomorrow { background: #7a5cf0; }
.due-chip.done { background: #3c9a5f; text-decoration: line-through; }
.note.sticker .due-chip { right: -20px; }
.hidden-file { display: none; }
</style>
