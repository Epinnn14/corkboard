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
      'Desktop widget', 'Widget mode', 'Desktop wallpaper', 'Phone wallpaper', 'Install app',
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

  it('#widget: calendar page, clock, today on a sticky (tick it off), coming up, optional mini board', async () => {
    localStorage.clear();
    window.location.hash = '#widget?show=clock,today,week,board&theme=cork';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    const b = store.addBoard('landscape', 'kanban');
    const n = store.addNote('sticky', { boardId: b.id, text: 'Demo day' })!;
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, '0');
    store.setDue(n.id, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, 0);
    const wrapper = mount(App, { attachTo: document.body });
    const w = wrapper.find('.widget');
    expect(w.classes()).toEqual(expect.arrayContaining(['th-cork', 'wide']));
    expect(wrapper.find('.bar').exists()).toBe(false);
    expect(w.find('.cal-day').text()).toBe(String(d.getDate()));
    expect(w.find('.time').text()).toMatch(/^\d{2}:\d{2}$/);
    expect(w.find('.w-today').text()).toContain('Demo day');
    expect(w.find('.sum').text()).toMatch(/^1 thing today/);
    expect(w.findAll('.mini .note').length).toBeGreaterThan(3);
    await w.find('[data-action=widget-tick]').trigger('click');
    expect(store.find(n.id)!.note.done).toBe(true);
    // it stays on the day, crossed out
    expect(wrapper.find('.w-today li.done').text()).toContain('Demo day');
    expect(wrapper.find('.w-today .tick.on').exists()).toBe(true);
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

describe('desktop widget', () => {
  function dated(text: string, hoursFromNow: number) {
    const store = useWorkspace();
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    const p = (x: number) => String(x).padStart(2, '0');
    const n = store.addNote('sticky', { text })!;
    store.setDue(n.id, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, 0);
    return n;
  }

  it('+ → Desktop widget: pick what it shows and its style, preview it, open it or get the Windows app', async () => {
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
    expect(sheet.text()).not.toMatch(/wallpaper|Lively/i);
    expect(sheet.findAll('.desk-part.on').map((b) => b.attributes('data-part'))).toEqual(['clock', 'today']);
    await sheet.find('[data-part=week]').trigger('click');
    expect(sheet.find('.desk-preview .widget.th-cork').exists()).toBe(true);
    expect(sheet.find('[data-action=get-windows-app]').attributes('href')).toBe(
      'https://github.com/Epinnn14/corkboard/releases/latest/download/corkboard.exe',
    );

    await sheet.find('[data-part=board]').trigger('click');
    expect(sheet.find('.desk-preview .mini').exists()).toBe(true);
    await sheet.find('[data-part=clock]').trigger('click');
    expect(sheet.find('.desk-preview .cal').exists()).toBe(false);
    await sheet.findAll('.desk-theme')[2].trigger('click');
    expect(sheet.find('.desk-preview .widget.th-dark').exists()).toBe(true);
    // the preview can't tick things off
    expect((sheet.find('.desk-preview .w-week .what').element as HTMLButtonElement).disabled).toBe(true);

    // sizes: presets, or custom from one sticky note up
    await sheet.find('[data-size=s]').trigger('click');
    expect(sheet.find('.desk-preview .desk-window').attributes('style')).toContain('height: 300px');
    await sheet.find('[data-size=custom]').trigger('click');
    await sheet.find('[data-field=size-w]').setValue('150');
    await sheet.find('[data-field=size-h]').setValue('700');
    expect(JSON.parse(localStorage.getItem('corkboard:desk')!).size).toEqual({ w: 220, h: 700 });
    await sheet.find('[data-size=auto]').trigger('click');
    // notes only: no backdrop, the papers alone
    await sheet.findAll('.desk-theme')[3].trigger('click');
    expect(sheet.find('.desk-preview .widget.th-bare').exists()).toBe(true);
    await sheet.findAll('.desk-theme')[2].trigger('click');

    await sheet.find('[data-action=desk-open]').trigger('click');
    const [url, name, features] = open.mock.calls[0] as [string, string, string];
    expect(url).toMatch(/#widget\?show=today%2Cweek%2Cboard&theme=dark&board=/);
    expect(name).toBe('corkboard-widget');
    expect(features).toMatch(/^popup,width=860/);
    expect(JSON.parse(localStorage.getItem('corkboard:desk')!)).toMatchObject({ parts: ['today', 'week', 'board'], theme: 'dark' });
    open.mockRestore();
    wrapper.unmount();
  });

  it('a widget link shows only the chosen parts; v1.4 "sticky" settings become cork', async () => {
    localStorage.setItem('corkboard:desk', JSON.stringify({ parts: ['clock', 'today'], theme: 'sticky', boardId: null }));
    window.location.hash = '#widget';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    dated('Call mum', 0);
    const wrapper = mount(App, { attachTo: document.body });
    const w = wrapper.find('.widget');
    expect(w.classes()).toContain('th-cork');
    expect(w.find('.w-today').text()).toContain('Call mum');
    expect(w.find('.w-week').exists()).toBe(false);
    expect(w.find('.mini').exists()).toBe(false);
    wrapper.unmount();

    window.location.hash = '#widget?show=week&theme=paper';
    const again = mount(App, { attachTo: document.body });
    expect(again.find('.widget').classes()).toContain('th-paper');
    expect(again.find('.cal').exists()).toBe(false);
    expect(again.find('.w-today').exists()).toBe(false);
    expect(again.find('.w-week').exists()).toBe(true);
    window.location.hash = '';
    again.unmount();
  });

  it('the widget menu opens corkboard and its settings', async () => {
    localStorage.clear();
    window.location.hash = '#widget';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('[data-action=widget-menu]').trigger('click');
    expect(wrapper.find('[data-action=widget-top]').exists()).toBe(false); // only in the Windows app
    await wrapper.find('[data-action=widget-customize]').trigger('click');
    await new Promise((r) => setTimeout(r));
    expect(wrapper.find('.bar').exists()).toBe(true);
    expect(wrapper.find('.desk').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Windows app', () => {
  function dated(text: string, hoursFromNow: number) {
    const store = useWorkspace();
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    const p = (x: number) => String(x).padStart(2, '0');
    const n = store.addNote('sticky', { text })!;
    store.setDue(n.id, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, 0);
    return n;
  }
  function fakeBridge(widget: boolean) {
    let settings = { widget: true, onTop: false, startup: true };
    const listeners: ((s: typeof settings) => void)[] = [];
    const bridge = {
      widget,
      openApp: vi.fn(),
      resizeWidget: vi.fn(),
      showWidget: vi.fn(),
      getSettings: vi.fn(async () => settings),
      setSettings: vi.fn(async (p: object) => {
        settings = { ...settings, ...p };
        listeners.forEach((cb) => cb(settings));
        return settings;
      }),
      onSettings: (cb: (s: typeof settings) => void) => listeners.push(cb),
    };
    (window as unknown as { corkboardDesktop: unknown }).corkboardDesktop = bridge;
    return bridge;
  }
  const clearBridge = () => delete (window as unknown as { corkboardDesktop?: unknown }).corkboardDesktop;

  it('the widget window: transparent, sized to fit, menu talks to the app', async () => {
    localStorage.clear();
    window.location.hash = '#widget';
    const bridge = fakeBridge(true);
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const n = dated('Dentist', 0);
    const wrapper = mount(App, { attachTo: document.body });
    expect(document.documentElement.classList.contains('cb-desk-widget')).toBe(true);
    expect(wrapper.find('.widget.desk').exists()).toBe(true);
    expect(bridge.resizeWidget).toHaveBeenCalledWith(360, 24 + 168 + 210);
    await wrapper.find('.w-today .what').trigger('click');
    expect(bridge.openApp).toHaveBeenCalledWith(`note:${n.id}`);
    await wrapper.find('[data-action=widget-menu]').trigger('click');
    await wrapper.find('[data-action=widget-customize]').trigger('click');
    expect(bridge.openApp).toHaveBeenCalledWith('desk');
    await wrapper.find('[data-action=widget-menu]').trigger('click');
    await wrapper.find('[data-action=widget-top]').trigger('click');
    expect(bridge.setSettings).toHaveBeenCalledWith({ onTop: true });
    await wrapper.find('[data-action=widget-menu]').trigger('click');
    expect(wrapper.find('[data-action=widget-top]').text()).toContain('Stop keeping on top');
    await wrapper.find('[data-action=widget-hide]').trigger('click');
    expect(bridge.setSettings).toHaveBeenCalledWith({ widget: false });
    document.documentElement.classList.remove('cb-desk-widget');
    clearBridge();
    window.location.hash = '';
    wrapper.unmount();
  });

  it('the resize grip resizes the window live and remembers the size; Widget mode shows the real widget', async () => {
    localStorage.clear();
    window.location.hash = '#widget';
    const bridge = fakeBridge(true);
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const proto = Element.prototype as unknown as { setPointerCapture?: unknown };
    const had = proto.setPointerCapture;
    proto.setPointerCapture = () => {};
    const wrapper = mount(App, { attachTo: document.body });
    const grip = wrapper.find('[data-action=widget-resize]');
    expect(grip.exists()).toBe(true);
    // jsdom: 1024 × 768 window; drag the bottom-left grip 900px right and 700px up → clamped to one sticky note
    grip.element.dispatchEvent(new MouseEvent('pointerdown', { screenX: 0, screenY: 0, bubbles: true }));
    grip.element.dispatchEvent(new MouseEvent('pointerup', { screenX: 900, screenY: -700, bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem('corkboard:desk')!).size).toEqual({ w: 220, h: 220 });
    expect(bridge.resizeWidget).toHaveBeenLastCalledWith(220, 220);
    proto.setPointerCapture = had;
    document.documentElement.classList.remove('cb-desk-widget');
    clearBridge();
    window.location.hash = '';
    wrapper.unmount();

    // in the app window, "+ → Widget mode" brings up the desktop widget instead
    const b2 = fakeBridge(false);
    const app = mount(App, { attachTo: document.body });
    await app.find('.bar .solid.plus').trigger('click');
    await app.find('[data-action=widget]').trigger('click');
    expect(b2.showWidget).toHaveBeenCalled();
    expect(app.find('.bar').exists()).toBe(true);
    clearBridge();
    app.unmount();
  });

  it('the app window: widget settings instead of the download; #note= shows a note', async () => {
    const bridge = fakeBridge(false);
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const n = store.addNote('sticky', { text: 'from the widget' })!;
    store.select(null);
    window.location.hash = `#note=${n.id}`;
    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r));
    expect(store.selectedId).toBe(n.id);
    await wrapper.find('.bar .solid.plus').trigger('click');
    await wrapper.find('[data-action=desk]').trigger('click');
    await vi.waitFor(() => expect((wrapper.find('[data-field=widget-on]').element as HTMLInputElement).checked).toBe(true));
    expect(wrapper.find('[data-card=get-app]').exists()).toBe(false);
    await wrapper.find('[data-field=widget-top]').setValue(true);
    expect(bridge.setSettings).toHaveBeenCalledWith({ onTop: true });
    await wrapper.find('[data-field=widget-startup]').setValue(false);
    expect(bridge.setSettings).toHaveBeenCalledWith({ startup: false });
    await wrapper.find('[data-action=widget-show]').trigger('click');
    expect(bridge.showWidget).toHaveBeenCalled();
    clearBridge();
    wrapper.unmount();
  });
});

describe('polaroid', () => {
  it('a tap on the picture opens the photo picker; the caption is for writing', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    store.addNote('polaroid');
    const proto = Element.prototype as unknown as { setPointerCapture?: unknown };
    const had = proto.setPointerCapture;
    proto.setPointerCapture = () => {};
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = mount(App, { attachTo: document.body });
    const note = wrapper.find('.note.polaroid');
    expect(note.find('.photo').attributes('title')).toBe('Click to add a photo');
    // with pointer capture the release lands on the note itself, not on the picture
    await note.find('.photo').trigger('pointerdown', { pointerId: 1 });
    await note.trigger('pointerup', { pointerId: 1 });
    expect(click).toHaveBeenCalledTimes(1);
    await note.find('textarea').trigger('pointerdown', { pointerId: 2 });
    await note.trigger('pointerup', { pointerId: 2 });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    proto.setPointerCapture = had;
    wrapper.unmount();
  });
});

describe('agenda from note text', () => {
  it('times written in a note show up by day and time; ticking crosses them out in the agenda and the note', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const n = store.addNote('index', { text: 'Errands\nbuy milk 10.00\nmeeting 23.59' })!;
    store.select(null);
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.agenda-btn').trigger('click');
    const agenda = wrapper.find('.agenda');
    expect(agenda.findAll('.time').map((t) => t.text())).toEqual(expect.arrayContaining(['10:00', '23:59']));
    // each item has room for your own note
    const memo = agenda.findAll('li').find((li) => li.text().includes('buy milk'))!.find('[data-field=memo]');
    await memo.setValue('oat milk, 2 litres');
    await memo.trigger('change');
    expect(store.find(n.id)!.note.memos).toEqual({ 'buy milk@10:00': 'oat milk, 2 litres' });
    const row = agenda.findAll('li').find((li) => li.text().includes('meeting'))!;
    await row.find('input[type=checkbox]').setValue(true);
    expect(store.find(n.id)!.note.text.split('\n')[2]).toBe('m̶e̶e̶t̶i̶n̶g̶ ̶2̶3̶.̶5̶9̶');
    const again = wrapper.find('.agenda').findAll('li').find((li) => li.text().includes('meeting'))!;
    expect(again.classes()).toContain('done');
    expect((again.find('input').element as HTMLInputElement).checked).toBe(true);
    await again.find('input[type=checkbox]').setValue(false);
    expect(store.find(n.id)!.note.text.split('\n')[2]).toBe('meeting 23.59');
    wrapper.unmount();
  });
});

describe('widget day', () => {
  it("shows today's notes by default; ‹ › flip to other days", async () => {
    localStorage.clear();
    window.location.hash = '#widget';
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const d = new Date();
    const tomorrow = names[(d.getDay() + 1) % 7];
    store.addNote('index', { text: `${names[d.getDay()]}\nsleep in 23.58` });
    store.addNote('index', { text: `${tomorrow}\nfutsal 10.00\nchurch 13.00` });
    const wrapper = mount(App, { attachTo: document.body });
    const w = () => wrapper.find('.w-today');
    expect(w().find('[data-field=widget-day]').text()).toBe('Today');
    expect(w().text()).toContain('sleep in');
    expect(wrapper.find('.w-week').exists()).toBe(false); // not in the default widget
    await w().find('[data-action=day-next]').trigger('click');
    expect(w().find('[data-field=widget-day]').text()).toBe('Tomorrow');
    expect(w().findAll('.what').map((b) => b.text())).toEqual(['futsal', 'church']);
    expect(w().findAll('.when').map((b) => b.text())).toEqual(['10:00', '13:00']);
    await w().find('[data-action=day-prev]').trigger('click');
    expect(w().find('[data-field=widget-day]').text()).toBe('Today');
    window.location.hash = '';
    wrapper.unmount();
  });
});
