import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import { useWorkspace } from '../src/stores/workspace';

beforeEach(() => setActivePinia(createPinia()));

function mountApp(withBoard = true) {
  const store = useWorkspace();
  store.replace({ version: 2, boards: [], camera: null });
  if (withBoard) store.addBoard('landscape');
  return { store, wrapper: mount(App, { attachTo: document.body }) };
}

describe('App', () => {
  it('adds every kind of note from the dock', async () => {
    const { store, wrapper } = mountApp();
    expect(wrapper.text()).toContain('Double-click anywhere to pin a note');
    const buttons = wrapper.findAll('nav.dock > button.add');
    for (const b of buttons) await b.trigger('click');
    expect(store.active!.notes.map((n) => n.kind)).toEqual(['sticky', 'index', 'lined', 'polaroid', 'card']);
    expect(wrapper.findAll('.note.card .pin')).toHaveLength(4);
    wrapper.unmount();
  });

  it('stickers and the colour palette add notes', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('.stickers-wrap .add').trigger('click');
    await wrapper.findAll('.stk')[1].trigger('click');
    expect(store.active!.notes[0]).toMatchObject({ kind: 'sticker', text: '🔥' });
    expect(wrapper.find('.note .sticker').text()).toBe('🔥');
    await wrapper.find('.palette-wrap .add').trigger('click');
    expect(wrapper.findAll('.dock-palette .dot')).toHaveLength(13);
    await wrapper.findAll('.dock-palette .dot')[3].trigger('click');
    expect(store.active!.notes[1]).toMatchObject({ kind: 'sticky', color: '#ff9f80' });
    wrapper.unmount();
  });

  it('+ → New board opens templates and creates the chosen board', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=new-board]').trigger('click');
    const tiles = wrapper.findAll('.template');
    expect(tiles.map((t) => t.find('.tp-name').text())).toEqual([
      'Blank board', 'Weekly planner', 'Kanban', 'Study plan', 'Moodboard', 'Brainstorm',
    ]);
    await tiles[3].trigger('click');
    expect(store.boards).toHaveLength(2);
    expect(store.active).toMatchObject({ title: 'Study plan', surface: 'paper' });
    expect(wrapper.find('.sheet').exists()).toBe(false);
    wrapper.unmount();
  });

  it('board tag: rename, change surface, delete with undo toast', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('.tab-title').setValue('Thesis');
    expect(store.active!.title).toBe('Thesis');
    await wrapper.find('.surface-dot.felt').trigger('click');
    expect(store.active!.surface).toBe('felt');
    await wrapper.find('.tab-btn.danger').trigger('click');
    expect(store.boards).toHaveLength(0);
    expect(wrapper.find('.toast').text()).toContain('“Thesis” deleted');
    await wrapper.find('.toast button').trigger('click');
    expect(store.boards).toHaveLength(1);
    wrapper.unmount();
  });

  it('note toolbar: colour palette, tape, delete', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('nav.dock > button.add').trigger('click');
    await wrapper.find('.note-tools .swatch.current').trigger('click');
    expect(wrapper.findAll('.note-tools .palette .swatch')).toHaveLength(12);
    await wrapper.findAll('.note-tools .palette .swatch')[6].trigger('click');
    expect(store.active!.notes[0].color).toBe('#d7c2ff');
    const tapeBtn = wrapper.findAll('.note-tools .tool').find((b) => b.text() === '📍')!;
    await tapeBtn.trigger('click');
    expect(wrapper.find('.note .tape.pink-stripes').exists()).toBe(true);
    await wrapper.find('.note-tools .danger').trigger('click');
    expect(store.active!.notes).toHaveLength(0);
    wrapper.unmount();
  });

  it('keyboard: N adds a sticky, Delete removes the selected note', async () => {
    const { store, wrapper } = mountApp();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await wrapper.vm.$nextTick();
    expect(store.active!.notes).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    await wrapper.vm.$nextTick();
    expect(store.active!.notes).toHaveLength(0);
    wrapper.unmount();
  });

  it('with no boards, adding a note creates one', async () => {
    const { store, wrapper } = mountApp(false);
    await wrapper.find('nav.dock > button.add').trigger('click');
    expect(store.boards).toHaveLength(1);
    expect(store.active!.notes).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('top bar', () => {
  it('one + menu holds New board, Import and every export; Save stays on its own', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.findAll('.bar .solid.plus')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('+ Board');
    expect(wrapper.findAll('.bar > button.ghost').map((b) => b.text())).toEqual(['📅Agenda', 'Save']);
    expect(wrapper.find('.file-menu .menu').exists()).toBe(false);
    await wrapper.find('.bar .solid.plus').trigger('click');
    const names = wrapper.findAll('.file-menu .menu-item .mi-title').map((t) => t.element.firstChild?.textContent?.trim());
    expect(names).toEqual([
      'New board', 'Import files', 'Word', 'PDF', 'Text', 'Markdown', 'Backup',
      'Add to desktop', 'Widget mode', 'Desktop wallpaper', 'Phone wallpaper', 'Install app',
    ]);
    expect(wrapper.find('input[type=file][multiple]').attributes('accept')).toContain('.docx');
    wrapper.unmount();
  });
});

describe('dates, agenda and widget', () => {
  it('a note gets a date from the 📅 tool, shows a chip, and appears in the agenda', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('nav.dock > button.add').trigger('click');
    await wrapper.find('.note .note-tools textarea, .note textarea').setValue('Hand in essay');
    const cal = wrapper.findAll('.note-tools .tool').find((b) => b.text() === '📅')!;
    await cal.trigger('click');
    expect(wrapper.find('.due-editor').exists()).toBe(true);
    await wrapper.find('.due-editor .quick button').trigger('click');
    const note = store.active!.notes[0];
    expect(note.due).toMatch(/^\d{4}-\d{2}-\d{2}T18:00$|T18:00$/);
    expect(note.remind).toBe(0);
    expect(wrapper.find('.due-chip').exists()).toBe(true);
    await wrapper.find('.due-editor select').setValue('60');
    expect(store.active!.notes[0].remind).toBe(60);
    await wrapper.find('.due-chip').trigger('click');
    expect(store.active!.notes[0].done).toBe(true);
    expect(wrapper.find('.due-chip.done').exists()).toBe(true);

    await wrapper.find('.agenda-btn').trigger('click');
    expect(wrapper.find('.agenda').text()).toContain('Hand in essay');
    await wrapper.find('.due-editor .clear').trigger('click');
    expect(store.active!.notes[0].due).toBeUndefined();
    expect(wrapper.find('.agenda').text()).toContain('Nothing scheduled yet');
    wrapper.unmount();
  });

  it('#widget shows the date, clock, up next and a mini board', async () => {
    window.location.hash = '#widget';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    const b = store.addBoard('landscape', 'kanban');
    const n = store.addNote('sticky', { boardId: b.id, text: 'Demo day' })!;
    const d = new Date(Date.now() + 2 * 3600_000);
    store.setDue(n.id, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`, 0);
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.find('.widget').exists()).toBe(true);
    expect(wrapper.find('.bar').exists()).toBe(false);
    expect(wrapper.find('.widget .next').text()).toContain('Demo day');
    expect(wrapper.find('.widget .time').text()).toMatch(/^\d{2}:\d{2}$/);
    expect(wrapper.findAll('.widget .mini .note').length).toBeGreaterThan(3);
    window.location.hash = '';
    wrapper.unmount();
  });
});

describe('install', () => {
  it('#install opens the install sheet; the browser prompt becomes a one-click button', async () => {
    window.location.hash = '#install';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.find('.install').exists()).toBe(true);
    expect(wrapper.find('[data-action=install-now]').exists()).toBe(false);
    expect(wrapper.findAll('.inst-steps li').length).toBeGreaterThan(1);

    let prompted = 0;
    const evt = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => void prompted++,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(evt);
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-action=install-now]').trigger('click');
    await new Promise((r) => setTimeout(r));
    expect(prompted).toBe(1);
    expect(wrapper.find('.inst-done').text()).toContain('Installed!');

    await wrapper.find('.install .sheet-head button').trigger('click');
    expect(wrapper.find('.install').exists()).toBe(false);
    expect(window.location.hash).toBe('');
    wrapper.unmount();
  });

  it('the + menu opens it too, with tabs for laptop, Android and iPhone', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=install]').trigger('click');
    const tabs = wrapper.findAll('.inst-tabs button');
    expect(tabs.map((t) => t.text().split(' ·')[0].trim())).toEqual(['💻 Laptop / PC', '🤖 Android', '📱 iPhone / iPad']);
    await tabs[2].trigger('click');
    expect(wrapper.find('.inst-steps').text()).toContain('Add to Home Screen');
    expect(wrapper.find('.inst-other code').text()).toMatch(/#install$/);
    wrapper.unmount();
  });
});

describe('add to desktop', () => {
  function dated(text: string, hoursFromNow: number) {
    const store = useWorkspace();
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    const p = (x: number) => String(x).padStart(2, '0');
    const n = store.addNote('sticky', { text })!;
    store.setDue(n.id, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, 0);
    return n;
  }

  it('lets you pick what the widget shows, previews it and opens it in its own window', async () => {
    localStorage.clear();
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    dated('Pay rent', 30);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=desk]').trigger('click');
    const sheet = wrapper.find('.desk');
    expect(sheet.findAll('.desk-part.on')).toHaveLength(4);
    expect(sheet.find('.desk-preview .mini').exists()).toBe(true);

    await sheet.find('[data-part=board]').trigger('click');
    await sheet.find('[data-part=clock]').trigger('click');
    expect(sheet.find('.desk-preview .mini').exists()).toBe(false);
    expect(sheet.find('.desk-preview .time').exists()).toBe(false);
    expect(sheet.find('.desk-preview').text()).toContain('Coming up');
    await sheet.findAll('.desk-theme')[2].trigger('click');
    expect(sheet.find('.desk-preview .widget.th-dark').exists()).toBe(true);

    await sheet.find('[data-action=desk-open]').trigger('click');
    expect(open).toHaveBeenCalledTimes(1);
    const [url, name, features] = open.mock.calls[0] as [string, string, string];
    expect(url).toMatch(/#widget\?show=today%2Cweek&theme=dark$/);
    expect(name).toBe('corkboard-widget');
    expect(features).toMatch(/^popup,width=380/);
    expect(JSON.parse(localStorage.getItem('corkboard:desk')!)).toMatchObject({ parts: ['today', 'week'], theme: 'dark' });
    expect(wrapper.find('.desk').exists()).toBe(false);
    open.mockRestore();
    wrapper.unmount();
  });

  it('the wallpaper link carries a snapshot that a fresh browser (Lively) can show', async () => {
    localStorage.clear();
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    dated('Hand in thesis', 1);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=desk]').trigger('click');
    await wrapper.find('[data-action=desk-wall]').trigger('click');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const link = writeText.mock.calls[0][0] as string;
    expect(link).toMatch(/#widget\?show=clock%2Ctoday%2Cweek%2Cboard&theme=sticky&board=.+&wall=1&snap=z/);
    wrapper.unmount();

    // somewhere else: empty storage, only the link
    setActivePinia(createPinia());
    const fresh = useWorkspace();
    fresh.replace({ version: 2, boards: [], camera: null });
    window.location.hash = link.slice(link.indexOf('#'));
    const wall = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wall.find('.widget.wall').exists()).toBe(true));
    expect(wall.find('.widget').text()).toContain('Hand in thesis');
    expect(wall.find('.widget .snap').text()).toMatch(/^From corkboard, /);
    expect(wall.find('.widget .open').exists()).toBe(false);
    window.location.hash = '';
    wall.unmount();
  });

  it('a widget link shows only the chosen parts', async () => {
    window.location.hash = '#widget?show=today&theme=paper';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    dated('Call mum', 0); // due now: always in today's list (today or overdue)
    const wrapper = mount(App, { attachTo: document.body });
    const w = wrapper.find('.widget');
    expect(w.classes()).toEqual(expect.arrayContaining(['th-paper', 'solo']));
    expect(w.find('.time').exists()).toBe(false);
    expect(w.find('.mini').exists()).toBe(false);
    expect(w.text()).toContain('Call mum');
    expect(w.text()).not.toContain('Coming up');
    window.location.hash = '';
    wrapper.unmount();
  });
});

describe('board wallpaper (#wall)', () => {
  it('shows only the weekly planner, editable, with everything else behind one round button', async () => {
    window.location.hash = '#wall';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const planner = store.addBoard('landscape', 'week');
    store.setActive(store.boards[0].id);
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.find('.bar').exists()).toBe(false);
    expect(wrapper.find('.dock').exists()).toBe(false);
    expect(wrapper.findAll('.wallview .board')).toHaveLength(1);
    expect(wrapper.find('.wallview .board').attributes('data-board-id')).toBe(planner.id);
    expect(store.lockedBoardId).toBe(planner.id);
    expect(wrapper.find('.fab-menu').exists()).toBe(false);

    // edit straight on the wallpaper
    const before = store.board(planner.id)!.notes.length;
    await wrapper.find('[data-action=fab]').trigger('click');
    expect(wrapper.find('.fab-menu').text()).toContain('Weekly planner');
    await wrapper.find('[data-add=sticky]').trigger('click');
    expect(store.board(planner.id)!.notes).toHaveLength(before + 1);
    expect(wrapper.find('.fab-menu').exists()).toBe(false);
    const ta = wrapper.find('.wallview .note.selected textarea, .wallview .note textarea');
    expect(ta.exists()).toBe(true);

    // switch board and background from the same button
    await wrapper.find('[data-action=fab]').trigger('click');
    await wrapper.findAll('.fab-item').find((b) => b.text().includes('another board'))!.trigger('click');
    await wrapper.findAll('.fab-boards button')[0].trigger('click');
    expect(wrapper.find('.wallview .board').attributes('data-board-id')).toBe(store.boards[0].id);
    expect(window.location.hash).toBe(`#wall?board=${store.boards[0].id}`);
    await wrapper.find('[data-action=fab]').trigger('click');
    await wrapper.find('[data-action=wall-bg]').trigger('click');
    expect(wrapper.find('.wallview.bg-dark').exists()).toBe(true);
    expect(wrapper.find('.fab-menu').exists()).toBe(true); // stays open to compare backgrounds

    await wrapper.find('[data-action=wall-open]').trigger('click');
    await new Promise((r) => setTimeout(r));
    expect(wrapper.find('.bar').exists()).toBe(true);
    expect(store.lockedBoardId).toBeNull();
    window.location.hash = '';
    wrapper.unmount();
  });

  it('Add to desktop opens it full screen, or copies a Lively link that brings the board along', async () => {
    localStorage.clear();
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const planner = store.addBoard('landscape', 'week');
    store.updateNote(planner.notes[0].id, { text: 'MONDAY\n- gym' });
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=desk]').trigger('click');
    expect((wrapper.find('[data-field=wall-board]').element as HTMLSelectElement).value).toBe(planner.id);
    await wrapper.find('[data-action=board-wall-copy]').trigger('click');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const link = writeText.mock.calls[0][0] as string;
    expect(link).toMatch(new RegExp(`#wall\\?board=${planner.id}&snap=z`));
    await wrapper.find('[data-action=board-wall-open]').trigger('click');
    expect(open.mock.calls[0][0]).toMatch(new RegExp(`#wall\\?board=${planner.id}$`));
    expect(open.mock.calls[0][1]).toBe('corkboard-wall');
    open.mockRestore();
    wrapper.unmount();

    // Lively: its own empty storage, only the link
    setActivePinia(createPinia());
    const fresh = useWorkspace();
    fresh.replace({ version: 2, boards: [], camera: null });
    window.location.hash = link.slice(link.indexOf('#'));
    const wall = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wall.find('.wallview .board').exists()).toBe(true));
    expect(wall.find('.wallview .board').attributes('data-board-id')).toBe(planner.id);
    expect(fresh.board(planner.id)!.notes[0].text).toBe('MONDAY\n- gym');
    expect(wall.findAll('.wallview .note')).toHaveLength(planner.notes.length);
    window.location.hash = '';
    wall.unmount();
  });
});
