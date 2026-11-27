import { describe, expect, it } from 'vitest';
import {
  addSticky,
  addTodo,
  clampPos,
  clockText,
  dayKey,
  editTodo,
  emptyDeskBoard,
  finishTimer,
  journalDays,
  lastWeek,
  monthGrid,
  moveWidget,
  nextTint,
  pauseTimer,
  progress,
  pruneTodos,
  raiseSticky,
  removeSticky,
  resetLayout,
  resetTimer,
  sanitizeDeskBoard,
  setJournal,
  setLength,
  setMode,
  startTimer,
  STICKY_TINTS,
  timerLeft,
  todayTodos,
  toggleTodo,
  toggleWidget,
  updateSticky,
  welcomeDeskBoard,
  widgetPos,
  DEFAULT_LAYOUT,
} from '../src/core/deskboard';

let seed = 0;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const T0 = new Date(2026, 10, 27, 9, 0).getTime();
const MIN = 60_000;

describe('to-do', () => {
  it('adds trimmed items and ignores empty ones', () => {
    let s = addTodo(emptyDeskBoard(), '  buy milk ', rnd);
    s = addTodo(s, '   ', rnd);
    expect(s.todos.map((t) => t.text)).toEqual(['buy milk']);
  });

  it('ticks with the day, and unticks', () => {
    let s = addTodo(emptyDeskBoard(), 'a', rnd);
    const id = s.todos[0].id;
    s = toggleTodo(s, id, '2026-11-27');
    expect(s.todos[0]).toMatchObject({ done: true, doneOn: '2026-11-27' });
    s = toggleTodo(s, id, '2026-11-27');
    expect(s.todos[0]).toMatchObject({ done: false, doneOn: null });
  });

  it("today's list keeps open items and today's ticks, not older ticks", () => {
    let s = emptyDeskBoard();
    for (const t of ['old', 'today', 'open']) s = addTodo(s, t, rnd);
    s = toggleTodo(s, s.todos[0].id, '2026-11-26');
    s = toggleTodo(s, s.todos[1].id, '2026-11-27');
    expect(todayTodos(s, '2026-11-27').map((t) => t.text)).toEqual(['today', 'open']);
    expect(pruneTodos(s, '2026-11-27').todos).toHaveLength(2);
  });

  it('editing to nothing removes the item', () => {
    let s = addTodo(emptyDeskBoard(), 'a', rnd);
    s = editTodo(s, s.todos[0].id, 'b');
    expect(s.todos[0].text).toBe('b');
    expect(editTodo(s, s.todos[0].id, ' ').todos).toHaveLength(0);
  });
});

describe('sticky notes', () => {
  it('adds in turn colours and keeps them on the screen', () => {
    let s = addSticky(emptyDeskBoard(), { x: 2, y: -1 }, rnd);
    s = addSticky(s, { x: 0.5, y: 0.5 }, rnd);
    expect(s.stickies[0]).toMatchObject({ x: 0.97, y: 0, color: STICKY_TINTS[0] });
    expect(s.stickies[1].color).toBe(STICKY_TINTS[1]);
    expect(Math.abs(s.stickies[0].rot)).toBeLessThanOrEqual(3);
  });

  it('moves, edits, raises and removes', () => {
    let s = addSticky(emptyDeskBoard(), { x: 0.1, y: 0.1 }, rnd);
    s = addSticky(s, { x: 0.2, y: 0.2 }, rnd);
    const [a, b] = s.stickies.map((n) => n.id);
    s = updateSticky(s, a, { x: 0.4, text: 'hi' });
    expect(s.stickies[0]).toMatchObject({ x: 0.4, y: 0.1, text: 'hi' });
    s = raiseSticky(s, a);
    expect(s.stickies.map((n) => n.id)).toEqual([b, a]);
    expect(removeSticky(s, a).stickies.map((n) => n.id)).toEqual([b]);
  });

  it('cycles colours', () => {
    expect(nextTint(STICKY_TINTS[0])).toBe(STICKY_TINTS[1]);
    expect(nextTint(STICKY_TINTS[STICKY_TINTS.length - 1])).toBe(STICKY_TINTS[0]);
    expect(nextTint('#123456')).toBe(STICKY_TINTS[0]);
  });
});

