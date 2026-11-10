'use strict';

/**
 * Win32 calls (through koffi) to put a window behind the desktop icons, the
 * same trick live-wallpaper apps use:
 *
 *  - Windows 10 / 11 before 24H2: ask Progman (message 0x052C) to split the
 *    desktop into icons + a WorkerW behind them, then make our window a child
 *    of that WorkerW.
 *  - Windows 11 24H2 and later: the icons (SHELLDLL_DefView) and a WorkerW
 *    both live inside Progman; our window becomes a child of Progman, placed
 *    right under the icons, and must be a layered window to be drawn.
 *
 * Every function is defensive: if Windows says no, it returns false and the
 * app falls back to a plain full-screen window kept at the back.
 */
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const POINT = koffi.struct('CB_POINT', { x: 'int32_t', y: 'int32_t' });
koffi.proto('bool __stdcall CbEnumWindowsProc(intptr_t hwnd, intptr_t lParam)');

const FindWindowW = user32.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)');
const FindWindowExW = user32.func(
  'intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *name)',
);
const SendMessageTimeoutW = user32.func(
  'intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)',
);
const EnumWindows = user32.func('bool __stdcall EnumWindows(CbEnumWindowsProc *cb, intptr_t lParam)');
const SetParent = user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)');
const GetParent = user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)');
const IsWindow = user32.func('bool __stdcall IsWindow(intptr_t hwnd)');
const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)',
);
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)');
const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)');
const SetLayeredWindowAttributes = user32.func(
  'bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)',
);
const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)');
const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int key)');
const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ CB_POINT *p)');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const GetDoubleClickTime = user32.func('uint32_t __stdcall GetDoubleClickTime()');
const SystemParametersInfoW = user32.func(
  'bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, _Inout_ uint8_t *buf, uint32_t winIni)',
);

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_VISIBLE = 0x10000000;
const WS_FRAME = 0x00c00000 | 0x00040000 | 0x00080000 | 0x00020000 | 0x00010000; // caption, thickframe, sysmenu, min, max
const WS_EX_LAYERED = 0x00080000;
const WS_EX_APPWINDOW = 0x00040000;
const WS_EX_TOOLWINDOW = 0x00000080;
const LWA_ALPHA = 0x2;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const HWND_BOTTOM = 1;
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SPI_GETDESKWALLPAPER = 0x0073;
const SPI_SETDESKWALLPAPER = 0x0014;

/** Electron's getNativeWindowHandle() buffer → HWND number */
function hwndOf(buf) {
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function className(hwnd) {
  if (!hwnd) return '';
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

/** Find where the wallpaper window goes. */
function desktopHost() {
  const progman = FindWindowW('Progman', null);
  if (!progman) return null;
  // ask Explorer to create the WorkerW layer behind the icons
  SendMessageTimeoutW(progman, 0x052c, 0xd, 0x1, 0, 1000, null);
  SendMessageTimeoutW(progman, 0x052c, 0, 0, 0, 1000, null);

  const workerInProgman = FindWindowExW(progman, 0, 'WorkerW', null);
  const iconsInProgman = FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  if (workerInProgman && iconsInProgman) {
    // Windows 11 24H2+
    return { parent: progman, below: iconsInProgman, modern: true };
  }
  let workerw = 0;
  EnumWindows((top) => {
    if (FindWindowExW(top, 0, 'SHELLDLL_DefView', null)) workerw = FindWindowExW(0, top, 'WorkerW', null);
    return true;
  }, 0);
  return workerw ? { parent: workerw, below: 0, modern: false } : null;
}

const saved = new Map(); // hwnd → original styles

/**
 * Put `hwnd` behind the desktop icons, covering `rect` (physical pixels, screen
 * coordinates). Returns the host window, or 0 when it didn't work.
 */
function embed(hwnd, rect) {
  try {
    const host = desktopHost();
    if (!host) return 0;
    if (!saved.has(hwnd)) {
      saved.set(hwnd, { style: GetWindowLongPtrW(hwnd, GWL_STYLE), ex: GetWindowLongPtrW(hwnd, GWL_EXSTYLE) });
    }
    const orig = saved.get(hwnd);
    const style = ((orig.style & ~WS_POPUP & ~WS_FRAME) | WS_CHILD | WS_VISIBLE) >>> 0;
    let ex = ((orig.ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW) >>> 0;
    if (host.modern) ex = (ex | WS_EX_LAYERED) >>> 0;
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
    if (host.modern) SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    if (!SetParent(hwnd, host.parent) && GetParent(hwnd) !== host.parent) return 0;
    // the host covers the whole virtual screen: child coordinates start at its top-left
    const vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
    const vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
    const flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED | (host.below ? 0 : SWP_NOZORDER);
    SetWindowPos(hwnd, host.below || 0, rect.x - vx, rect.y - vy, rect.width, rect.height, flags);
    return GetParent(hwnd) === host.parent ? host.parent : 0;
  } catch {
    return 0;
  }
}

/** Bring the window back as a normal top-level window (for editing). */
function unembed(hwnd) {
  try {
    const orig = saved.get(hwnd);
    SetParent(hwnd, 0);
    if (orig) {
      SetWindowLongPtrW(hwnd, GWL_STYLE, orig.style >>> 0);
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, orig.ex >>> 0);
      SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE);
    }
    return true;
  } catch {
    return false;
  }
}

/** Still a child of a living desktop host? (Explorer restarts drop us.) */
function stillEmbedded(hwnd, host) {
  try {
    return !!host && IsWindow(host) && GetParent(hwnd) === host;
  } catch {
    return false;
  }
}

/** "Simple" mode: keep a normal window behind every other window. */
function sendToBack(hwnd) {
  try {
    SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } catch {
    /* ignore */
  }
}

/** Is the desktop (not some app) the window in front? */
function desktopInFront() {
  const c = className(GetForegroundWindow());
  return c === 'Progman' || c === 'WorkerW';
}

function leftButtonDown() {
  return (GetAsyncKeyState(0x01) & 0x8000) !== 0;
}

function cursor() {
  const p = {};
  GetCursorPos(p);
  return { x: p.x, y: p.y };
}

function doubleClickTime() {
  return GetDoubleClickTime() || 500;
}

/** Repaint the normal wallpaper (after we leave, so no frozen board stays behind). */
function refreshWallpaper() {
  try {
    const buf = Buffer.alloc(1040);
    if (!SystemParametersInfoW(SPI_GETDESKWALLPAPER, 520, buf, 0)) return;
    SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, buf, 0);
  } catch {
    /* ignore */
  }
}

module.exports = {
  POINT,
  hwndOf,
  embed,
  unembed,
  stillEmbedded,
  sendToBack,
  desktopInFront,
  leftButtonDown,
  cursor,
  doubleClickTime,
  refreshWallpaper,
};
