import { onScopeDispose, ref } from 'vue';

const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;
// coming back to the window or waking the laptop: show the right day straight away
const refresh = () => (now.value = new Date());
if (typeof window !== 'undefined') {
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}

/** A shared clock that ticks every 20 s — enough for date chips and reminders. */
export function useNow() {
  users++;
  if (!timer) timer = setInterval(() => (now.value = new Date()), 20_000);
  onScopeDispose(() => {
    users--;
    if (!users && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  return now;
}

/** for tests */
export function setNow(d: Date) {
  now.value = d;
}