describe('layout', () => {
  it('uses the default place until a widget is moved; reset brings everything back', () => {
    let s = emptyDeskBoard();
    expect(widgetPos(s, 'todo')).toEqual(DEFAULT_LAYOUT.todo);
    s = moveWidget(s, 'todo', { x: 0.5, y: 1.4 });
    expect(widgetPos(s, 'todo')).toEqual({ x: 0.5, y: 0.97 });
    s = toggleWidget(s, 'journal');
    expect(s.hidden).toEqual(['journal']);
    expect(toggleWidget(s, 'journal').hidden).toEqual([]);
    s = resetLayout(s);
    expect(s.layout).toEqual({});
    expect(s.hidden).toEqual([]);
  });

  it('clamps nonsense positions', () => {
    expect(clampPos({ x: Number.NaN, y: 0.3 })).toEqual({ x: 0, y: 0.3 });
  });
});

describe('focus timer', () => {
  it('starts, pauses with the time left and resumes', () => {
    let s = startTimer(emptyDeskBoard(), T0);
    expect(timerLeft(s, T0 + 5 * MIN)).toBe(20 * MIN);
    s = pauseTimer(s, T0 + 5 * MIN);
    expect(s.timer.endsAt).toBeNull();
    expect(timerLeft(s, T0 + 60 * MIN)).toBe(20 * MIN);
    s = startTimer(s, T0 + 60 * MIN);
    expect(timerLeft(s, T0 + 70 * MIN)).toBe(10 * MIN);
    expect(timerLeft(s, T0 + 999 * MIN)).toBe(0);
  });

  it('a finished focus session counts on its day and lines up a break', () => {
    const s = startTimer(emptyDeskBoard(), T0);
    expect(finishTimer(s, T0 + 10 * MIN)).toBeNull();
    const f = finishTimer(s, T0 + 30 * MIN)!;
    expect(f.ended).toBe('focus');
    expect(f.state.days['2026-11-27']).toEqual({ sessions: 1, minutes: 25 });
    expect(f.state.timer).toMatchObject({ mode: 'break', endsAt: null, leftMs: 5 * MIN, streak: 1 });
  });

  it('every fourth focus session is followed by a long break, then the count starts again', () => {
    let s = emptyDeskBoard();
    let t = T0;
    const modes: string[] = [];
    for (let i = 0; i < 8; i++) {
      s = startTimer(s, t);
      t += 60 * MIN;
      s = finishTimer(s, t)!.state;
      modes.push(s.timer.mode);
    }
    expect(modes).toEqual(['break', 'focus', 'break', 'focus', 'break', 'focus', 'long', 'focus']);
    expect(s.timer.streak).toBe(0);
    expect(s.days['2026-11-27'].sessions).toBe(4);
  });

  it('modes and lengths', () => {
    let s = setMode(emptyDeskBoard(), 'long');
    expect(s.timer.leftMs).toBe(15 * MIN);
    s = setLength(s, 'long', 20);
    expect(s.timer.leftMs).toBe(20 * MIN);
    s = setLength(s, 'focus', 500);
    expect(s.lengths.focus).toBe(120);
    s = startTimer(s, T0);
    s = setLength(s, 'long', 10);
    expect(timerLeft(s, T0)).toBe(20 * MIN); // a running timer keeps going
    expect(resetTimer(s).timer.leftMs).toBe(10 * MIN);
  });

  it('shows minutes and seconds', () => {
    expect(clockText(25 * MIN)).toBe('25:00');
    expect(clockText(61_500)).toBe('01:02');
    expect(clockText(0)).toBe('00:00');
  });
});

