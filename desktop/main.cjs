'use strict';

/**
 * corkboard for Windows and Mac: the desktop widget.
 *
 *  - the widget: a small frameless, transparent window (#widget) with the date,
 *    the time, today's reminders (tick them off on it), what's coming up and,
 *    if you like, a mini board. Drag it by its top strip; it remembers where.
 *  - the app: the full corkboard, from the Start menu, desktop, tray or widget.
 *  - the desktop board (#desktop): a pegboard with to-dos, sticky notes, a
 *    calendar, a focus timer and a journal that fills the screen *behind*
 *    every other window, like a live wallpaper. The taskbar stays visible.
 *
 * Both show the same corkboard (one storage, kept in step by the web app).
 * It lives in the tray (the menu bar on a Mac) and starts with the computer,
 * so the widget and the reminders are there all day.
 */
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB = path.join(__dirname, 'web');
const ORIGIN = 'app://corkboard/';
const PRELOAD = path.join(__dirname, 'preload.cjs');
const ICON = path.join(__dirname, 'build', 'tray.png');
const MAC = process.platform === 'darwin';
const OS = MAC ? 'Mac' : 'Windows';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// ------------------------------------------------------------- settings
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { widget: true, onTop: false, startup: true, board: false, firstRun: true, toldTray: false, bounds: null };
let settings = { ...DEFAULTS };
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('corkboard: could not save settings', e);
  }
}
/** Started by the computer at login: only the widget, no app window. */
function startedAtLogin() {
  if (process.argv.includes('--hidden')) return true;
  if (!MAC) return false;
  try {
    return !!app.getLoginItemSettings().wasOpenedAtLogin;
  } catch {
    return false;
  }
}
function applyStartup() {
  if (!app.isPackaged) return; // don't register the dev build
  app.setLoginItemSettings({ openAtLogin: settings.startup, args: ['--hidden'] });
}
const publicSettings = () => ({ widget: settings.widget, onTop: settings.onTop, startup: settings.startup, board: settings.board });
function broadcastSettings() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('cb:settings', publicSettings());
}

// ------------------------------------------------------------- the app window
let appWin = null;
function viewHash(view) {
  if (view === 'desk') return '#desk';
  if (typeof view === 'string' && /^note:[\w-]{1,64}$/.test(view)) return `#note=${view.slice(5)}`;
  return '';
}
function openApp(view) {
  const hash = viewHash(view);
  if (appWin && !appWin.isDestroyed()) {
    if (appWin.isMinimized()) appWin.restore();
    appWin.show();
    appWin.focus();
    if (hash) void appWin.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
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
  appWin.loadURL(`${ORIGIN}index.html${hash}`);
  appWin.once('ready-to-show', () => appWin.show());
  appWin.on('closed', () => {
    appWin = null;
    if ((settings.widget || settings.board) && !quitting && !settings.toldTray && Notification.isSupported()) {
      settings.toldTray = true;
      saveSettings();
      new Notification({
        title: 'corkboard is still on your desktop',
        body: MAC
          ? 'The widget stays and reminders keep ringing. Click corkboard in the Dock or the menu bar to open it again.'
          : 'The widget stays and reminders keep ringing. Click the corkboard icon by the clock to open it again.',
        icon: ICON,
      }).show();
    }
  });
  return appWin;
}

/** Links to other sites open in the browser; corkboard pop-ups stay in the app. */
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

// ------------------------------------------------------------- the widget
let widget = null;
let quitting = false;
const SIZE = { w: 360, h: 600 };

/** Where the widget goes: last place, if it's still on a screen; else top right. */
function widgetBounds(w, h) {
  const b = settings.bounds;
  if (b) {
    const d = screen.getDisplayMatching({ x: b.x, y: b.y, width: w, height: h });
    const a = d.workArea;
    const x = Math.min(Math.max(b.x, a.x), a.x + a.width - Math.min(w, a.width));
    const y = Math.min(Math.max(b.y, a.y), a.y + a.height - Math.min(h, a.height));
    return { x, y, width: w, height: h };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - w - 24, y: a.y + 24, width: w, height: h };
}

/** Top-right corner of the main screen. */
function topRight(w, h) {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - w - 24, y: a.y + 24, width: w, height: h };
}

/**
 * Show the widget. `atCorner` (pressing "Show the widget") puts it in the
 * top-right corner; at login it comes back where you left it.
 */
