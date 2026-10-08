import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockMenuExtension, Callout } from '../src/components/note-extensions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('The / block menu', () => {
  let editor: Editor | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  async function typeIn(text: string) {
    await act(async () => {
      editor!.commands.insertContent(text);
    });
  }

  const options = () => [...document.querySelectorAll('.suggestion-menu [role="option"]')].map((option) => option.textContent);

  async function open(onImages = vi.fn()) {
    function Page() {
      const created = useEditor({ extensions: [StarterKit, TaskList, TaskItem, Callout, Details, DetailsSummary, DetailsContent, TableKit, blockMenuExtension(onImages)], content: '<p></p>', immediatelyRender: true });
      editor = created ?? undefined;
      return <EditorContent editor={created} />;
    }
    const element = document.createElement('div');
    document.body.append(element);
    root = createRoot(element);
    await act(async () => root!.render(<Page />));
    await act(async () => {
      editor!.commands.focus('end');
    });
    return onImages;
  }

  it('filters blocks as you type and turns the line into the one you pick', async () => {
    await open();
    await typeIn('/');
    expect(options()).toContain('Heading#');
    expect(options()).toContain('Divider---');

    await typeIn('todo');
    expect(options()).toEqual(['Checklist[]']);
    await act(async () => document.querySelector<HTMLButtonElement>('.suggestion-menu [role="option"]')!.click());

    expect(editor!.getJSON().content?.[0]?.type).toBe('taskList');
    expect(editor!.getText()).not.toContain('/todo');
    expect(document.querySelector('.suggestion-menu')).toBeNull();
  });

  it('starts a page link and asks for images through the editor', async () => {
    const onImages = await open();
    await typeIn('/link');
    await act(async () => document.querySelector<HTMLButtonElement>('.suggestion-menu [role="option"]')!.click());
    expect(editor!.getText()).toBe('@');

    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await typeIn(' /image');
    await act(async () => document.querySelector<HTMLButtonElement>('.suggestion-menu [role="option"]')!.click());
    expect(click).toHaveBeenCalledTimes(1);
    const picker = click.mock.contexts[0] as HTMLInputElement;
    expect(picker.accept).toBe('image/*');
    picker.onchange?.(new Event('change'));
    expect(onImages).toHaveBeenCalledWith(editor!.view, []);
    click.mockRestore();
  });

  it('adds callouts, toggles and tables', async () => {
    await open();
    const pick = async (query: string) => {
      await typeIn(`/${query}`);
      await act(async () => document.querySelector<HTMLButtonElement>('.suggestion-menu [role="option"]')!.click());
    };
    await pick('callout');
    await typeIn('Bring a coat');
    expect(editor!.getJSON().content?.[0]).toMatchObject({ type: 'callout', content: [{ type: 'paragraph', content: [{ text: 'Bring a coat' }] }] });

    await act(async () => {
      editor!.commands.setContent('<p></p>');
      editor!.commands.focus('end');
    });
    await pick('toggle');
    expect(editor!.getJSON().content?.[0]?.type).toBe('details');

    await act(async () => {
      editor!.commands.setContent('<p></p>');
      editor!.commands.focus('end');
    });
    await pick('table');
    const table = editor!.getJSON().content?.find((block) => block.type === 'table');
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.content?.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);
  });
});
