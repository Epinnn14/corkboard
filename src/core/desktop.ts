/**
 * Bridge to the corkboard Windows app (Electron, see /desktop). In the browser
 * it is absent and corkboard behaves like the website / installed web app.
 */
export interface DesktopSettings {
  /** show the widget on the desktop */
  widget: boolean;
  /** keep the widget above other windows */
  onTop: boolean;
  /** start corkboard with Windows */
  startup: boolean;
}

export interface DesktopBridge {
  /** this window is the desktop widget */
  widget: boolean;
  /** open (or focus) the full corkboard window: 'desk' opens the widget settings there, 'note:<id>' shows that note */
  openApp(view?: 'desk' | `note:${string}`): void;
  /** fit the widget window to its content */
  resizeWidget(w: number, h: number): void;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  onSettings(cb: (s: DesktopSettings) => void): void;
}

export function desktop(): DesktopBridge | null {
  return (window as Window & { corkboardDesktop?: DesktopBridge }).corkboardDesktop ?? null;
}

/** The Windows installer (GitHub Releases, built by .github/workflows/desktop.yml). */
export const WINDOWS_DOWNLOAD = 'https://github.com/Epinnn14/corkboard/releases/latest/download/corkboard.exe';
