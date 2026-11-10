'use strict';

/**
 * corkboard for Windows.
 *
 * Two kinds of windows show the same corkboard (one storage, kept in step by
 * the web app itself):
 *  - the wallpaper: one board (#wall) filling the main screen, behind the
 *    desktop icons. Double-click it (or click the tray icon) to edit; Done
 *    puts it back behind the icons.
 *  - the app: the full corkboard, from the Start menu, desktop or tray.
 *
 * It lives in the tray and can start with Windows, so the wallpaper and the
 * reminders are there all day.
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isWin = process.platform === 'win32';
let win32 = null;
if (isWin) {
  try {
    win32 = require('./win32.cjs');
  } catch (e) {
    console.error('corkboard: Win32 helpers unavailable, using simple mode', e);
  }
}

const WEB = path.join(__dirname, 'web');
const ORIGIN = 'app://corkboard/';
const PRELOAD = path.join(__dirname, 'preload.cjs');
const ICON = path.join(__dirname, 'build', 'tray.png');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// ------------------------------------------------------------- settings
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { wallpaper: true, mode: 'behind', startup: true, firstRun: true };
let settings = { ...DEFAULTS };
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
  if (settings.mode !== 'simple') settings.mode = 'behind';
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('corkboard: could not save settings', e);
  }
}
function applyStartup() {
  if (!app.isPackaged) return; // don't register the dev build
  app.setLoginItemSettings({ openAtLogin: settings.startup, args: ['--hidden'] });
}

// ------------------------------------------------------------- the app window
let appWin = null;
function openApp() {
  if (appWin && !appWin.isDestroyed()) {
    if (appWin.isMinimized()) appWin.restore();
    appWin.show();
    appWin.focus();
    return appWin;
  }
  appWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 480,
    show: false,
    title: 'corkboard',
    icon: ICON,
    autoHideMenuBar: true,
    backgroundColor: '#ece6db',
    webPreferences: { preload: PRELOAD },
  });
  wireWindow(appWin);
  appWin.loadURL(`${ORIGIN}index.html`);
  appWin.once('ready-to-show', () => appWin.show());
  appWin.on('closed', () => (appWin = null));
  return appWin;
}

/** Links to other sites open in the browser; corkboard pop-ups (widget) stay in the app. */
function wireWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON, webPreferences: { preload: PRELOAD } },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
}

// ------------------------------------------------------------- the wallpaper
let wall = null;
let editing = false;
let host = 0; // the desktop window we sit in, when behind the icons
let embedded = undefined; // last attempt worked?
let boardRect = null; // where the board is inside the wallpaper (DIP)

const primary = () => screen.getPrimaryDisplay();
const simpleMode = () => settings.mode === 'simple' || !win32;

function sendEditMode() {
  if (wall && !wall.isDestroyed()) {
    wall.webContents.send('cb:edit-mode', { editing: editing || simpleMode(), simple: simpleMode() });
  }
}

function createWall() {
  if (wall && !wall.isDestroyed()) return;
  const d = primary();
  wall = new BrowserWindow({
    ...d.bounds,
    frame: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: 'corkboard wallpaper',
    icon: ICON,
    backgroundColor: '#ece6db',
    webPreferences: { preload: PRELOAD, additionalArguments: ['--cb-wall'], backgroundThrottling: false },
  });
  wireWindow(wall);
  wall.loadURL(`${ORIGIN}index.html#wall`);
  wall.once('ready-to-show', () => {
    wall.show();
    toWallpaper();
  });
  wall.webContents.on('did-finish-load', sendEditMode);
  wall.on('blur', () => {
    if (simpleMode() && win32 && wall) win32.sendToBack(win32.hwndOf(wall.getNativeWindowHandle()));
  });
  wall.on('closed', () => {
    wall = null;
    host = 0;
    editing = false;
  });
}

function destroyWall() {
  if (!wall) return;
  const w = wall;
  wall = null;
  w.destroy();
  if (win32) setTimeout(() => win32.refreshWallpaper(), 200);
}

/** Put the wallpaper window where it belongs: behind the icons, or at the back. */
function toWallpaper() {
  if (!wall || wall.isDestroyed()) return;
  editing = false;
  const d = primary();
  if (simpleMode()) {
    wall.setBounds(d.workArea);
    if (win32) win32.sendToBack(win32.hwndOf(wall.getNativeWindowHandle()));
    sendEditMode();
    rebuildTray();
    return;
  }
  wall.setBounds(d.bounds);
  const physical = screen.dipToScreenRect(null, d.bounds);
  host = win32.embed(win32.hwndOf(wall.getNativeWindowHandle()), physical);
  embedded = !!host;
  if (!host) {
    // Windows wouldn't have it: fall back to a window kept at the back
    settings.mode = 'simple';
    saveSettings();
    toWallpaper();
    return;
  }
  sendEditMode();
  rebuildTray();
}

/** Bring the wallpaper to the front so it can be edited. */
function startEdit() {
  if (!settings.wallpaper) return openApp();
  if (!wall || wall.isDestroyed()) createWall();
  if (simpleMode()) {
    wall.show();
    wall.focus();
    return;
  }
  editing = true;
  win32.unembed(win32.hwndOf(wall.getNativeWindowHandle()));
  host = 0;
  wall.setBounds(primary().workArea);
  wall.show();
  wall.setAlwaysOnTop(true);
  wall.focus();
  wall.setAlwaysOnTop(false);
  sendEditMode();
  rebuildTray();
}

