/**
 * Procedural cork texture painted on a canvas and returned as a PNG data URL.
 * (A plain bitmap, unlike an SVG-filter background, survives "Save as image".)
 */
export function corkTile(size = 256, seed = 7): string | null {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  if (!canvas || !ctx) return null;
  canvas.width = canvas.height = size;

  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  // base tone with per-pixel grain
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const j = (rnd() - 0.5) * 34;
    img.data[i * 4] = 199 + j;
    img.data[i * 4 + 1] = 149 + j * 0.85;
    img.data[i * 4 + 2] = 89 + j * 0.6;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // granules: dark pits and light chips, drawn wrapped so the tile is seamless
  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, r, r * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (let i = 0; i < 1400; i++) {
    dot(rnd() * size, rnd() * size, 0.4 + rnd() * 1.4, `rgba(${92 + rnd() * 30},${52 + rnd() * 20},${20},${0.35 + rnd() * 0.4})`);
  }
  for (let i = 0; i < 700; i++) {
    dot(rnd() * size, rnd() * size, 0.4 + rnd() * 1.2, `rgba(248,${214 + rnd() * 25},${160 + rnd() * 30},${0.3 + rnd() * 0.4})`);
  }
  return canvas.toDataURL('image/png');
}
