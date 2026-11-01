import ToggleButton from '@mui/material/ToggleButton';
import type { ReactNode } from 'react';
import { Popover } from '@project-graphite/ui';
import { TextButton } from './Button';

const icons = ['📝', '📌', '💡', '✅', '📅', '🎯', '📚', '🧠', '🏠', '✈️', '🍳', '💰', '🎉', '🛒', '💪', '🌱', '🎵', '🎨', '🧳', '❤️', '⭐', '🔥', '🚀', '🗂️'];

export function IconPicker({ empty, emptyClassName = 'page-icon page-icon-empty', icon, onPick }: { empty?: ReactNode; emptyClassName?: string; icon: string | null; onPick: (icon: string | null) => void }) {
  return (
    <Popover
      align="start"
      label="Page icon"
      panelClassName="icon-picker"
      trigger={icon ?? empty ?? '+'}
      triggerClassName={icon ? 'page-icon' : emptyClassName}
      triggerLabel={icon ? 'Change the page icon' : 'Add a page icon'}
    >
      {(close) => (
        <div className="grid gap-2">
          <div className="grid grid-cols-6 gap-1">
            {icons.map((choice) => (
              <ToggleButton
                aria-label={`Use ${choice}`}
                className="border-0 text-lg"
                key={choice}
                onChange={() => {
                  close();
                  onPick(choice);
                }}
                selected={choice === icon}
                size="small"
                value={choice}
              >
                {choice}
              </ToggleButton>
            ))}
          </div>
          {icon && (
            <TextButton
              label="Remove the icon"
              onClick={() => {
                close();
                onPick(null);
              }}
            />
          )}
        </div>
      )}
    </Popover>
  );
}
