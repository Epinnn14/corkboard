/**
 * Ready-made boards. Layouts are written in fractions of the cork so the same
 * template works on a landscape (desktop) and a portrait (phone) board.
 */
import { type Board, BOARD_SIZE, createNote, type NoteKind, type Orientation, type Surface, type Tape } from './board';
import { createBoard } from './workspace';

export type TemplateId = 'blank' | 'week' | 'kanban' | 'study' | 'mood' | 'brainstorm';

export interface Template {
  id: TemplateId;
  name: string;
  blurb: string;
  emoji: string;
  surface: Surface;
}

export const TEMPLATES: readonly Template[] = [
  { id: 'blank', name: 'Blank board', blurb: 'Start from bare cork', emoji: '🪵', surface: 'cork' },
  { id: 'week', name: 'Weekly planner', blurb: 'A card for every day', emoji: '🗓️', surface: 'cork' },
  { id: 'kanban', name: 'Kanban', blurb: 'To do → Doing → Done', emoji: '✅', surface: 'felt' },
  { id: 'study', name: 'Study plan', blurb: 'Topics, schedule, breaks', emoji: '📚', surface: 'paper' },
  { id: 'mood', name: 'Moodboard', blurb: 'Photos, colours, vibes', emoji: '🌈', surface: 'blush' },
  { id: 'brainstorm', name: 'Brainstorm', blurb: 'One idea, many notes', emoji: '💡', surface: 'cork' },
];

type Put = (kind: NoteKind, fx: number, fy: number, text?: string, opts?: { color?: string; tape?: Tape }) => void;

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function grid(n: number, cols: number, top: number, bottom: number): [number, number][] {
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => [
    (i % cols + 0.5) / cols,
    top + ((Math.floor(i / cols) + 0.5) / rows) * (bottom - top),
  ]);
}

const LAYOUTS: Record<Exclude<TemplateId, 'blank'>, (put: Put, o: Orientation) => void> = {
  week(put, o) {
    const cols = o === 'landscape' ? 4 : 2;
    const cells = grid(8, cols, 0.04, 0.98);
    DAYS.forEach((d, i) => put('index', cells[i][0], cells[i][1], `${d}\n`));
    put('sticky', cells[7][0], cells[7][1], 'This week’s one big goal:\n\n', { color: '#fff27a' });
    put('sticker', o === 'landscape' ? 0.96 : 0.93, 0.06, '✨');
  },
  kanban(put, o) {
    const xs = [1 / 6, 3 / 6, 5 / 6];
    const head = o === 'landscape' ? 'sticky' : 'sticky';
    ['TO DO', 'DOING', 'DONE'].forEach((t, i) => put(head, xs[i], 0.13, t, { color: ['#ffb3c7', '#ffe0a3', '#b9f2a1'][i], tape: 'kraft' }));
    put('sticky', xs[0], 0.42, 'Write the report intro', { color: '#fff27a' });
    put('sticky', xs[0], 0.7, 'Book the meeting room', { color: '#a8dcff' });
    put('sticky', xs[1], 0.42, 'Slides for Thursday', { color: '#d7c2ff' });
    put('sticky', xs[2], 0.42, 'Send invoice ✔', { color: '#9eeadf' });
    put('sticker', xs[2], 0.72, '🏆');
  },
  study(put, o) {
    const l = o === 'landscape';
    put('card', l ? 0.17 : 0.3, l ? 0.18 : 0.1, 'EXAM: Calculus II\n📅 in 12 days\nRoom B-204, 09:00');
    put('lined', l ? 0.17 : 0.27, l ? 0.66 : 0.4, 'Topics to review\n\n☐ integrals\n☐ series\n☐ diff. equations\n☐ past papers');
    put('index', l ? 0.5 : 0.72, l ? 0.2 : 0.12, 'SCHEDULE\nMon  ch. 4\nWed  ch. 5\nFri  mock test');
    put('sticky', l ? 0.47 : 0.75, l ? 0.62 : 0.4, 'Pomodoro\n25 min focus\n5 min break', { color: '#ff9f80' });
    put('polaroid', l ? 0.8 : 0.7, l ? 0.36 : 0.68, 'study buddy');
    put('sticky', l ? 0.8 : 0.3, l ? 0.8 : 0.72, 'Ask the TA about Q7', { color: '#b4c8ff' });
    put('sticker', l ? 0.64 : 0.88, l ? 0.88 : 0.9, '📚');
    put('sticker', l ? 0.93 : 0.12, l ? 0.1 : 0.9, '☕');
  },
  mood(put, o) {
    const l = o === 'landscape';
    const pics = l ? [[0.16, 0.3], [0.4, 0.26], [0.64, 0.33], [0.86, 0.28]] : [[0.27, 0.18], [0.73, 0.2], [0.27, 0.55], [0.73, 0.57]];
    const tapes: Tape[] = ['pink-stripes', 'mint-dots', 'lilac-check', 'sun-grid'];
    pics.forEach(([x, y], i) => put('polaroid', x, y, ['golden hour', 'that café', 'outfit idea', 'trip ✈️'][i], { tape: tapes[i] }));
    const words = l ? [[0.2, 0.78], [0.5, 0.74], [0.8, 0.8]] : [[0.25, 0.86], [0.7, 0.88], [0.5, 0.75]];
    ['soft', 'slow mornings', 'more film photos'].forEach((t, i) =>
      put('sticky', words[i][0], words[i][1], t, { color: ['#f6a6e0', '#e6f59a', '#b4c8ff'][i], tape: tapes[(i + 1) % 4] }),
    );
    put('sticker', l ? 0.95 : 0.9, l ? 0.08 : 0.05, '🌈');
    put('sticker', l ? 0.05 : 0.1, l ? 0.92 : 0.97, '🫶');
  },
  brainstorm(put, o) {
    const l = o === 'landscape';
    put('card', 0.5, 0.5, 'BIG QUESTION\nHow might we …?');
    const ring = l ? 0.36 : 0.32;
    const colors = ['#fff27a', '#ffb3c7', '#a8dcff', '#b9f2a1', '#ffcb80', '#d7c2ff'];
    colors.forEach((c, i) => {
      const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
      put('sticky', 0.5 + Math.cos(a) * ring * (l ? 1 : 1.2), 0.5 + Math.sin(a) * ring * (l ? 1.1 : 0.75), '', { color: c });
    });
    put('sticker', 0.62, 0.36, '💡');
  },
};

export function buildTemplate(
  id: TemplateId,
  boards: readonly Board[],
  orientation: Orientation,
  rnd: () => number = Math.random,
): Board {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  let board: Board = { ...createBoard(boards, orientation, t.id === 'blank' ? undefined : t.name), surface: t.surface };
  if (t.id === 'blank') return board;
  const size = BOARD_SIZE[orientation];
  const put: Put = (kind, fx, fy, text = '', opts = {}) => {
    const note = createNote(kind, board, { at: { x: fx * size.w, y: fy * size.h }, text, rnd, ...opts });
    board = { ...board, notes: [...board.notes, note] };
  };
  LAYOUTS[t.id](put, orientation);
  return board;
}
