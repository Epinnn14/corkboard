import { onScopeDispose, ref } from 'vue';

const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;

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
