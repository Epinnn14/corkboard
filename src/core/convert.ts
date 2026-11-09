/**
 * Turning plain text into notes (import) and notes into text (export).
 * Pure functions — the file readers and writers live in io.ts.
 */
import {
  type Board,
  BOARD_SIZE,
  createNote,
  KIND_LABEL,
  type Note,
  type NoteKind,
  type Orientation,
  STICKY_COLORS,
} from './board';
import { createBoard } from './workspace';

export interface Chunk {
  kind: NoteKind;
  text: string;
}

const BULLET = /^\s*(?:[-*•▪◦·–]|\d+[.)]|\[[ xX]\]|☐|☑|✔)\s+/;
const MAX_CHARS = 2000;
const SHORT = 140;
const MEDIUM = 420;

function kindFor(text: string): NoteKind {
  if (text.length <= SHORT) return 'sticky';
  if (text.length <= MEDIUM) return 'index';
  return 'lined';
}

/** Break a long passage at sentence ends so each piece fits on a lined page. */
export function splitLong(text: string, limit = 700): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?。]+[.!?。]+["')\]]*\s*|[^.!?。]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > limit && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > limit) {
      for (let i = 0; i < s.length; i += limit) out.push(s.slice(i, i + limit).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Plain text → chunks. Blank lines separate notes; a block made of bullet
 * lines becomes one sticky per bullet; long paragraphs become lined paper.
 */
export function textToChunks(raw: string): Chunk[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n');
  const blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => BULLET.test(l));
    if (lines.length > 1 && bullets.length >= Math.ceil(lines.length * 0.6)) {
      // a heading line followed by bullets becomes an index card title
      const [first, ...rest] = lines;
      if (!BULLET.test(first)) chunks.push({ kind: 'index', text: first.toUpperCase() });
      for (const l of BULLET.test(first) ? lines : rest) {
        const t = l.replace(BULLET, '').trim();
        if (t) chunks.push({ kind: kindFor(t), text: t.slice(0, MAX_CHARS) });
      }
      continue;
    }
    // keep short multi-line blocks (addresses, lists without markers) together
    const joined = lines.length <= 6 && block.length <= MEDIUM ? lines.join('\n') : lines.join(' ');
    for (const piece of splitLong(joined)) chunks.push({ kind: kindFor(piece), text: piece });
  }
  return chunks;
}

const HEADING = '\u2063§'; // invisible marker so headings survive paragraph splitting

/** Markdown → chunks: `#` sets the board title, `##`/`###` become index-card headings. */
export function markdownToChunks(md: string): { title?: string; chunks: Chunk[] } {
  let title: string | undefined;
  const cleaned = md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .split('\n')
    .map((line) => {
      const h1 = line.match(/^#\s+(.+)/);
      if (h1 && !title) {
        title = h1[1].trim();
        return '';
      }
      const h = line.match(/^#{1,6}\s+(.+)/);
      if (h) return `\n${HEADING}${h[1].trim().toUpperCase()}\n`;
      return line
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(^|[^*])\*(?!\s)([^*]+)\*/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^>\s?/, '');
    })
    .join('\n');
  const chunks = textToChunks(cleaned).map((c) =>
    c.text.includes(HEADING) ? { kind: 'index' as const, text: c.text.replaceAll(HEADING, '') } : c,
  );
  return { title, chunks };
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, commas/semicolons, newlines in cells). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split('\n')[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** CSV → one note per row; with a header row, cells are labelled ("Due: Friday"). */
export function csvToChunks(csv: string): Chunk[] {
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const header = rows.length > 1 && rows[0].every((c) => c.trim() && c.length < 40) ? rows[0] : null;
  return (header ? rows.slice(1) : rows).map((r) => {
    const text = r
      .map((c, i) => (header && i > 0 && c.trim() ? `${header[i].trim()}: ${c.trim()}` : c.trim()))
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_CHARS);
    return { kind: kindFor(text), text };
  });
}

const SIZE_OF: Record<NoteKind, { w: number; h: number }> = {
  sticky: { w: 210, h: 210 },
  index: { w: 320, h: 200 },
  lined: { w: 240, h: 320 },
  polaroid: { w: 230, h: 270 },
  card: { w: 300, h: 210 },
  sticker: { w: 120, h: 120 },
};

/**
 * Shelf packing: place items left→right, wrap to a new row, and start a new
 * page (board) when the board is full. Returns centre points per page.
 */
export function pack(
  sizes: { w: number; h: number }[],
  board: { w: number; h: number },
  gap = 34,
  margin = 44,
): { page: number; x: number; y: number }[] {
  const out: { page: number; x: number; y: number }[] = [];
  let page = 0;
  let x = margin;
  let y = margin;
  let rowH = 0;
  for (const s of sizes) {
    if (x + s.w > board.w - margin && x > margin) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + s.h > board.h - margin && y > margin) {
      page++;
      x = margin;
      y = margin;
      rowH = 0;
    }
    out.push({ page, x: x + s.w / 2, y: y + s.h / 2 });
    x += s.w + gap;
    rowH = Math.max(rowH, s.h);
  }
  return out;
}