describe('progress and journal', () => {
  it("counts the day's sessions, minutes and ticked to-dos", () => {
    let s = emptyDeskBoard();
    s = addTodo(addTodo(s, 'a', rnd), 'b', rnd);
    s = toggleTodo(s, s.todos[0].id, '2026-11-27');
    s = { ...s, days: { '2026-11-27': { sessions: 2, minutes: 50 } } };
    expect(progress(s, '2026-11-27')).toEqual({ sessions: 2, minutes: 50, tasksDone: 1, tasksTotal: 2 });
  });

  it('gives the last seven days ending today', () => {
    const s = { ...emptyDeskBoard(), days: { '2026-11-27': { sessions: 1, minutes: 25 }, '2026-11-21': { sessions: 2, minutes: 50 } } };
    const w = lastWeek(s, new Date(2026, 10, 27));
    expect(w.map((d) => d.minutes)).toEqual([50, 0, 0, 0, 0, 0, 25]);
    expect(w[6].label).toBe('F');
  });

  it('keeps an entry per day and drops empty ones', () => {
    let s = setJournal(emptyDeskBoard(), '2026-11-26', { text: 'quiet day' });
    s = setJournal(s, '2026-11-27', { mood: 4 });
    expect(journalDays(s)).toEqual(['2026-11-27', '2026-11-26']);
    expect(s.journal['2026-11-27']).toEqual({ text: '', mood: 4 });
    s = setJournal(s, '2026-11-27', { mood: null });
    expect(journalDays(s)).toEqual(['2026-11-26']);
  });
});

describe('calendar', () => {
  it('lays out November 2026 from Monday', () => {
    const g = monthGrid(2026, 10);
    expect(g[0].map((d) => d?.getDate() ?? null)).toEqual([null, null, null, null, null, null, 1]);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });

  it('day keys are local dates', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('loading', () => {
  it('survives junk', () => {
    expect(sanitizeDeskBoard(null)).toEqual(emptyDeskBoard());
    expect(sanitizeDeskBoard({ todos: 'x', stickies: [1, null], days: [], timer: 5 })).toEqual(emptyDeskBoard());
  });

  it('keeps good data and repairs the rest', () => {
    const s = sanitizeDeskBoard({
      todos: [{ id: 'a', text: 'ok', done: true, doneOn: '2026-11-27' }, { text: '' }, { id: 'c', text: 'bad day', doneOn: 'soon' }],
      stickies: [{ id: 's', text: 'n', color: 'red', x: 3, y: 0.2, rot: 40 }],
      days: { '2026-11-27': { sessions: 3, minutes: 75 }, nope: { sessions: 1 } },
      journal: { '2026-11-27': { text: 'hi', mood: 9 } },
      timer: { mode: 'long', endsAt: 'x', leftMs: 1e12, streak: 2 },
      lengths: { focus: 50, break: -3 },
      layout: { todo: { x: 0.2, y: 0.3 }, bogus: { x: 0, y: 0 } },
      hidden: ['journal', 'journal', 'nope'],
    });
    expect(s.todos).toEqual([
      { id: 'a', text: 'ok', done: true, doneOn: '2026-11-27' },
      { id: 'c', text: 'bad day', done: false, doneOn: null },
    ]);
    expect(s.stickies[0]).toMatchObject({ color: STICKY_TINTS[0], x: 0.97, rot: 8 });
    expect(Object.keys(s.days)).toEqual(['2026-11-27']);
    expect(s.journal['2026-11-27']).toEqual({ text: 'hi', mood: null });
    expect(s.timer).toEqual({ mode: 'long', endsAt: null, leftMs: 120 * MIN, streak: 2 });
    expect(s.lengths).toEqual({ focus: 50, break: 1, long: 15 });
    expect(s.layout).toEqual({ todo: { x: 0.2, y: 0.3 } });
    expect(s.hidden).toEqual(['journal']);
  });

  it('the welcome board has something to tick and two notes', () => {
    const s = welcomeDeskBoard(rnd);
    expect(s.todos).toHaveLength(3);
    expect(s.stickies).toHaveLength(2);
    expect(sanitizeDeskBoard(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
