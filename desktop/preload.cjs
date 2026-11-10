'use strict';

// The small, explicit bridge the web app sees as window.corkboardDesktop (src/core/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

const listeners = [];
let last = null;
ipcRenderer.on('cb:edit-mode', (_e, state) => {
  last = { editing: !!state?.editing, simple: !!state?.simple };
  for (const cb of listeners) cb(last);
});

contextBridge.exposeInMainWorld('corkboardDesktop', {
  wall: process.argv.includes('--cb-wall'),
  version: process.env.npm_package_version ?? '',
  onEditMode(cb) {
    if (typeof cb !== 'function') return;
    listeners.push(cb);
    if (last) cb(last);
  },
  edit: () => ipcRenderer.send('cb:edit'),
  done: () => ipcRenderer.send('cb:done'),
  openApp: () => ipcRenderer.send('cb:open-app'),
  setBoardRect: (r) => ipcRenderer.send('cb:board-rect', { x: +r.x, y: +r.y, w: +r.w, h: +r.h }),
  getSettings: () => ipcRenderer.invoke('cb:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('cb:set-settings', patch),
});
