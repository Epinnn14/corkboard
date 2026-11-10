import { MAC_DOWNLOAD, WINDOWS_DOWNLOAD } from './desktop';

/**
 * Which device / browser we are on, to show the right install steps.
 * 'other' is a laptop that is neither Windows nor a Mac (Chromebook, Linux).
 */
export type Device = 'windows' | 'mac' | 'ios' | 'android' | 'other';
export type Platform = Exclude<Device, 'other'>;
export type Browser = 'chrome' | 'edge' | 'samsung' | 'safari' | 'firefox' | 'other';

export const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'ios', 'android'];

export function detectDevice(ua: string, touchPoints = 0): Device {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac with a touch screen
  if (/Macintosh/i.test(ua) && touchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

export function detectBrowser(ua: string): Browser {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'edge';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS|Chromium/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

/** `#install=mac` and the like open the install window on that tab */
export function platformFromHash(hash: string): Platform | null {
  const m = /^#install=(\w+)$/.exec(hash);
  return m && (PLATFORMS as readonly string[]).includes(m[1]) ? (m[1] as Platform) : null;
}

export interface InstallGuide {
  /** a file to download (the Windows and Mac apps) */
  download?: { href: string; label: string };
  /** true when the browser can show its own one-click install dialog */
  oneClick: boolean;
  steps: string[];
  /** a hint shown under the steps */
  note?: string;
}

/** How to get corkboard on each kind of device. */
export function installGuide(device: Device, browser: Browser): InstallGuide {
  if (device === 'windows') {
    return {
      download: { href: WINDOWS_DOWNLOAD, label: 'Download corkboard.exe' },
      oneClick: false,
      steps: [
        'Download corkboard.exe',
        'Open it: corkboard installs itself in a few seconds, starts, and puts its widget on your desktop',
        'If Windows says the publisher is unknown: “More info” → “Run anyway”',
      ],
      note: 'Runs on the laptop, no internet needed: boards are saved there and reminders pop up as Windows notifications.',
    };
  }
  if (device === 'mac') {
    return {
      download: { href: MAC_DOWNLOAD, label: 'Download corkboard for Mac' },
      oneClick: false,
      steps: [
        'Download corkboard-mac.dmg (one file for Apple silicon and Intel Macs)',
        'Open it and drag corkboard into Applications',
        'Open corkboard from Applications. The first time macOS says it can’t check the app: click “Done”, then System Settings → Privacy & Security → “Open Anyway”',
      ],
      note: 'corkboard isn’t signed by Apple, that’s why macOS asks once. After that it opens like any other app.',
    };
  }
  if (device === 'ios') {
    return {
      oneClick: false,
      steps: [
        'Open this page in Safari',
        'Tap the Share button (the square with an arrow ↑): at the bottom on iPhone, at the top right next to the address on iPad. No Share button? Tap ⋯ first',
        'Tap “Add to Home Screen” (scroll down or tap “View More” if you don’t see it)',
        'Tap “Add”: corkboard is now an app on your home screen and works offline',
      ],
      note:
        browser === 'safari'
          ? 'Apple only lets the App Store install files on iPhone and iPad, so corkboard installs from Safari instead: same icon, own window, offline.'
          : 'Chrome and Edge on iPhone and iPad also have Share → Add to Home Screen. If you don’t see it, open this page in Safari.',
    };
  }
  if (device === 'android') {
    if (browser === 'firefox') {
      return { oneClick: false, steps: ['Tap the ⋮ menu', 'Tap “Install” (or “Add to Home screen”)', 'Confirm with “Add”'] };
    }
    if (browser === 'samsung') {
      return { oneClick: true, steps: ['Tap the ≡ menu', 'Tap “Add page to” → “Home screen”', 'Confirm with “Add”'] };
    }
    return {
      oneClick: true,
      steps: ['Tap the ⋮ menu at the top right', 'Tap “Install app” (or “Add to Home screen”)', 'Confirm with “Install”'],
    };
  }
  return browserGuide(browser);
}

/** Installing the website itself as an app from a laptop browser (no download). */
export function browserGuide(browser: Browser): InstallGuide {
  if (browser === 'edge') {
    return {
      oneClick: true,
      steps: ['Click the ⋯ menu', 'Apps → “Install corkboard”', 'Click “Install”: it opens in its own window'],
    };
  }
  if (browser === 'chrome') {
    return {
      oneClick: true,
      steps: ['Click the install icon (a screen with ↓) at the right of the address bar, or ⋮ menu → “Cast, save and share” → “Install page as app”', 'Click “Install”: it opens in its own window'],
    };
  }
  if (browser === 'safari') {
    return {
      oneClick: false,
      steps: ['In the menu bar, choose File → “Add to Dock”', 'Click “Add”: corkboard opens from the Dock like an app'],
    };
  }
  return {
    oneClick: false,
    steps: ['This browser can’t install web apps.', 'Open this page in Chrome or Edge and press Install.'],
    note: 'Firefox works fine for using corkboard, it just can’t install it as an app.',
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
