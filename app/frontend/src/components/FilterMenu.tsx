import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, Button as UiButton } from '@project-graphite/ui';
import { IconButton } from './IconButton';
import { Tip } from './Tip';

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
    </>
  );
}

export const activeFilters = (groups: FilterGroup[]) => groups.filter((group) => group.options.findIndex((option) => option.active) > 0).length;

export function FilterMenu({ children, compact = false, groups, label, large = false }: { children?: ReactNode; compact?: boolean; groups: FilterGroup[]; label: string; large?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [drilled, setDrilled] = useState<number>();
  const close = () => {
    setAnchor(null);
    setDrilled(undefined);
  };
  const nested = groups.length > 2;
  const shown = nested ? (drilled === undefined ? [] : [groups[drilled]!]) : groups;
  const summary = groups
    .flatMap((group) => group.options.filter((option, index) => option.active && (groups.length === 1 || index > 0)).map((option) => option.label))
    .join(' · ');
  const count = activeFilters(groups);
  const open = (event: { currentTarget: HTMLElement }) => setAnchor(anchor ? null : event.currentTarget);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {compact ? (
        <IconButton aria-expanded={Boolean(anchor)} aria-haspopup="menu" badge={count || undefined} icon="filter" label={count ? `${label}, ${count} active: ${summary}` : label} onClick={open} />
      ) : (
      <Tip title={label}>
        <UiButton
          aria-expanded={Boolean(anchor)}
          aria-haspopup="menu"
          aria-label={`${label}: ${summary}`}
          className="w-fit max-w-full shrink-0"
          icon="filter"
          onClick={open}
          size={large ? 'medium' : 'small'}
          type="button"
          variant="secondary"
        >
          <span className="truncate">{summary || label}</span>
        </UiButton>
      </Tip>
      )}
      {children}
      <MuiMenu anchorEl={anchor} onClose={close} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': drilled === undefined ? label : groups[drilled]!.label }, paper: { className: 'nested-menu min-w-56' } }}>
        {nested &&
          (drilled === undefined
            ? groups.map((group, index) => (
                <MenuItem aria-haspopup="menu" className="nested-menu-parent" key={group.label} onClick={() => setDrilled(index)}>
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="max-w-32 truncate text-small text-muted">{group.options.find((option) => option.active)?.label}</span>
                  <Icon name="chevron-right" size={16} />
                </MenuItem>
              ))
            : [
                <MenuItem className="nested-menu-back" key="back" onClick={() => setDrilled(undefined)}>
                  <Icon name="chevron-left" size={16} />
                  <span className="font-semibold">{groups[drilled]!.label}</span>
                </MenuItem>,
                <Divider key="back-divider" />,
              ])}
        {shown.flatMap((group, index) => [
          ...(index > 0 ? [<Divider key={`${group.label}-divider`} />] : []),
          ...(shown.length > 1 ? [<ListSubheader className="filter-menu-heading" key={`${group.label}-heading`}>{group.label}</ListSubheader>] : []),
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
