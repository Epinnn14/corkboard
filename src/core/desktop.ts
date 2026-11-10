/**
 * Bridge to the corkboard Windows app (Electron, see /desktop). In the browser
 * it is absent and corkboard behaves like the website / installed web app.
 */
export interface DesktopSettings {
  /** show the wallpaper board at all */
  wallpaper: boolean;
  /** 'behind': real wallpaper under the desktop icons; 'simple': a full-screen window kept at the back */
  mode: 'behind' | 'simple';
  /** start corkboard with Windows */
  startup: boolean;
  /** read-only: did the last attempt to go behind the icons work */
  embedded?: boolean;
}

export interface EditState {
  editing: boolean;
  simple: boolean;
}

export interface DesktopBridge {
  /** this window is the wallpaper */
  wall: boolean;
  version: string;
  onEditMode(cb: (s: EditState) => void): void;
  edit(): void;
  done(): void;
  openApp(): void;
  setBoardRect(r: { x: number; y: number; w: number; h: number }): void;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
}

export function desktop(): DesktopBridge | null {
  return (window as Window & { corkboardDesktop?: DesktopBridge }).corkboardDesktop ?? null;
}

/** Where the Windows installer lives (GitHub Releases, built by .github/workflows/desktop.yml). */
export const WINDOWS_DOWNLOAD = 'https://github.com/Epinnn14/corkboard/releases/latest/download/corkboard-Setup.exe';
