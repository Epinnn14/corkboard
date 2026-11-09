/**
 * Reading and writing files in the browser. Heavy libraries (pdf.js, mammoth,
 * docx, jsPDF) are loaded only when someone actually imports or exports.
 */
import type { Board, Orientation } from './board';
import {
  boardsToMarkdown,
  boardsToText,
  chunksToBoards,
  csvToChunks,
  fileStem,
  markdownToChunks,
  readingOrder,
  textToChunks,
} from './convert';
import { fileToDataUrl } from './image';
import { parseWorkspace, type Workspace } from './workspace';

export const IMPORT_ACCEPT = [
  '.txt', '.text', '.md', '.markdown', '.csv', '.pdf', '.docx', '.html', '.htm', '.json',
  'image/*', 'text/plain', 'text/markdown', 'text/csv', 'application/pdf', 'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

export type ImportResult =
  | { type: 'boards'; boards: Board[] }
  | { type: 'workspace'; workspace: Workspace }
  | { type: 'image'; name: string; dataUrl: string }
  | { type: 'error'; message: string };

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

export async function readImport(file: File, orientation: Orientation, existing: readonly Board[]): Promise<ImportResult> {
  const e = ext(file.name);
  const stem = fileStem(file.name);
  const boards = (chunks: ReturnType<typeof textToChunks>, title = stem): ImportResult =>
    chunks.length
      ? { type: 'boards', boards: chunksToBoards(title, chunks, orientation, existing) }
      : { type: 'error', message: `${file.name} has no text to pin` };
  try {
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'].includes(e)) {
      return { type: 'image', name: stem, dataUrl: await fileToDataUrl(file) };
    }
    if (e === 'json') {
      const r = parseWorkspace(JSON.parse(await file.text()));
      return r.ok ? { type: 'workspace', workspace: r.workspace } : { type: 'error', message: `${file.name}: ${r.error}` };
    }
    if (e === 'md' || e === 'markdown') {
      const { title, chunks } = markdownToChunks(await file.text());
      return boards(chunks, title ?? stem);
    }
    if (e === 'csv') return boards(csvToChunks(await file.text()));
    if (e === 'html' || e === 'htm') return boards(textToChunks(htmlToText(await file.text())));
    if (e === 'pdf') return boards(textToChunks(await pdfText(await file.arrayBuffer())));
    if (e === 'docx') return boards(textToChunks(await docxText(await file.arrayBuffer())));
    if (e === 'doc') return { type: 'error', message: `${file.name}: old .doc files aren't supported — save it as .docx first` };
    if (e === 'txt' || e === 'text' || file.type.startsWith('text/')) return boards(textToChunks(await file.text()));
    return {
      type: 'error',
      message: `Can't read .${e} files. Try .txt, .md, .csv, .pdf, .docx, images or a corkboard .json`,
    };
  } catch (err) {
    return { type: 'error', message: `${file.name} could not be read (${(err as Error).message || 'unknown error'})` };
  }
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  doc.querySelectorAll('p,div,section,article,h1,h2,h3,h4,h5,h6,li,tr,br,blockquote').forEach((n) => {
    n.append(n.tagName === 'LI' || n.tagName === 'BR' ? '\n' : '\n\n');
    if (n.tagName === 'LI') n.prepend('- ');
  });
  return (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n');
}

export async function docxText(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  } catch (e) {
    // the Node build of mammoth (used by the tests) wants a Buffer instead
    const NodeBuffer = (globalThis as { Buffer?: { from(b: ArrayBuffer): unknown } }).Buffer;
    if (!NodeBuffer) throw e;
    return (await mammoth.extractRawText({ buffer: NodeBuffer.from(buf) } as never)).value;
  }
}

let pdfWorkerUrl: string | undefined;

/** Text of a PDF, with blank lines where the vertical gap suggests a new paragraph. */
export async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorkerUrl) {
    // a blob: worker works everywhere this app runs, including sandboxed previews
    const src = (await import('pdfjs-dist/build/pdf.worker.min.mjs?raw')).default;
    pdfWorkerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  }
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let out = '';
    let lastY: number | null = null;
    let lastH = 12;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      const h = item.height || lastH;
      if (lastY !== null && Math.abs(lastY - y) > h * 1.9 && !out.endsWith('\n\n')) out = `${out.trimEnd()}\n\n`;
      out += item.str + (item.hasEOL ? '\n' : '');
      lastY = y;
      lastH = h;
    }
    pages.push(out.trim());
  }
  await doc.cleanup?.();
  return pages.join('\n\n');
}

