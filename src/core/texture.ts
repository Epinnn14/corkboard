import type { Surface } from './board';

/**
 * Board surfaces painted on a canvas and returned as PNG data URLs.
 * (Plain bitmaps, unlike SVG-filter backgrounds, survive "Save as image".)
 */
const cache = new Map<Surface, string | null>();

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvas(size: number) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = c?.getContext?.('2d');
  if (!c || !ctx) return null;
  c.width = c.height = size;
  return { c, ctx };
}

function grain(ctx: CanvasRenderingContext2D, size: number, rgb: [number, number, number], amount: number, rnd: () => number) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const j = (rnd() - 0.5) * amount;
    img.data[i * 4] = rgb[0] + j;
    img.data[i * 4 + 1] = rgb[1] + j * 0.9;
    img.data[i * 4 + 2] = rgb[2] + j * 0.8;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx: CanvasRenderingContext2D, size: number, n: number, color: () => string, r: () => number, rnd: () => number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = r();
    const rot = rnd() * Math.PI;
    ctx.fillStyle = color();
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rad, rad * 0.7, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function paint(surface: Surface): string | null {
  const size = 256;
  const k = canvas(size);
  if (!k) return null;
  const { c, ctx } = k;
  const rnd = seeded(7);
  if (surface === 'cork') {
    grain(ctx, size, [199, 149, 89], 34, rnd);
    speckle(ctx, size, 1400, () => `rgba(${92 + rnd() * 30},${52 + rnd() * 20},20,${0.35 + rnd() * 0.4})`, () => 0.4 + rnd() * 1.4, rnd);
    speckle(ctx, size, 700, () => `rgba(248,${214 + rnd() * 25},${160 + rnd() * 30},${0.3 + rnd() * 0.4})`, () => 0.4 + rnd() * 1.2, rnd);
  } else if (surface === 'felt') {
    grain(ctx, size, [36, 46, 74], 22, rnd);
    // short fibres
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = rnd() * Math.PI;
      ctx.strokeStyle = rnd() > 0.5 ? 'rgba(120,140,190,0.18)' : 'rgba(10,14,28,0.25)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
      ctx.stroke();
    }
  } else if (surface === 'blush') {
    grain(ctx, size, [244, 205, 208], 14, rnd);
    // linen weave
    for (let i = 0; i < size; i += 3) {
      ctx.fillStyle = `rgba(190,120,130,${0.05 + rnd() * 0.07})`;
      ctx.fillRect(0, i, size, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`;
      ctx.fillRect(i, 0, 1, size);
    }
  } else {
    grain(ctx, size, [250, 249, 245], 6, rnd);
    ctx.fillStyle = 'rgba(70,80,110,0.28)';
    for (let x = 16; x < size; x += 32) {
      for (let y = 16; y < size; y += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return c.toDataURL('image/png');
}

export function surfaceTile(surface: Surface): string | null {
  if (!cache.has(surface)) cache.set(surface, paint(surface));
  return cache.get(surface) ?? null;
}
