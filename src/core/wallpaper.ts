/** Put a picture of a board onto a phone- or desktop-sized wallpaper. */
export const WALLPAPERS = {
  desktop: { w: 2560, h: 1440, label: 'desktop' },
  phone: { w: 1170, h: 2532, label: 'phone' },
} as const;
export type WallpaperKind = keyof typeof WALLPAPERS;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load board image'));
    img.src = src;
  });
}

export async function composeWallpaper(boardImage: string, kind: WallpaperKind): Promise<string> {
  const { w, h } = WALLPAPERS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  // warm wall with a soft dot grid
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f2ece2');
  g.addColorStop(1, '#e2d9ca');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(43,38,32,0.10)';
  const step = Math.round(w / 60);
  for (let x = step / 2; x < w; x += step) for (let y = step / 2; y < h; y += step) ctx.fillRect(x, y, 2, 2);

  const img = await load(boardImage);
  // phones: keep the top third free for the lock-screen clock and date, and leave
  // margins so the "perspective zoom" / parallax of the home screen doesn't crop it
  const box =
    kind === 'phone'
      ? { x: w * 0.08, y: h * 0.33, w: w * 0.84, h: h * 0.55 }
      : { x: w * 0.12, y: h * 0.1, w: w * 0.76, h: h * 0.78 };
  const s = Math.min(box.w / img.width, box.h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  const dx = box.x + (box.w - dw) / 2;
  const dy = box.y + (box.h - dh) / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = w / 40;
  ctx.shadowOffsetY = w / 120;
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas.toDataURL('image/png');
}
