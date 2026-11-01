import Divider from '@mui/material/Divider';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@project-graphite/ui';

export type NestedMenuItem = { label: string; separated?: boolean; disabled?: boolean } & ({ onSelect: () => void } | { items: NestedMenuItem[] });

type Parent = NestedMenuItem & { items: NestedMenuItem[] };

interface Flyout {
  item: Parent;
  anchor: HTMLElement;
  side: 'left' | 'right';
  focus: boolean;
}

function entries(items: NestedMenuItem[], { close, open, leave, expanded }: { close: () => void; open: (item: Parent, target: HTMLElement, focus: boolean) => void; leave?: () => void; expanded?: string }) {
  return items.flatMap((item) => [
    ...(item.separated ? [<Divider key={`${item.label}-divider`} />] : []),
    'items' in item ? (
      <MenuItem
        aria-expanded={expanded === item.label}
        aria-haspopup="menu"
        className="nested-menu-parent"
        disabled={item.disabled || item.items.length === 0}
        key={item.label}
        onClick={(event) => open(item, event.currentTarget, event.detail === 0)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault();
          open(item, event.currentTarget, true);
        }}
        onMouseEnter={(event) => open(item, event.currentTarget, false)}
      >
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Icon name="chevron-right" size={16} />
      </MenuItem>
    ) : (
      <MenuItem
        disabled={item.disabled}
        key={item.label}
        onClick={() => {
          close();
          item.onSelect();
        }}
        onMouseEnter={leave}
      >
        {item.label}
      </MenuItem>
    ),
  ]);
}

export function NestedMenu({ align = 'end', header, items, label, trigger, triggerClassName, triggerLabel }: { align?: 'start' | 'end'; header?: ReactNode; items: NestedMenuItem[]; label: string; trigger: ReactNode; triggerClassName: string; triggerLabel: string }) {
  const drill = useMediaQuery('(pointer: coarse), (max-width: 47.99rem)');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [path, setPath] = useState<Parent[]>([]);
  const [flyout, setFlyout] = useState<Flyout>();
  const close = () => {
    setAnchor(null);
    setPath([]);
    setFlyout(undefined);
  };
  const level = drill ? path.at(-1) : undefined;
  const side = align === 'end' ? 'right' : 'left';

  function open(item: Parent, target: HTMLElement, focus: boolean) {
    if (drill) return setPath((current) => [...current, item]);
    if (flyout?.item === item && !focus) return;
    setFlyout({ item, anchor: target, side: target.getBoundingClientRect().right + 260 < window.innerWidth ? 'right' : 'left', focus });
  }

  return (
    <>
      <button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className={triggerClassName}
        onClick={(event) => (anchor ? close() : setAnchor(event.currentTarget))}
        onMouseDown={(event) => event.preventDefault()}
        title={triggerLabel}
        type="button"
      >
        {trigger}
      </button>
      <MuiMenu
        anchorEl={anchor}
        anchorOrigin={{ horizontal: side, vertical: 'bottom' }}
        disableEnforceFocus
        onClose={close}
        open={Boolean(anchor)}
        slotProps={{ list: { 'aria-label': level?.label ?? label }, paper: { className: 'nested-menu min-w-60' } }}
        transformOrigin={{ horizontal: side, vertical: 'top' }}
        variant="menu"
      >
        {header && <li role="none">{header}</li>}
        {level && [
          <MenuItem className="nested-menu-back" key="back" onClick={() => setPath((current) => current.slice(0, -1))}>
            <Icon name="chevron-left" size={16} />
            <span className="font-semibold">{level.label}</span>
          </MenuItem>,
          <Divider key="back-divider" />,
        ]}
        {entries(level ? level.items : items, { close, open, leave: () => setFlyout(undefined), expanded: flyout?.item.label })}
      </MuiMenu>
      {flyout && !drill && (
        <Popper anchorEl={flyout.anchor} className="nested-menu-flyout" open placement={flyout.side === 'right' ? 'right-start' : 'left-start'}>
          <Paper className="nested-menu min-w-56">
            <MenuList
              aria-label={flyout.item.label}
              autoFocusItem={flyout.focus}
              onKeyDown={(event: KeyboardEvent<HTMLUListElement>) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  flyout.anchor.focus();
                  setFlyout(undefined);
                }
              }}
            >
              {entries(flyout.item.items, { close, open: () => undefined })}
            </MenuList>
          </Paper>
        </Popper>
      )}
    </>
  );
}