function createWidget(atCorner = false) {
  if (widget && !widget.isDestroyed()) {
    if (atCorner) {
      const [w, h] = widget.getSize();
      widget.setBounds(topRight(w, h));
      settings.bounds = null;
      saveSettings();
    }
    widget.showInactive();
    widget.moveTop();
    return;
  }
  if (atCorner) {
    settings.bounds = null;
    saveSettings();
  }
  widget = new BrowserWindow({
    ...widgetBounds(SIZE.w, SIZE.h),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'corkboard widget',
    icon: ICON,
    alwaysOnTop: settings.onTop,
    webPreferences: { preload: PRELOAD, additionalArguments: ['--cb-widget'], backgroundThrottling: false },
  });
  wireWindow(widget);
  widget.loadURL(`${ORIGIN}index.html#widget`);
  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('moved', () => {
    const [x, y] = widget.getPosition();
    settings.bounds = { x, y };
    saveSettings();
  });
  widget.on('closed', () => {
    widget = null;
    // closed by you (Alt+F4 and the like), not by quitting or switching it off: that's "widget off"
    if (!quitting && settings.widget) setSettings({ widget: false });
  });
}

function destroyWidget() {
  const w = widget;
  widget = null;
  if (w && !w.isDestroyed()) w.destroy();
}

// ------------------------------------------------------------- the desktop board
/*
 * A frameless window over the work area (the screen minus the taskbar) that
 * stays under every other window. On Windows it is owned by the desktop
 * (Progman), the way desktop gadgets do it: "Show desktop" (Win+D) leaves it
 * standing, and a click on it never brings it over your other windows.
 */
let board = null;

/** user32 through koffi (no compiler needed); null where it isn't there. */
let win32;
function user32() {
  if (win32 !== undefined) return win32;
  win32 = null;
  if (process.platform !== 'win32') return win32;
  try {
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    win32 = {
      FindWindowW: lib.func('intptr __stdcall FindWindowW(str16 cls, str16 name)'),
      SetWindowLongPtrW: lib.func('intptr __stdcall SetWindowLongPtrW(intptr hwnd, int index, intptr value)'),
      SetWindowPos: lib.func('bool __stdcall SetWindowPos(intptr hwnd, intptr after, int x, int y, int cx, int cy, uint flags)'),
    };
  } catch (e) {
    console.error('corkboard: no user32, the board is a normal window', e);
  }
  return win32;
}
const hwndOf = (win) => {
  const b = win.getNativeWindowHandle();
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
};
const GWLP_HWNDPARENT = -8;
const HWND_BOTTOM = 1;
const SWP_UNDER = 0x0001 | 0x0002 | 0x0010; // keep size, keep place, don't activate

function pinToDesktop(win) {
  const u = user32();
  if (!u) return;
  try {
    const progman = u.FindWindowW('Progman', null);
    if (progman) u.SetWindowLongPtrW(hwndOf(win), GWLP_HWNDPARENT, progman);
  } catch (e) {
    console.error('corkboard: could not pin the board to the desktop', e);
  }
  sendToBack(win);
}
function sendToBack(win) {
  const u = user32();
  if (!u || !win || win.isDestroyed()) return;
  try {
    u.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_UNDER);
  } catch (e) {
    console.error('corkboard: could not send the board back', e);
  }
}

function boardBounds() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x, y: a.y, width: a.width, height: a.height };
}

function createBoard() {
  if (board && !board.isDestroyed()) {
    board.showInactive();
    sendToBack(board);
    return;
  }
  board = new BrowserWindow({
    ...boardBounds(),
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'corkboard desktop board',
    icon: ICON,
    backgroundColor: '#d9a441',
    // Linux window managers keep a "desktop" window at the bottom and still let you type in it
    ...(process.platform === 'linux' ? { type: 'desktop' } : {}),
    webPreferences: { preload: PRELOAD, additionalArguments: ['--cb-board'], backgroundThrottling: false },
  });
  wireWindow(board);
  board.loadURL(`${ORIGIN}index.html#desktop`);
  board.once('ready-to-show', () => {
    board.showInactive();
    pinToDesktop(board);
  });
  // clicking or typing on it: it takes the keys but stays under your windows
  board.on('focus', () => sendToBack(board));
  // "minimise all" and the like: the board is the desktop, so it comes straight back
  board.on('minimize', () => setTimeout(() => board && !board.isDestroyed() && (board.showInactive(), sendToBack(board)), 200));
  board.on('closed', () => {
    board = null;
    if (!quitting && settings.board) setSettings({ board: false });
  });
}
function fitBoard() {
  if (board && !board.isDestroyed()) board.setBounds(boardBounds());
}
function destroyBoard() {
  const b = board;
  board = null;
  if (b && !b.isDestroyed()) b.destroy();
}

