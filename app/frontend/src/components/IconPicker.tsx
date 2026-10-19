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
              <button
                aria-label={`Use ${choice}`}
                aria-pressed={choice === icon}
                className="icon-picker-choice"
                key={choice}
                onClick={() => {
                  close();
                  onPick(choice);
                }}
                type="button"
              >
                {choice}
              </button>
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
