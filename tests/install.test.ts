import { describe, expect, it } from 'vitest';
import { detectBrowser, detectDevice, installGuide } from '../src/core/install';

const UA = {
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('install', () => {
  it('detects device and browser', () => {
    expect([detectDevice(UA.winEdge), detectBrowser(UA.winEdge)]).toEqual(['desktop', 'edge']);
    expect([detectDevice(UA.winChrome), detectBrowser(UA.winChrome)]).toEqual(['desktop', 'chrome']);
    expect(detectBrowser(UA.winFirefox)).toBe('firefox');
    expect([detectDevice(UA.android), detectBrowser(UA.android)]).toEqual(['android', 'chrome']);
    expect(detectBrowser(UA.samsung)).toBe('samsung');
    expect([detectDevice(UA.iphone), detectBrowser(UA.iphone)]).toEqual(['ios', 'safari']);
    expect(detectBrowser(UA.iphoneChrome)).toBe('chrome');
    expect(detectDevice(UA.ipad, 0)).toBe('desktop');
    expect(detectDevice(UA.ipad, 5)).toBe('ios'); // iPadOS pretends to be a Mac
  });

  it('gives one-click where the browser supports it, steps everywhere else', () => {
    expect(installGuide('desktop', 'edge').oneClick).toBe(true);
    expect(installGuide('android', 'chrome').oneClick).toBe(true);
    const ios = installGuide('ios', 'safari');
    expect(ios.oneClick).toBe(false);
    expect(ios.steps.join(' ')).toContain('Add to Home Screen');
    expect(installGuide('ios', 'chrome').note).toMatch(/Safari/);
    expect(installGuide('desktop', 'firefox').steps.join(' ')).toMatch(/Chrome or Edge/);
  });
});
