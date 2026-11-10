'use strict';

// The small, explicit bridge the web app sees as window.corkboardDesktop (src/core/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

const listeners = [];
ipcRenderer.on('cb:settings', (_e, s) => {
  for (const cb of listeners) cb(s);
});

contextBridge.exposeInMainWorld('corkboardDesktop', {
  widget: process.argv.includes('--cb-widget'),
  platform: process.platform,
  openApp: (view) => ipcRenderer.send('cb:open-app', typeof view === 'string' ? view : undefined),
  resizeWidget: (w, h) => ipcRenderer.send('cb:resize-widget', +w, +h),
  showWidget: () => ipcRenderer.send('cb:show-widget'),
  getSettings: () => ipcRenderer.invoke('cb:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('cb:set-settings', patch),
  onSettings(cb) {
    if (typeof cb === 'function') listeners.push(cb);
  },
});
