import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { loadWorkspace, saveWorkspace } from './core/storage';
import { autoOrientation } from './core/workspace';
import { useWorkspace, welcomeWorkspace } from './stores/workspace';
import './style.css';

const app = createApp(App).use(createPinia());
const store = useWorkspace();

loadWorkspace().then((saved) => {
  store.replace(saved ?? welcomeWorkspace(autoOrientation({ w: window.innerWidth, h: window.innerHeight })));
  // autosave, debounced
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.$subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveWorkspace(store.ws), 400);
  });
  window.addEventListener('pagehide', () => void saveWorkspace(store.ws));
  app.mount('#app');
});
