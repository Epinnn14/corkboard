import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, createNote, emptyBoard } from '../src/core/board';
import {
  boardsToMarkdown,
  boardsToText,
  chunksToBoards,
  csvToChunks,
  fileStem,
  markdownToChunks,
  pack,
  parseCsv,
  readingOrder,
  splitLong,
  textToChunks,
} from '../src/core/convert';

describe('text → notes', () => {
  it('paragraphs become notes sized by length', () => {
    const long = 'This sentence is long enough. '.repeat(20);
    const chunks = textToChunks(`Buy milk\n\nCall mum about the weekend plans and the train tickets, then check the hotel booking, the dinner reservation for Saturday and who is bringing the cake this time.\n\n${long}`);
    expect(chunks.map((c) => c.kind)).toEqual(['sticky', 'index', 'lined']);
  });

  it('bullet lists become one sticky per item, with the heading as an index card', () => {
    const chunks = textToChunks('Groceries\n- eggs\n- rice\n* coffee\n\n1. first\n2) second\n[ ] third');
    expect(chunks).toEqual([
      { kind: 'index', text: 'GROCERIES' },
      { kind: 'sticky', text: 'eggs' },
      { kind: 'sticky', text: 'rice' },
      { kind: 'sticky', text: 'coffee' },
      { kind: 'sticky', text: 'first' },
      { kind: 'sticky', text: 'second' },
      { kind: 'sticky', text: 'third' },
    ]);
  });

  it('keeps short multi-line blocks together and handles Windows newlines', () => {
    const [c] = textToChunks('Room B-204\r\nMonday 09:00\r\nBring ID');
    expect(c.text).toBe('Room B-204\nMonday 09:00\nBring ID');
  });

  it('splits very long paragraphs at sentence ends', () => {
    const parts = splitLong('One. Two two. Three three three. '.repeat(40), 200);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts[0].endsWith('.')).toBe(true);
    expect(splitLong('x'.repeat(450), 200).map((p) => p.length)).toEqual([200, 200, 50]);
  });

  it('markdown: # is the title, ## headings become cards, formatting is stripped', () => {
    const { title, chunks } = markdownToChunks('# Thesis\n\n## Week 1\n- read **papers**\n- [outline](http://x)\n\n> keep it `simple`');
    expect(title).toBe('Thesis');
    expect(chunks).toEqual([
      { kind: 'index', text: 'WEEK 1' },
      { kind: 'sticky', text: 'read papers' },
      { kind: 'sticky', text: 'outline' },
      { kind: 'sticky', text: 'keep it simple' },
    ]);
  });

  it('csv: quotes, semicolons, header labels', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
    expect(parseCsv('x;y\n1;2')).toEqual([['x', 'y'], ['1', '2']]);
    expect(csvToChunks('Task,Due,Owner\nSlides,Fri,Rina\nReport,,Budi')).toEqual([
      { kind: 'sticky', text: 'Slides\nDue: Fri\nOwner: Rina' },
      { kind: 'sticky', text: 'Report\nOwner: Budi' },
    ]);
  });

  it('fileStem', () => {
    expect(fileStem('week_plan-final.docx')).toBe('week plan final');
    expect(fileStem('.txt')).toBe('Imported');
  });
});

describe('packing onto boards', () => {
  it('fills rows, then continues on new boards without overlaps or overflow', () => {
    const size = BOARD_SIZE.landscape;
    const spots = pack(Array.from({ length: 40 }, () => ({ w: 210, h: 210 })), size);
    expect(spots[0]).toEqual({ page: 0, x: 44 + 105, y: 44 + 105 });
    expect(Math.max(...spots.map((s) => s.page))).toBeGreaterThan(0);
    for (const s of spots) {
      expect(s.x + 105).toBeLessThanOrEqual(size.w);
      expect(s.y + 105).toBeLessThanOrEqual(size.h);
    }
  });

  it('chunksToBoards names continued boards and keeps every note inside', () => {
    const chunks = Array.from({ length: 30 }, (_, i) => ({ kind: 'sticky' as const, text: `note ${i}` }));
    const boards = chunksToBoards('Lecture', chunks, 'landscape', [], () => 0.5);
    expect(boards.length).toBeGreaterThan(1);
    expect(boards.map((b) => b.title)[0]).toBe('Lecture (1)');
    expect(boards.flatMap((b) => b.notes).map((n) => n.text)).toEqual(chunks.map((c) => c.text));
    expect(new Set(boards.flatMap((b) => b.notes).map((n) => n.color)).size).toBeGreaterThan(5);
    expect(chunksToBoards('Small', chunks.slice(0, 3), 'portrait', [])[0].title).toBe('Small');
  });
});

describe('notes → text', () => {
  const board = emptyBoard('landscape', { x: 0, y: 0 }, 'Week');
  const n = (kind: Parameters<typeof createNote>[0], x: number, y: number, text: string) => ({
    ...createNote(kind, board, { at: { x, y } }),
    text,
  });
  board.notes = [n('sticky', 900, 200, 'second'), n('index', 200, 200, 'first\nline 2'), n('polaroid', 300, 700, 'beach'), n('sticker', 900, 700, '🔥')];

  it('reading order is rows then columns', () => {
    expect(readingOrder(board.notes).map((x) => x.text)).toEqual(['first\nline 2', 'second', 'beach', '🔥']);
  });

  it('txt and markdown', () => {
    expect(boardsToText([board])).toBe('WEEK\n====\n• first\n  line 2\n• second\n• [photo: beach]\n• 🔥');
    const md = boardsToMarkdown([board]);
    expect(md).toContain('## Week');
    expect(md).toContain('- first _(index card)_\n  line 2');
    expect(md).toContain('- second\n');
    expect(md).toContain('- [photo: beach] _(photo)_');
  });
});
