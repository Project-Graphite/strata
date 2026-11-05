import ClickAwayListener from '@mui/material/ClickAwayListener';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSnackbar } from '@project-graphite/ui';
import { IconButton } from './IconButton';
import type { Editor } from '@tiptap/core';
import { ContextMenu } from './NestedMenu';
import { Tip } from './Tip';

interface OpenLink {
  anchor: HTMLAnchorElement;
  href: string;
  at?: { x: number; y: number };
}

export function LinkActions({ editor }: { editor: Editor }) {
  const show = useSnackbar();
  const navigate = useNavigate();
  const [link, setLink] = useState<OpenLink>();
  const [editing, setEditing] = useState(false);
  const editable = editor.isEditable;

  useEffect(() => {
    const dom = editor.view.dom;
    const found = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      return anchor && !anchor.closest('[data-node-view-wrapper], [data-type="mention"]') ? anchor : null;
    };
    const click = (event: MouseEvent) => {
      const anchor = found(event);
      if (!anchor) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) window.open(anchor.href, '_blank', 'noopener,noreferrer');
      else {
        setEditing(false);
        setLink({ anchor, href: anchor.getAttribute('href')! });
      }
    };
    const menu = (event: MouseEvent) => {
      const anchor = found(event);
      if (!anchor) return;
      event.preventDefault();
      setEditing(false);
      setLink({ anchor, href: anchor.getAttribute('href')!, at: { x: event.clientX, y: event.clientY } });
    };
    dom.addEventListener('click', click);
    dom.addEventListener('contextmenu', menu);
    return () => {
      dom.removeEventListener('click', click);
      dom.removeEventListener('contextmenu', menu);
    };
  }, [editor]);

  if (!link) return null;
  const close = () => setLink(undefined);
  const internal = link.href.startsWith('/') || link.href.startsWith(window.location.origin);
  const open = () => {
    close();
    if (internal) navigate(link.href.replace(window.location.origin, ''));
    else window.open(link.href, '_blank', 'noopener,noreferrer');
  };
  const copy = () => {
    close();
    void navigator.clipboard.writeText(new URL(link.href, window.location.origin).href).then(
      () => show({ message: 'Copied the link.' }),
      () => show({ message: 'Could not copy the link', tone: 'error' }),
    );
  };
  const onLink = () => editor.chain().focus().setTextSelection(editor.view.posAtDOM(link.anchor, 0)).extendMarkRange('link');
  const remove = () => {
    onLink().unsetLink().run();
    close();
  };
  const save = (href: string) => {
    if (href.trim()) onLink().setLink({ href: href.trim() }).run();
    close();
  };

  if (link.at && !editing) {
    return (
      <ContextMenu
        at={link.at}
        items={[
          { label: 'Open link', onSelect: open },
          { label: 'Copy link', onSelect: copy },
          ...(editable
            ? [
                {
                  label: 'Edit link',
                  separated: true,
                  onSelect: () => {
                    setLink({ ...link, at: undefined });
                    setEditing(true);
                  },
                },
                { label: 'Remove link', onSelect: remove },
              ]
            : []),
        ]}
        label="Link actions"
        onClose={close}
      />
    );
  }

  return (
    <Popper anchorEl={link.anchor} className="link-actions-popper" open placement="bottom-start">
      <ClickAwayListener onClickAway={close}>
        <Paper className="link-actions">
          {editing ? (
            <input
              aria-label="Link address"
              autoFocus
              className="link-actions-input"
              defaultValue={link.href}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save(event.currentTarget.value);
                }
                if (event.key === 'Escape') close();
              }}
              type="url"
            />
          ) : (
            <Tip title={link.href}>
              <a className="link-actions-address" href={link.href} onClick={(event) => { event.preventDefault(); open(); }}>
                {link.href}
              </a>
            </Tip>
          )}
          <IconButton icon="external" label="Open link" onClick={open} size="small" />
          <IconButton icon="link" label="Copy link" onClick={copy} size="small" />
          {editable && !editing && <IconButton icon="pencil" label="Edit link" onClick={() => setEditing(true)} size="small" />}
          {editable && <IconButton icon="x" label="Remove link" onClick={remove} size="small" />}
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