/** Chunks → one or more boards (continued boards get "(2)", "(3)" …). */
export function chunksToBoards(
  title: string,
  chunks: Chunk[],
  orientation: Orientation,
  existing: readonly Board[],
  rnd: () => number = Math.random,
): Board[] {
  const size = BOARD_SIZE[orientation];
  const spots = pack(chunks.map((c) => SIZE_OF[c.kind]), size);
  const pages = Math.max(1, spots.length ? spots[spots.length - 1].page + 1 : 1);
  const boards: Board[] = [];
  for (let p = 0; p < pages; p++) {
    boards.push(createBoard([...existing, ...boards], orientation, pages > 1 ? `${title} (${p + 1})` : title));
  }
  let colour = 0;
  chunks.forEach((c, i) => {
    const b = boards[spots[i].page];
    const note = createNote(c.kind, b, {
      at: { x: spots[i].x, y: spots[i].y },
      text: c.text,
      color: c.kind === 'sticky' ? STICKY_COLORS[colour++ % STICKY_COLORS.length] : undefined,
      rnd,
    });
    b.notes.push({ ...note, rotation: Math.round((rnd() * 4 - 2) * 10) / 10 });
  });
  return boards;
}

// ------------------------------------------------------------------ export

/** Reading order: top-to-bottom in rows, left-to-right within a row. */
export function readingOrder(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const rowA = Math.floor((a.y + a.h / 2) / 160);
    const rowB = Math.floor((b.y + b.h / 2) / 160);
    return rowA - rowB || a.x - b.x;
  });
}

function noteLine(n: Note): string {
  if (n.kind === 'sticker') return n.text;
  if (n.kind === 'polaroid') return `[photo${n.text ? `: ${n.text}` : ''}]`;
  return n.text.trim();
}

export function boardsToText(boards: readonly Board[]): string {
  return boards
    .map((b) => {
      const lines = readingOrder(b.notes)
        .map(noteLine)
        .filter(Boolean)
        .map((t) => `• ${t.replace(/\n/g, '\n  ')}`);
      return [b.title.toUpperCase(), '='.repeat(Math.min(60, Math.max(3, b.title.length))), ...lines].join('\n');
    })
    .join('\n\n\n');
}

export function boardsToMarkdown(boards: readonly Board[]): string {
  const parts = boards.map((b) => {
    const items = readingOrder(b.notes)
      .filter((n) => noteLine(n))
      .map((n) => {
        const [first, ...rest] = noteLine(n).split('\n');
        const tag = n.kind === 'sticky' || n.kind === 'sticker' ? '' : ` _(${KIND_LABEL[n.kind].toLowerCase()})_`;
        return [`- ${first}${tag}`, ...rest.map((r) => `  ${r}`)].join('\n');
      });
    return [`## ${b.title}`, '', ...items].join('\n');
  });
  return [`# corkboard`, '', ...parts.flatMap((p) => [p, ''])].join('\n').trimEnd() + '\n';
}

export function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60) || 'Imported';
}
