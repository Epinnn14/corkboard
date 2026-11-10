<script setup lang="ts">
import { computed, ref } from 'vue';
import { browserGuide, detectBrowser, detectDevice, installGuide, type Platform } from '../core/install';

const props = defineProps<{ canPrompt: boolean; installed: boolean; justInstalled: boolean; initial?: Platform | null }>();
const emit = defineEmits<{ install: []; close: [] }>();

const ua = navigator.userAgent;
const here = detectDevice(ua, navigator.maxTouchPoints ?? 0);
const browser = detectBrowser(ua);
// a Chromebook / Linux laptop starts on Windows and gets the browser install below
const tab = ref<Platform>(props.initial ?? (here === 'other' ? 'windows' : here));

const TABS: { id: Platform; label: string; icon: string }[] = [
  { id: 'windows', label: 'Windows', icon: '🪟' },
  { id: 'mac', label: 'Mac', icon: '🍎' },
  { id: 'ios', label: 'iPhone / iPad', icon: '📱' },
  { id: 'android', label: 'Android', icon: '🤖' },
];

const isHere = computed(() => tab.value === here);
// steps for the device on the chosen tab; another device is shown with its usual browser
const guide = computed(() =>
  isHere.value ? installGuide(here, browser) : installGuide(tab.value, tab.value === 'ios' ? 'safari' : 'chrome'),
);
const laptopTab = computed(() => tab.value === 'windows' || tab.value === 'mac');
// on a laptop, the website itself can also be installed from the browser, no download
const onLaptop = here === 'windows' || here === 'mac' || here === 'other';
const web = browserGuide(browser);
const link = computed(() => `${location.href.replace(/#.*$/, '')}#install=${tab.value}`);
const oneClick = computed(() => props.canPrompt && isHere.value && !laptopTab.value);
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet install" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <header class="sheet-head">
        <h2 id="install-title">Install corkboard</h2>
        <button class="ghost" @click="emit('close')">Close</button>
      </header>

      <div v-if="justInstalled || (installed && !laptopTab)" class="inst-done">
        <span class="inst-big" aria-hidden="true">🎉</span>
        <p v-if="installed"><b>You're using the installed app.</b> Nothing else to do.</p>
        <p v-else>
          <b>Installed!</b> Open corkboard from your
          {{ onLaptop ? 'Start menu, taskbar or Dock' : 'home screen' }}. Press and hold its icon for the
          Widget and Agenda shortcuts.
        </p>
      </div>

      <template v-else>
        <p class="inst-lead">Free, no account, works offline. Pick your device:</p>

        <div class="inst-tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.id"
            role="tab"
            :aria-selected="tab === t.id"
            :class="{ on: tab === t.id }"
            :data-tab="t.id"
            @click="tab = t.id"
          >
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}<small v-if="t.id === here"> · this device</small>
          </button>
        </div>

        <div v-if="guide.download" class="inst-one">
          <a class="solid inst-go" :href="guide.download.href" :data-action="`download-${tab}`">⬇️ {{ guide.download.label }}</a>
          <p v-if="!isHere && here !== 'other'">Open this on your {{ tab === 'mac' ? 'Mac' : 'Windows laptop' }}, or send yourself the link: <code>{{ link }}</code></p>
        </div>
        <div v-else-if="oneClick" class="inst-one">
          <button class="solid inst-go" data-action="install-now" @click="emit('install')">⬇️ Install now</button>
          <p>Your browser asks once to confirm, then corkboard is on your home screen.</p>
        </div>
        <div v-else-if="!isHere" class="inst-other">
          <p>Open this link on your {{ tab === 'ios' ? 'iPhone or iPad' : 'Android phone' }}, it shows the steps there:</p>
          <code>{{ link }}</code>
        </div>

        <ol class="inst-steps">
          <li v-for="(s, i) in guide.steps" :key="i">{{ s }}</li>
        </ol>
        <p v-if="oneClick" class="inst-note">Button not working? These steps do the same thing.</p>
        <p v-if="guide.note && (isHere || laptopTab)" class="inst-note">{{ guide.note }}</p>

        <details v-if="laptopTab && onLaptop" class="inst-web" :open="here === 'other'">
          <summary>Or without a download: install it from this browser</summary>
          <button v-if="canPrompt" class="solid" data-action="install-now" @click="emit('install')">Install from the browser</button>
          <ol class="inst-steps">
            <li v-for="(s, i) in web.steps" :key="i">{{ s }}</li>
          </ol>
          <p class="inst-note">The browser version has the widget in a small window instead of on the desktop.</p>
        </details>
      </template>
    </section>
  </div>
</template>
