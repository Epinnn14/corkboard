/**
 * The workspace: an endless canvas holding any number of boards.
 * World units are board units; the camera maps them to screen pixels:
 *   screen = world × zoom + (camera.x, camera.y)
 */
import { type Board, BOARD_SIZE, emptyBoard, type Orientation, parseBoard } from './board';

export const FRAME = 26;
export const GAP = 160;
export const MIN_ZOOM = 0.06;
export const MAX_ZOOM = 2.5;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Workspace {
  version: 2;
  boards: Board[];
  camera: Camera | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Outer size of a board including its wooden frame. */
export function outerSize(o: Orientation): Size {
  const s = BOARD_SIZE[o];
  return { w: s.w + FRAME * 2, h: s.h + FRAME * 2 };
}

export function boardRect(b: Pick<Board, 'x' | 'y' | 'orientation'>): Rect {
  return { x: b.x, y: b.y, ...outerSize(b.orientation) };
}

/** The cork area (where notes live) in world units. */
export function corkRect(b: Pick<Board, 'x' | 'y' | 'orientation'>): Rect {
  return { x: b.x + FRAME, y: b.y + FRAME, ...BOARD_SIZE[b.orientation] };
}

function intersects(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function contains(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Wide screens get landscape boards, tall ones (phones) portrait. */
export function autoOrientation(viewport: Size): Orientation {
  return viewport.w / Math.max(1, viewport.h) < 0.9 ? 'portrait' : 'landscape';
}

/**
 * Where a new board goes: the first free cell of a 3-column grid, scanning
 * row by row, so boards line up but never overlap ones the user moved.
 */
export function newBoardSpot(boards: readonly Board[], orientation: Orientation): { x: number; y: number } {
  if (!boards.length) return { x: 0, y: 0 };
  const cellW = outerSize('landscape').w + GAP;
  const cellH = outerSize('portrait').h + GAP;
  const size = outerSize(orientation);
  const originX = Math.min(...boards.map((b) => b.x));
  const originY = Math.min(...boards.map((b) => b.y));
  for (let i = 0; i < 10_000; i++) {
    const cand = { x: originX + (i % 3) * cellW, y: originY + Math.floor(i / 3) * cellH, ...size };
    if (!boards.some((b) => intersects(cand, boardRect(b), GAP / 2))) return { x: cand.x, y: cand.y };
  }
  return { x: originX, y: originY + boards.length * cellH };
}

export function createBoard(boards: readonly Board[], orientation: Orientation, title?: string): Board {
  const n = boards.length + 1;
  return emptyBoard(orientation, newBoardSpot(boards, orientation), title ?? (n === 1 ? 'My board' : `Board ${n}`));
}

/** Topmost board whose cork contains the world point. */
export function boardAt(boards: readonly Board[], p: { x: number; y: number }): Board | undefined {
  for (let i = boards.length - 1; i >= 0; i--) if (contains(corkRect(boards[i]), p)) return boards[i];
  return undefined;
}

export function bounds(boards: readonly Board[]): Rect | null {
  if (!boards.length) return null;
  const rects = boards.map(boardRect);
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  };
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Camera that shows `rect` centred in the viewport with some breathing room. */
export function fit(rect: Rect, viewport: Size, padding = 40, maxZoom = 1): Camera {
  const zoom = clampZoom(
    Math.min((viewport.w - padding * 2) / rect.w, (viewport.h - padding * 2) / rect.h, maxZoom),
  );
  return {
    zoom,
    x: viewport.w / 2 - (rect.x + rect.w / 2) * zoom,
    y: viewport.h / 2 - (rect.y + rect.h / 2) * zoom,
  };
}

export function toWorld(cam: Camera, p: { x: number; y: number }) {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

/** Zoom by `factor`, keeping the world point under `anchor` (screen px) still. */
export function zoomAt(cam: Camera, factor: number, anchor: { x: number; y: number }): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const w = toWorld(cam, anchor);
  return { zoom, x: anchor.x - w.x * zoom, y: anchor.y - w.y * zoom };
}

/** Area (in world units²) of a board that is visible through the camera. */
export function visibleArea(b: Board, cam: Camera, viewport: Size): number {
  const tl = toWorld(cam, { x: 0, y: 0 });
  const view = { x: tl.x, y: tl.y, w: viewport.w / cam.zoom, h: viewport.h / cam.zoom };
  const r = boardRect(b);
  const dx = Math.min(r.x + r.w, view.x + view.w) - Math.max(r.x, view.x);
  const dy = Math.min(r.y + r.h, view.y + view.h) - Math.max(r.y, view.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

// ------------------------------------------------------------- import/export

export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; error: string };

/**
 * Accepts a workspace file (version 2) or a single-board file from v1.0
 * (version 1), which becomes a one-board workspace.
 */
export function parseWorkspace(input: unknown): WorkspaceResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Not a corkboard file' };
  const raw = input as Record<string, unknown>;
  if (raw.version === 1) {
    const r = parseBoard(raw);
    return r.ok ? { ok: true, workspace: { version: 2, boards: [{ ...r.board, x: 0, y: 0 }], camera: null } } : r;
  }
  if (raw.version !== 2 || !Array.isArray(raw.boards)) return { ok: false, error: 'Unsupported file version' };
  if (raw.boards.length > 200) return { ok: false, error: 'Too many boards (max 200)' };
  const boards: Board[] = [];
  const seen = new Set<string>();
  for (const [i, b] of raw.boards.entries()) {
    const r = parseBoard({ ...(b as object), version: undefined });
    if (!r.ok) return { ok: false, error: `Board ${i + 1}: ${r.error}` };
    let board = r.board;
    if (seen.has(board.id)) board = { ...board, id: `${board.id}-${i}` };
    seen.add(board.id);
    boards.push(board);
  }
  const c = raw.camera as Record<string, unknown> | null | undefined;
  const camera =
    c && [c.x, c.y, c.zoom].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { x: c.x as number, y: c.y as number, zoom: clampZoom(c.zoom as number) }
      : null;
  return { ok: true, workspace: { version: 2, boards, camera } };
}

/** Put imported boards next to the existing ones instead of on top of them. */
export function placeImported(existing: readonly Board[], incoming: readonly Board[]): Board[] {
  const placed: Board[] = [...existing];
  const ids = new Set(existing.map((b) => b.id));
  const out: Board[] = [];
  for (const b of incoming) {
    const spot = newBoardSpot(placed, b.orientation);
    const id = ids.has(b.id) ? `${b.id}-${Math.floor(Math.random() * 1e6).toString(36)}` : b.id;
    ids.add(id);
    const moved = { ...b, id, ...spot };
    placed.push(moved);
    out.push(moved);
  }
  return out;
}
