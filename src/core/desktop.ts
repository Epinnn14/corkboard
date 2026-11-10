/**
 * Bridge to the corkboard desktop app for Windows and Mac (Electron, see /desktop). In the browser
 * it is absent and corkboard behaves like the website / installed web app.
 */
export interface DesktopSettings {
  /** show the widget on the desktop */
  widget: boolean;
  /** keep the widget above other windows */
  onTop: boolean;
  /** start corkboard when the computer starts (Windows startup apps, Mac login items) */
  startup: boolean;
}

export interface DesktopBridge {
  /** this window is the desktop widget */
  widget: boolean;
  /** 'win32' or 'darwin' (older builds leave it out: Windows) */
  platform?: string;
  /** open (or focus) the full corkboard window: 'desk' opens the widget settings there, 'note:<id>' shows that note */
  openApp(view?: 'desk' | `note:${string}`): void;
  /** size the widget window (it stays anchored at its top-right corner) */
  resizeWidget(w: number, h: number): void;
  /** turn the widget on and bring it to the top-right corner of the screen */
  showWidget(): void;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  onSettings(cb: (s: DesktopSettings) => void): void;
}

export function desktop(): DesktopBridge | null {
  return (window as Window & { corkboardDesktop?: DesktopBridge }).corkboardDesktop ?? null;
}

/** The installers on GitHub Releases, built by .github/workflows/desktop.yml. */
export const WINDOWS_DOWNLOAD = 'https://github.com/Epinnn14/corkboard/releases/latest/download/corkboard.exe';
export const MAC_DOWNLOAD = 'https://github.com/Epinnn14/corkboard/releases/latest/download/corkboard-mac.dmg';

/** What the computer is called in "Start with …" */
export function osName(bridge: DesktopBridge | null, ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): 'Windows' | 'Mac' {
  if (bridge?.platform) return bridge.platform === 'darwin' ? 'Mac' : 'Windows';
  return /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'Mac' : 'Windows';
}
