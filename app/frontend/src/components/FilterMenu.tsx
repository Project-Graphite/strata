import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, Button as UiButton } from '@project-graphite/ui';

export interface FilterOption {
  label: string;
  active: boolean;
  count?: number;
  href?: string;
  onSelect?: () => void;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
}

function OptionText({ option }: { option: FilterOption }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.count !== undefined && <span className="text-small text-muted tabular-nums">{option.count}</span>}
      <span aria-hidden="true" className={`inline-flex w-4 ${option.active ? '' : 'invisible'}`}>
        <Icon name="check" size={16} />
      </span>
    </>
  );
}

export function FilterMenu({ children, groups, label, large = false }: { children?: ReactNode; groups: FilterGroup[]; label: string; large?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const summary = groups
    .flatMap((group) => group.options.filter((option, index) => option.active && (groups.length === 1 || index > 0)).map((option) => option.label))
    .join(' · ');
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <UiButton
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        aria-label={`${label}: ${summary}`}
        className="w-fit max-w-full shrink-0"
        icon="filter"
        onClick={(event: { currentTarget: HTMLElement }) => setAnchor(anchor ? null : event.currentTarget)}
        size={large ? 'medium' : 'small'}
        title={label}
        type="button"
        variant="secondary"
      >
        <span className="truncate">{summary || label}</span>
      </UiButton>
      {children}
      <MuiMenu anchorEl={anchor} onClose={close} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': label }, paper: { className: 'nested-menu min-w-56' } }}>
        {groups.flatMap((group, index) => [
          ...(index > 0 ? [<Divider key={`${group.label}-divider`} />] : []),
          ...(groups.length > 1 ? [<ListSubheader className="filter-menu-heading" key={`${group.label}-heading`}>{group.label}</ListSubheader>] : []),
          ...group.options.map((option) =>
            option.href ? (
              <MenuItem aria-current={option.active || undefined} component={Link} key={`${group.label}-${option.label}`} onClick={close} selected={option.active} to={option.href}>
                <OptionText option={option} />
              </MenuItem>
            ) : (
              <MenuItem
                key={`${group.label}-${option.label}`}
                onClick={() => {
                  close();
                  option.onSelect?.();
                }}
                selected={option.active}
              >
                <OptionText option={option} />
              </MenuItem>
            ),
          ),
        ])}
      </MuiMenu>
    </div>
  );
}
