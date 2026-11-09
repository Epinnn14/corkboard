import { describe, expect, it } from 'vitest';
import { createNote, emptyBoard } from '../src/core/board';
import { boardsToDocx, docxText, htmlToText, readImport } from '../src/core/io';

const file = (name: string, content: string | Uint8Array, type = '') => new File([content], name, { type });

describe('importing files', () => {
  it('txt, md, csv and html become boards named after the file', async () => {
    const txt = await readImport(file('groceries.txt', 'eggs\n\nrice\n\ncoffee'), 'landscape', []);
    expect(txt.type === 'boards' && txt.boards[0].title).toBe('groceries');
    expect(txt.type === 'boards' && txt.boards[0].notes.map((n) => n.text)).toEqual(['eggs', 'rice', 'coffee']);

    const md = await readImport(file('x.md', '# Exam week\n- calc\n- physics'), 'portrait', []);
    expect(md.type === 'boards' && md.boards[0]).toMatchObject({ title: 'Exam week', orientation: 'portrait' });

    const csv = await readImport(file('tasks.csv', 'Task,Due\nSlides,Fri'), 'landscape', []);
    expect(csv.type === 'boards' && csv.boards[0].notes[0].text).toBe('Slides\nDue: Fri');

    const html = await readImport(file('page.html', '<h1>Hi</h1><p>first para</p><ul><li>a</li><li>b</li></ul><script>x()</script>'), 'landscape', []);
    expect(html.type === 'boards' && html.boards[0].notes.map((n) => n.text)).toEqual(['Hi', 'first para', 'a', 'b']);
  });

  it('json backups come back as a workspace', async () => {
    const ws = { version: 2, boards: [emptyBoard()], camera: null };
    const r = await readImport(file('backup.json', JSON.stringify(ws)), 'landscape', []);
    expect(r.type).toBe('workspace');
  });

  it('explains unsupported and empty files', async () => {
    const doc = await readImport(file('old.doc', 'x'), 'landscape', []);
    expect(doc.type === 'error' && doc.message).toMatch(/save it as \.docx/);
    const zip = await readImport(file('a.zip', 'x'), 'landscape', []);
    expect(zip.type === 'error' && zip.message).toMatch(/Can't read \.zip/);
    const empty = await readImport(file('blank.txt', '   \n\n '), 'landscape', []);
    expect(empty.type === 'error' && empty.message).toMatch(/no text/);
    const bad = await readImport(file('broken.json', '{nope'), 'landscape', []);
    expect(bad.type).toBe('error');
  });

  it('htmlToText keeps paragraphs apart', () => {
    expect(htmlToText('<p>one</p><p>two</p>').trim()).toBe('one\n\ntwo');
  });
});

describe('Word round trip', () => {
  it('exports boards to .docx and reads the same text back', async () => {
    const b = emptyBoard('landscape', { x: 0, y: 0 }, 'Sprint 12');
    b.notes = [
      { ...createNote('index', b, { at: { x: 200, y: 200 } }), text: 'TO DO\nwrite intro' },
      { ...createNote('sticky', b, { at: { x: 700, y: 200 } }), text: 'Book room', color: '#ffb3c7' },
      { ...createNote('sticker', b, { at: { x: 900, y: 600 } }), text: '🔥' },
    ];
    const blob = await boardsToDocx([b]);
    expect(blob.size).toBeGreaterThan(3000);
    const buf = await blob.arrayBuffer();
    const text = await docxText(buf);
    expect(text).toContain('Sprint 12');
    expect(text).toContain('TO DO');
    expect(text).toContain('write intro');
    expect(text).toContain('Book room');

    // and importing that .docx makes a board again
    const r = await readImport(file('sprint.docx', new Uint8Array(buf)), 'landscape', []);
    expect(r.type === 'boards' && r.boards[0].notes.some((n) => n.text.includes('Book room'))).toBe(true);
  });
});
