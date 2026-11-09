import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('“+ Board” opens templates and creates the chosen board', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('.bar .solid').trigger('click');
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
  it('Save is one button; Import and Export live in the + menu', async () => {
    const store = useWorkspace();
    store.replace({ version: 2, boards: [], camera: null });
    store.addBoard('landscape');
    const wrapper = mount(App, { attachTo: document.body });
    const labels = wrapper.findAll('.bar > button.ghost').map((b) => b.text());
    expect(labels).toContain('Save');
    expect(wrapper.text()).not.toContain('Save as image');
    expect(wrapper.find('.file-menu .menu').exists()).toBe(false);
    await wrapper.find('.file-menu .icon').trigger('click');
    const items = wrapper.findAll('.file-menu .menu-item').map((i) => i.find('.mi-title').text());
    expect(items[0]).toMatch(/^Import/);
    expect(items[1]).toMatch(/^Export/);
    wrapper.unmount();
  });
});
