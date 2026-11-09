import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { emptyBoard } from '../src/core/board';
import { useBoard } from '../src/stores/board';

beforeEach(() => setActivePinia(createPinia()));

function mountApp() {
  const store = useBoard();
  store.replace(emptyBoard());
  return { store, wrapper: mount(App, { attachTo: document.body }) };
}

describe('App', () => {
  it('shows a hint on an empty board and adds notes from the dock', async () => {
    const { store, wrapper } = mountApp();
    expect(wrapper.text()).toContain('Double-click anywhere to pin a note');
    const buttons = wrapper.findAll('button.add');
    expect(buttons.map((b) => b.text())).toEqual(['🟨Sticky note', '🗂Index card', '📄Lined paper', '📷Photo', '📌Card']);
    for (const b of buttons) await b.trigger('click');
    expect(store.notes.map((n) => n.kind)).toEqual(['sticky', 'index', 'lined', 'polaroid', 'card']);
    expect(wrapper.findAll('.note')).toHaveLength(5);
    expect(wrapper.findAll('.note.card .pin')).toHaveLength(4);
    wrapper.unmount();
  });

  it('colour dots add a sticky of that colour; double-click on cork adds one too', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.findAll('button.dot')[1].trigger('click');
    expect(store.notes[0]).toMatchObject({ kind: 'sticky', color: '#ffb3c7' });
    await wrapper.find('[data-testid=cork]').trigger('dblclick', { clientX: 400, clientY: 300 });
    expect(store.notes).toHaveLength(2);
    wrapper.unmount();
  });

  it('typing updates the note; the delete tool removes it and the toast can undo', async () => {
    const { store, wrapper } = mountApp();
    await wrapper.find('button.add').trigger('click');
    const ta = wrapper.find('.note textarea');
    await ta.setValue('call mum');
    expect(store.notes[0].text).toBe('call mum');
    await wrapper.find('.note-tools .danger').trigger('click');
    expect(store.notes).toHaveLength(0);
    expect(wrapper.find('.toast').text()).toContain('Note removed');
    await wrapper.find('.toast button').trigger('click');
    expect(store.notes[0].text).toBe('call mum');
    wrapper.unmount();
  });

  it('keyboard: N adds a sticky, Delete removes the selected note', async () => {
    const { store, wrapper } = mountApp();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await wrapper.vm.$nextTick();
    expect(store.notes).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    await wrapper.vm.$nextTick();
    expect(store.notes).toHaveLength(0);
    wrapper.unmount();
  });
});
