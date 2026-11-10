import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { loadWorkspace, saveWorkspace } from './core/storage';
import { startAutosave } from './core/sync';
import { autoOrientation } from './core/workspace';
import { useWorkspace, welcomeWorkspace } from './stores/workspace';
import './style.css';

const app = createApp(App).use(createPinia());
const store = useWorkspace();

loadWorkspace().then((saved) => {
  store.replace(saved ?? welcomeWorkspace(autoOrientation({ w: window.innerWidth, h: window.innerHeight })));
  // autosave (debounced) and keep other corkboard windows (widget, app) in step
  startAutosave(store, { save: saveWorkspace, load: loadWorkspace, channel: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('corkboard') : null });
  window.addEventListener('pagehide', () => void saveWorkspace(store.ws));
  app.mount('#app');
});
