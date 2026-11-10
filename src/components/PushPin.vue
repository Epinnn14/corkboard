<script setup lang="ts">
import type { PinColor } from '../core/board';

defineProps<{ color: PinColor }>();

const COLORS: Record<PinColor, [string, string]> = {
  red: ['#ff6b6b', '#b3141c'],
  green: ['#6fdc8c', '#1e7a3c'],
  blue: ['#7fb2ff', '#1d4fa8'],
  yellow: ['#ffe36b', '#b38a00'],
  white: ['#ffffff', '#a8a8a8'],
};
</script>

<template>
  <svg class="pin" viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <radialGradient :id="`pin-${color}`" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.9" />
        <stop offset="25%" :stop-color="COLORS[color][0]" />
        <stop offset="100%" :stop-color="COLORS[color][1]" />
      </radialGradient>
    </defs>
    <ellipse cx="24" cy="27" rx="10" ry="6" fill="rgba(0,0,0,0.28)" />
    <circle cx="20" cy="20" r="11.5" fill="rgba(0,0,0,0.18)" />
    <circle cx="20" cy="19" r="11" :fill="`url(#pin-${color})`" />
    <circle cx="20" cy="19" r="11" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1" />
  </svg>
</template>

<style scoped>
/* the shadow is drawn in the SVG: a CSS filter here would make Safari blur the zoomed-out boards */
.pin { width: 30px; height: 30px; display: block; }
</style>