// ------------------------------------------------------------------ export

export type ExportFormat = 'docx' | 'pdf' | 'txt' | 'md' | 'json';

export const EXPORTS: { id: ExportFormat; label: string; hint: string; icon: string }[] = [
  { id: 'docx', label: 'Word', hint: 'every note, with photos (.docx)', icon: '📝' },
  { id: 'pdf', label: 'PDF', hint: 'a page per board + all text (.pdf)', icon: '📕' },
  { id: 'txt', label: 'Text', hint: 'plain list of notes (.txt)', icon: '📃' },
  { id: 'md', label: 'Markdown', hint: 'for Notion, Obsidian, GitHub (.md)', icon: '🧾' },
  { id: 'json', label: 'Backup', hint: 'everything, re-importable (.json)', icon: '💾' },
];

export function textBlob(text: string, type = 'text/plain') {
  return new Blob([text], { type: `${type};charset=utf-8` });
}

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = url;
  });
}

/** Word document: a heading per board, sticky notes as shaded boxes, photos embedded. */
export async function boardsToDocx(boards: readonly Board[]): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = await import('docx');
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('corkboard')] }),
  ];
  for (const b of boards) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.title)] }));
    if (!b.notes.length) children.push(new Paragraph({ children: [new TextRun({ text: '(empty board)', italics: true })] }));
    for (const n of readingOrder(b.notes)) {
      if (n.kind === 'polaroid' && n.image?.startsWith('data:image/jpeg')) {
        const { w, h } = await imageSize(n.image);
        const width = 260;
        children.push(
          new Paragraph({
            children: [
              new ImageRun({ type: 'jpg', data: dataUrlBytes(n.image), transformation: { width, height: Math.round((width * h) / w) } }),
            ],
          }),
        );
      }
      if (n.kind === 'sticker') {
        children.push(new Paragraph({ children: [new TextRun({ text: n.text, size: 48 })] }));
        continue;
      }
      const lines = (n.text || (n.kind === 'polaroid' ? '' : ' ')).split('\n');
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          alignment: n.kind === 'polaroid' ? AlignmentType.LEFT : undefined,
          shading: n.kind === 'sticky' || n.kind === 'card' ? { type: 'clear', fill: n.color.slice(1), color: 'auto' } : undefined,
          children: lines.map((l, i) => new TextRun({ text: l, break: i > 0 ? 1 : 0, italics: n.kind === 'polaroid' })),
        }),
      );
    }
  }
  const doc = new Document({ creator: 'corkboard', title: 'corkboard export', sections: [{ children }] });
  return Packer.toBlob(doc);
}

/**
 * PDF: one page with a picture of each board (`renderBoard` gives a JPEG/PNG data URL),
 * then the text of every note so it can be searched and copied.
 */
export async function boardsToPdf(
  boards: readonly Board[],
  renderBoard: (b: Board) => Promise<string | null>,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true });
  let first = true;
  for (const b of boards) {
    const orient = b.orientation === 'portrait' ? 'portrait' : 'landscape';
    if (!first) pdf.addPage('a4', orient);
    else if (orient === 'portrait') {
      pdf.deletePage(1);
      pdf.addPage('a4', 'portrait');
    }
    first = false;
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(b.title, 36, 44);
    const img = await renderBoard(b);
    if (img) {
      const { w, h } = await imageSize(img);
      const scale = Math.min((pw - 72) / w, (ph - 96) / h);
      pdf.addImage(img, img.startsWith('data:image/png') ? 'PNG' : 'JPEG', (pw - w * scale) / 2, 62, w * scale, h * scale);
    }
  }
  // text pages (Helvetica can't draw emoji, so they're dropped here)
  pdf.addPage('a4', 'portrait');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  let y = 56;
  const line = (text: string, size: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    for (const l of pdf.splitTextToSize(text, pw - 96) as string[]) {
      if (y > ph - 48) {
        pdf.addPage('a4', 'portrait');
        y = 56;
      }
      pdf.text(l, 48, y);
      y += size * 1.35;
    }
  };
  const ascii = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').trim();
  for (const b of boards) {
    line(ascii(b.title), 16, true);
    y += 4;
    for (const n of readingOrder(b.notes)) {
      const t = ascii(n.kind === 'polaroid' ? `[photo] ${n.text}` : n.text);
      if (t) line(`• ${t}`, 11);
    }
    y += 14;
  }
  return pdf.output('blob');
}

export { boardsToMarkdown, boardsToText };
