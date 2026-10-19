import ToggleButton from '@mui/material/ToggleButton';
import { Popover } from '@project-graphite/ui';
import { TextButton } from './Button';

const icons = ['📝', '📌', '💡', '✅', '📅', '🎯', '📚', '🧠', '🏠', '✈️', '🍳', '💰', '🎉', '🛒', '💪', '🌱', '🎵', '🎨', '🧳', '❤️', '⭐', '🔥', '🚀', '🗂️'];

export function IconPicker({ icon, onPick }: { icon: string | null; onPick: (icon: string | null) => void }) {
  return (
    <Popover
      align="start"
      label="Page icon"
      panelClassName="icon-picker"
      trigger={icon ?? '+'}
      triggerClassName={icon ? 'page-icon' : 'page-icon page-icon-empty'}
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
