import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { loadBoard, saveBoard } from './core/storage';
import { useBoard, welcomeBoard } from './stores/board';
import './style.css';

const app = createApp(App).use(createPinia());
const store = useBoard();

loadBoard().then((saved) => {
  store.replace(saved ?? welcomeBoard());
  // autosave, debounced
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.$subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveBoard(store.board), 300);
  });
  window.addEventListener('pagehide', () => void saveBoard(store.board));
  app.mount('#app');
});
