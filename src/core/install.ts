/** Which device / browser we are on, to show the right install steps. */
export type Device = 'ios' | 'android' | 'desktop';
export type Browser = 'chrome' | 'edge' | 'samsung' | 'safari' | 'firefox' | 'other';

export function detectDevice(ua: string, touchPoints = 0): Device {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac with a touch screen
  if (/Macintosh/i.test(ua) && touchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function detectBrowser(ua: string): Browser {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'edge';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS|Chromium/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

export interface InstallGuide {
  /** true when the browser can show its own one-click install dialog */
  oneClick: boolean;
  steps: string[];
  /** a hint shown under the steps, e.g. "open this page in Chrome instead" */
  note?: string;
}

/** Manual steps, used when the browser has no install dialog to trigger (iPhone, Firefox …). */
export function installGuide(device: Device, browser: Browser): InstallGuide {
  if (device === 'ios') {
    return {
      oneClick: false,
      steps: [
        'Tap the Share button (the square with an arrow ↑) at the bottom of Safari',
        'Scroll down and tap “Add to Home Screen”',
        'Tap “Add”: corkboard is now an app on your home screen',
      ],
      note: browser === 'safari' ? undefined : 'On iPhone and iPad, Chrome and Edge also have Share → Add to Home Screen. If you don’t see it, open this page in Safari.',
    };
  }
  if (device === 'android') {
    if (browser === 'firefox') {
      return {
        oneClick: false,
        steps: ['Tap the ⋮ menu', 'Tap “Install” (or “Add to Home screen”)', 'Confirm with “Add”'],
      };
    }
    if (browser === 'samsung') {
      return {
        oneClick: true,
        steps: ['Tap the ≡ menu', 'Tap “Add page to” → “Home screen”', 'Confirm with “Add”'],
      };
    }
    return {
      oneClick: true,
      steps: ['Tap the ⋮ menu at the top right', 'Tap “Install app” (or “Add to Home screen”)', 'Confirm with “Install”'],
    };
  }
  if (browser === 'edge') {
    return {
      oneClick: true,
      steps: ['Click the ⋯ menu', 'Apps → “Install corkboard”', 'Click “Install”: it opens in its own window and lands in the Start menu'],
    };
  }
  if (browser === 'chrome') {
    return {
      oneClick: true,
      steps: ['Click the install icon (a screen with ↓) at the right of the address bar, or ⋮ menu → “Cast, save and share” → “Install page as app”', 'Click “Install”: it opens in its own window and lands in the Start menu / Dock'],
    };
  }
  if (browser === 'safari') {
    return {
      oneClick: false,
      steps: ['In the menu bar, choose File → “Add to Dock”', 'Click “Add”: corkboard opens like any Mac app'],
    };
  }
  return {
    oneClick: false,
    steps: ['This browser can’t install web apps.', 'Open this page in Chrome or Edge and press Install.'],
    note: 'Firefox on a laptop works fine for using corkboard, it just can’t install it as an app.',
  };
}

/** Already running as an installed app? */
export function isInstalled(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches ||
    win.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
