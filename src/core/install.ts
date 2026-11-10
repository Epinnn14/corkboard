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

/** iPadOS says it is a Mac; a touch screen gives it away */
export function isIpad(ua: string, touchPoints = 0): boolean {
  return /iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1);
}

/** Browsers to pick from on each phone / tablet (all of them can add corkboard to the home screen). */
export const PHONE_BROWSERS: Record<'ios' | 'android', { id: Browser; label: string }[]> = {
  ios: [
    { id: 'safari', label: 'Safari' },
    { id: 'chrome', label: 'Chrome' },
    { id: 'edge', label: 'Edge' },
    { id: 'firefox', label: 'Firefox' },
  ],
  android: [
    { id: 'chrome', label: 'Chrome' },
    { id: 'samsung', label: 'Samsung Internet' },
    { id: 'edge', label: 'Edge' },
    { id: 'firefox', label: 'Firefox' },
  ],
};

/** Where on the screen the button to tap is, for the arrow that points at it. */
export type Point = 'top-right' | 'bottom-right' | 'bottom';

export interface InstallGuide {
  /** a file to download (the Windows and Mac apps) */
  download?: { href: string; label: string };
  /** true when the browser can show its own one-click install dialog */
  oneClick: boolean;
  steps: string[];
  /** a hint shown under the steps */
  note?: string;
  /** where the first button to tap sits (this device only), and what it is */
  point?: Point;
  pointLabel?: string;
}

const ADD = '“Add to Home Screen” (scroll down the list, or tap “View More”, if you don’t see it)';
const FINISH = 'Leave “Open as Web App” on and tap “Add”: corkboard is now an app on your home screen and works offline';

/**
 * iPhone / iPad: Apple lets only the App Store install apps, so every browser
 * adds corkboard to the home screen through the Share sheet (iOS 16.4+ for
 * browsers other than Safari). `ipad` undefined = explain both.
 */
function iosGuide(browser: Browser, ipad?: boolean): InstallGuide {
  const note = 'Apple only lets the App Store install files on iPhone and iPad, so corkboard goes on the home screen from the browser instead: its own icon, own window, offline.';
  if (browser === 'chrome') {
    return {
      oneClick: false,
      steps: ['Tap the Share button ⬆ (a square with an arrow) at the right end of the address bar', `Tap ${ADD}`, 'Tap “Add”: corkboard is now an app on your home screen and works offline'],
      note,
      point: 'top-right',
      pointLabel: 'Share ⬆ is up here',
    };
  }
  if (browser === 'edge') {
    return {
      oneClick: false,
      steps: ['Tap the ⋯ menu (bottom of the screen on iPhone, top right on iPad)', 'Tap Share ⬆', `Tap ${ADD}`, 'Tap “Add”'],
      note,
      point: ipad ? 'top-right' : 'bottom',
      pointLabel: 'Tap ⋯ first',
    };
  }
  if (browser === 'firefox') {
    return {
      oneClick: false,
      steps: ['Tap the ≡ menu (bottom right on iPhone, top right on iPad)', 'Tap Share ⬆', `Tap ${ADD}`, 'Tap “Add”'],
      note,
      point: ipad ? 'top-right' : 'bottom-right',
      pointLabel: 'Tap ≡ first',
    };
  }
  const ipadStep = 'Tap the Share button ⬆ at the top right, just left of the + button (not the ≡ menu beside the address)';
  const iphoneStep = 'Tap ⋯ at the bottom right, then Share ⬆ (older iPhones: Share ⬆ in the middle of the bottom bar)';
  const first = ipad === undefined ? [`iPad: ${ipadStep[0].toLowerCase()}${ipadStep.slice(1)}`, `iPhone: ${iphoneStep[0].toLowerCase()}${iphoneStep.slice(1)}`] : [ipad ? ipadStep : iphoneStep];
  return {
    oneClick: false,
    steps: [
      ...first,
      `Tap ${ADD}`,
      FINISH,
    ],
    note: browser === 'safari' ? note : 'Another browser? Pick it above. Every browser on iPhone and iPad can do this on iOS 16.4 or newer; Safari always can.',
    point: ipad ? 'top-right' : 'bottom-right',
    pointLabel: ipad ? 'Share ⬆ is up here' : 'Tap ⋯, then Share',
  };
}

function androidGuide(browser: Browser): InstallGuide {
  if (browser === 'firefox') {
    return { oneClick: false, steps: ['Tap the ⋮ menu', 'Tap “Add app to Home screen” (or “Install”)', 'Confirm with “Add”'], point: 'top-right', pointLabel: 'Tap ⋮ first' };
  }
  if (browser === 'samsung') {
    return { oneClick: true, steps: ['Tap the ≡ menu at the bottom right', 'Tap “Add page to” → “Home screen”', 'Confirm with “Add”'], point: 'bottom-right', pointLabel: 'Tap ≡ first' };
  }
  if (browser === 'edge') {
    return { oneClick: true, steps: ['Tap the ⋯ menu at the bottom', 'Tap “Add to phone” (or “Install app”)', 'Confirm with “Install”'], point: 'bottom', pointLabel: 'Tap ⋯ first' };
  }
  return {
    oneClick: true,
    steps: ['Tap the ⋮ menu at the top right', 'Tap “Install app” (or “Add to Home screen”)', 'Confirm with “Install”'],
    note: browser === 'chrome' ? undefined : 'Most Android browsers (Opera, Brave, Vivaldi …) have the same “Install app” or “Add to Home screen” in their menu.',
    point: 'top-right',
    pointLabel: 'Tap ⋮ first',
  };
}

/** How to get corkboard on each kind of device. */
export function installGuide(device: Device, browser: Browser, opts: { ipad?: boolean } = {}): InstallGuide {
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
  if (device === 'ios') return iosGuide(browser, opts.ipad);
  if (device === 'android') return androidGuide(browser);
  return browserGuide(browser, device);
}

/** Installing the website itself as an app from a laptop browser (no download). */
export function browserGuide(browser: Browser, device: Device = 'windows'): InstallGuide {
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
  if (browser === 'firefox' && device === 'windows') {
    return {
      oneClick: false,
      steps: ['Click the web apps button in the address bar (Firefox 143 or newer)', 'corkboard lands on the taskbar and in the Start menu'],
    };
  }
  if (browser === 'firefox') {
    return {
      oneClick: false,
      steps: ['Firefox on this computer can’t install web apps yet.', 'Use the download above, or open this page in Chrome or Edge and install it there.'],
    };
  }
  // Opera, Brave, Vivaldi, Arc … are built on Chrome
  return {
    oneClick: true,
    steps: ['Click the install icon at the right of the address bar, or look in the browser menu for “Install corkboard” / “Install app”', 'Click “Install”: it opens in its own window'],
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
