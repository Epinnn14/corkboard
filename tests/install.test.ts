import { describe, expect, it } from 'vitest';
import { browserGuide, detectBrowser, detectDevice, installGuide, isIpad, platformFromHash } from '../src/core/install';

const UA = {
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('install', () => {
  it('detects device and browser', () => {
    expect([detectDevice(UA.winEdge), detectBrowser(UA.winEdge)]).toEqual(['windows', 'edge']);
    expect([detectDevice(UA.winChrome), detectBrowser(UA.winChrome)]).toEqual(['windows', 'chrome']);
    expect(detectDevice(UA.mac)).toBe('mac');
    expect(detectDevice(UA.chromebook)).toBe('other');
    expect(detectBrowser(UA.winFirefox)).toBe('firefox');
    expect([detectDevice(UA.android), detectBrowser(UA.android)]).toEqual(['android', 'chrome']);
    expect(detectBrowser(UA.samsung)).toBe('samsung');
    expect([detectDevice(UA.iphone), detectBrowser(UA.iphone)]).toEqual(['ios', 'safari']);
    expect(detectBrowser(UA.iphoneChrome)).toBe('chrome');
    expect(detectDevice(UA.ipad, 0)).toBe('mac');
    expect(detectDevice(UA.ipad, 5)).toBe('ios'); // iPadOS pretends to be a Mac
  });

  it('gives one-click where the browser supports it, steps everywhere else', () => {
    expect(browserGuide('edge').oneClick).toBe(true);
    expect(installGuide('other', 'chrome').oneClick).toBe(true);
    expect(installGuide('android', 'chrome').oneClick).toBe(true);
    const ios = installGuide('ios', 'safari');
    expect(ios.oneClick).toBe(false);
    expect(ios.steps.join(' ')).toContain('Add to Home Screen');
    expect(installGuide('ios', 'chrome').steps[0]).toMatch(/Share .* address bar/);
    expect(installGuide('other', 'firefox').steps.join(' ')).toMatch(/Chrome or Edge/);
    expect(browserGuide('firefox', 'mac').steps.join(' ')).toMatch(/download/);
  });

  it('has its own download for Windows and Mac, and the right Share button on iPad', () => {
    expect(installGuide('windows', 'edge').download?.href).toMatch(/corkboard\.exe$/);
    expect(installGuide('mac', 'safari').download?.href).toMatch(/corkboard-mac\.dmg$/);
    expect(installGuide('mac', 'safari').steps.join(' ')).toMatch(/Applications/);
    expect(installGuide('ios', 'safari').steps[0]).toMatch(/^iPad: .*top right/);
    expect(installGuide('ios', 'safari', { ipad: true }).steps[0]).toMatch(/^Tap the Share .*top right.*not the ≡ menu/);
    expect(installGuide('ios', 'safari', { ipad: true }).point).toBe('top-right');
    expect(installGuide('ios', 'safari', { ipad: false }).steps[0]).toMatch(/⋯ at the bottom right/);
    expect(isIpad(UA.ipad, 5)).toBe(true);
    expect(isIpad(UA.iphone, 5)).toBe(false);
    expect(installGuide('android', 'chrome').download).toBeUndefined();
  });

  it('has steps for every browser on phones, tablets and laptops', () => {
    for (const b of ['safari', 'chrome', 'edge', 'firefox'] as const) {
      expect(installGuide('ios', b).steps.join(' ')).toMatch(/Add to Home Screen/);
      expect(installGuide('ios', b, { ipad: true }).pointLabel).toBeTruthy();
    }
    for (const b of ['chrome', 'samsung', 'edge', 'firefox', 'other'] as const) {
      expect(installGuide('android', b).steps.length).toBeGreaterThan(1);
    }
    expect(browserGuide('firefox', 'windows').steps[0]).toMatch(/web apps button/);
    expect(browserGuide('other').oneClick).toBe(true); // Opera, Brave …
  });

  it('opens on the tab a link asks for', () => {
    expect(platformFromHash('#install=mac')).toBe('mac');
    expect(platformFromHash('#install=ios')).toBe('ios');
    expect(platformFromHash('#install=linux')).toBeNull();
    expect(platformFromHash('#install')).toBeNull();
  });
});