function endEdit() {
  if (!editing) return;
  toWallpaper();
}

// a double-click on the board, while the desktop is in front, starts editing
let wasDown = false;
let lastClick = null;
function watchDesktopClicks() {
  if (!win32) return;
  setInterval(() => {
    if (!wall || editing || simpleMode() || !host) {
      wasDown = false;
      return;
    }
    const down = win32.leftButtonDown();
    if (down && !wasDown) {
      const now = Date.now();
      const pt = win32.cursor();
      if (win32.desktopInFront() && overBoard(pt)) {
        const near = lastClick && Math.abs(lastClick.x - pt.x) < 8 && Math.abs(lastClick.y - pt.y) < 8;
        if (lastClick && near && now - lastClick.t < win32.doubleClickTime()) {
          lastClick = null;
          startEdit();
        } else {
          lastClick = { t: now, ...pt };
        }
      } else {
        lastClick = null;
      }
    }
    wasDown = down;
  }, 25);
  // Explorer restarted (or a display changed under us): go back behind the icons
  setInterval(() => {
    if (wall && !editing && !simpleMode() && !win32.stillEmbedded(win32.hwndOf(wall.getNativeWindowHandle()), host)) {
      toWallpaper();
    }
  }, 3000);
}

function overBoard(pt) {
  const dip = screen.screenToDipPoint(pt);
  const b = primary().bounds;
  const r = boardRect ?? { x: 0, y: 0, w: b.width, h: b.height };
  const x = dip.x - b.x;
  const y = dip.y - b.y;
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

// ------------------------------------------------------------- tray
let tray = null;
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: editing ? 'Done editing the wallpaper' : 'Edit the wallpaper', enabled: settings.wallpaper, click: () => (editing ? endEdit() : startEdit()) },
      { label: 'Open corkboard', click: openApp },
      { type: 'separator' },
      { label: 'Board as my wallpaper', type: 'checkbox', checked: settings.wallpaper, click: (i) => setSettings({ wallpaper: i.checked }) },
      {
        label: 'Wallpaper style',
        enabled: !!win32,
        submenu: [
          { label: 'Behind the desktop icons', type: 'radio', checked: settings.mode === 'behind', click: () => setSettings({ mode: 'behind' }) },
          { label: 'Simple (a window at the back)', type: 'radio', checked: settings.mode === 'simple', click: () => setSettings({ mode: 'simple' }) },
        ],
      },
      { label: 'Start with Windows', type: 'checkbox', checked: settings.startup, click: (i) => setSettings({ startup: i.checked }) },
      { type: 'separator' },
      { label: 'Quit corkboard', click: () => app.quit() },
    ]),
  );
}
function createTray() {
  const img = nativeImage.createFromPath(ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('corkboard: click to edit your wallpaper board');
  tray.on('click', () => (settings.wallpaper ? (editing ? endEdit() : startEdit()) : openApp()));
  rebuildTray();
}

// ------------------------------------------------------------- settings from the page
function publicSettings() {
  return { wallpaper: settings.wallpaper, mode: settings.mode, startup: settings.startup, embedded };
}
function setSettings(patch) {
  const before = { ...settings };
  if (typeof patch.wallpaper === 'boolean') settings.wallpaper = patch.wallpaper;
  if (patch.mode === 'behind' || patch.mode === 'simple') settings.mode = patch.mode;
  if (typeof patch.startup === 'boolean') settings.startup = patch.startup;
  saveSettings();
  if (settings.startup !== before.startup) applyStartup();
  if (settings.wallpaper !== before.wallpaper) settings.wallpaper ? createWall() : destroyWall();
  else if (settings.mode !== before.mode && wall) {
    if (before.mode === 'behind' && win32) {
      win32.unembed(win32.hwndOf(wall.getNativeWindowHandle()));
      host = 0;
    }
    embedded = undefined;
    toWallpaper();
  }
  rebuildTray();
  return publicSettings();
}

ipcMain.handle('cb:get-settings', () => publicSettings());
ipcMain.handle('cb:set-settings', (_e, patch) => setSettings(patch ?? {}));
ipcMain.on('cb:edit', () => startEdit());
ipcMain.on('cb:done', () => endEdit());
ipcMain.on('cb:open-app', () => openApp());
ipcMain.on('cb:board-rect', (e, r) => {
  if (wall && e.sender === wall.webContents && r && [r.x, r.y, r.w, r.h].every(Number.isFinite)) boardRect = r;
});

// ------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openApp());
  app.setAppUserModelId('com.epinnn14.corkboard');

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      const file = path.normalize(path.join(WEB, rel));
      if (!file.startsWith(WEB + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });

    loadSettings();
    if (settings.firstRun) {
      settings.firstRun = false;
      saveSettings();
      applyStartup();
    }
    createTray();
    if (settings.wallpaper) createWall();
    watchDesktopClicks();
    if (!process.argv.includes('--hidden')) openApp();

    const refit = () => wall && !editing && toWallpaper();
    screen.on('display-metrics-changed', refit);
    screen.on('display-added', refit);
    screen.on('display-removed', refit);
  });

  // closing the app window keeps the wallpaper (and reminders) running in the tray
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    if (wall && host && win32) {
      win32.unembed(win32.hwndOf(wall.getNativeWindowHandle()));
      win32.refreshWallpaper();
    }
  });
}