// ------------------------------------------------------------- tray
let tray = null;
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open corkboard', click: () => openApp() },
      { label: 'Customize the widget…', click: () => openApp('desk') },
      { type: 'separator' },
      { label: 'Show the widget (top right)', click: () => showWidget() },
      { label: 'Widget on the desktop', type: 'checkbox', checked: settings.widget, click: (i) => setSettings({ widget: i.checked }) },
      { label: 'Keep the widget on top', type: 'checkbox', checked: settings.onTop, click: (i) => setSettings({ onTop: i.checked }) },
      { type: 'separator' },
      { label: 'Desktop board (behind your windows)', type: 'checkbox', checked: settings.board, click: (i) => setSettings({ board: i.checked }) },
      { label: `Start with ${OS} (while the widget or board is on)`, type: 'checkbox', checked: settings.startup, click: (i) => setSettings({ startup: i.checked }) },
      { type: 'separator' },
      { label: 'Quit corkboard', click: () => app.quit() },
    ]),
  );
}
function createTray() {
  let img = nativeImage.createFromPath(ICON);
  // the Mac menu bar wants a small icon
  if (MAC && !img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('corkboard');
  // on a Mac a click opens the menu (as menu-bar icons do); on Windows it opens corkboard
  if (!MAC) tray.on('click', () => openApp());
  rebuildTray();
}

// ------------------------------------------------------------- settings from the pages
function setSettings(patch) {
  const before = { ...settings };
  if (typeof patch.widget === 'boolean') {
    settings.widget = patch.widget;
    // the widget on means corkboard starts with Windows, until you close the widget yourself
    if (typeof patch.startup !== 'boolean') settings.startup = patch.widget || settings.board;
  }
  if (typeof patch.board === 'boolean') {
    settings.board = patch.board;
    if (typeof patch.startup !== 'boolean') settings.startup = settings.board || settings.widget;
  }
  if (typeof patch.onTop === 'boolean') settings.onTop = patch.onTop;
  if (typeof patch.startup === 'boolean') settings.startup = patch.startup;
  saveSettings();
  if (settings.startup !== before.startup) applyStartup();
  if (settings.widget !== before.widget) settings.widget ? createWidget(true) : destroyWidget();
  if (settings.board !== before.board) settings.board ? createBoard() : destroyBoard();
  if (settings.onTop !== before.onTop && widget) widget.setAlwaysOnTop(settings.onTop);
  rebuildTray();
  broadcastSettings();
  return publicSettings();
}

ipcMain.handle('cb:get-settings', () => publicSettings());
ipcMain.handle('cb:set-settings', (_e, patch) => setSettings(patch ?? {}));
ipcMain.on('cb:open-app', (_e, view) => openApp(view));
ipcMain.on('cb:show-widget', () => showWidget());
/** "Desktop board" in the app: switch it on and step aside so you see it */
ipcMain.on('cb:show-board', (e) => {
  if (!settings.board) setSettings({ board: true });
  else createBoard();
  const from = BrowserWindow.fromWebContents(e.sender);
  if (from && from === appWin) appWin.minimize();
});

/** "Show the widget": switch it on if it was off, and bring it to the top-right corner. */
function showWidget() {
  if (!settings.widget) {
    setSettings({ widget: true });
    return;
  }
  createWidget(true);
}

ipcMain.on('cb:resize-widget', (e, w, h) => {
  if (!widget || e.sender !== widget.webContents) return;
  // from one sticky note (220 × 220) up to the whole screen
  const a = screen.getDisplayMatching(widget.getBounds()).workArea;
  const width = Math.round(Math.min(Math.max(Number(w) || SIZE.w, 220), a.width));
  const height = Math.round(Math.min(Math.max(Number(h) || SIZE.h, 220), a.height));
  // grow and shrink from the top-right corner, then keep it on its screen
  const [x, y] = widget.getPosition();
  const [oldW] = widget.getSize();
  const right = x + oldW;
  const nx = Math.min(Math.max(right - width, a.x), a.x + a.width - width);
  const ny = Math.min(Math.max(y, a.y), a.y + a.height - height);
  widget.setBounds({ x: nx, y: ny, width, height });
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
    if (settings.widget) createWidget();
    if (settings.board) createBoard();
    for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, fitBoard);
    if (!startedAtLogin()) openApp();
  });

  // Mac: clicking the Dock icon brings corkboard back (not the activation right at a login start)
  let readyAt = 0;
  app.on('ready', () => (readyAt = Date.now()));
  app.on('activate', () => {
    if (!app.isReady() || (startedAtLogin() && Date.now() - readyAt < 3000)) return;
    openApp();
  });

  // closing the app window keeps the widget / board (and the reminders) on the desktop, from the tray;
  // with both off as well, there's nothing left to show: corkboard closes
  app.on('window-all-closed', () => {
    if (!settings.widget && !settings.board) app.quit();
  });
  app.on('before-quit', () => (quitting = true));
}
