<script setup lang="ts">
import { computed, ref } from 'vue';
import { type Device, detectBrowser, detectDevice, installGuide } from '../core/install';

const props = defineProps<{ canPrompt: boolean; installed: boolean; justInstalled: boolean }>();
const emit = defineEmits<{ install: []; close: [] }>();

const ua = navigator.userAgent;
const here = detectDevice(ua, navigator.maxTouchPoints ?? 0);
const browser = detectBrowser(ua);
const tab = ref<Device>(here);

const TABS: { id: Device; label: string; icon: string }[] = [
  { id: 'desktop', label: 'Laptop / PC', icon: '💻' },
  { id: 'android', label: 'Android', icon: '🤖' },
  { id: 'ios', label: 'iPhone / iPad', icon: '📱' },
];

// steps for the device on the chosen tab; another device is shown with its usual browser
const guide = computed(() =>
  tab.value === here ? installGuide(here, browser) : installGuide(tab.value, tab.value === 'ios' ? 'safari' : 'chrome'),
);
const link = computed(() => location.href.replace(/#.*$/, '') + '#install');
const oneClick = computed(() => props.canPrompt && tab.value === here);
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet install" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <header class="sheet-head">
        <h2 id="install-title">Install corkboard</h2>
        <button class="ghost" @click="emit('close')">Close</button>
      </header>

      <div v-if="installed || justInstalled" class="inst-done">
        <span class="inst-big" aria-hidden="true">🎉</span>
        <p v-if="installed"><b>You're using the installed app.</b> Nothing else to do.</p>
        <p v-else>
          <b>Installed!</b> Open corkboard from your
          {{ here === 'desktop' ? 'Start menu, taskbar or Dock' : 'home screen' }}. Press and hold its icon for the
          Widget and Agenda shortcuts.
        </p>
      </div>

      <template v-else>
        <p class="inst-lead">
          Its own icon and window, works offline, reminders while it's open, and Widget / Agenda shortcuts.
          Free, no store, no account.
        </p>

        <div class="inst-tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.id"
            role="tab"
            :aria-selected="tab === t.id"
            :class="{ on: tab === t.id }"
            @click="tab = t.id"
          >
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}<small v-if="t.id === here"> · this device</small>
          </button>
        </div>

        <div v-if="oneClick" class="inst-one">
          <button class="solid inst-go" data-action="install-now" @click="emit('install')">⬇️ Install now</button>
          <p>Your browser asks once to confirm, then corkboard is on your
            {{ here === 'desktop' ? 'Start menu / Dock' : 'home screen' }}.</p>
        </div>

        <div v-else-if="tab !== here" class="inst-other">
          <p>Open this link on your {{ tab === 'desktop' ? 'laptop' : 'phone' }}, it shows the install button there:</p>
          <code>{{ link }}</code>
        </div>

        <ol class="inst-steps">
          <li v-for="(s, i) in guide.steps" :key="i">{{ s }}</li>
        </ol>
        <p v-if="oneClick" class="inst-note">Button not working? These steps do the same thing.</p>
        <p v-if="guide.note && tab === here" class="inst-note">{{ guide.note }}</p>
      </template>
    </section>
  </div>
</template>
