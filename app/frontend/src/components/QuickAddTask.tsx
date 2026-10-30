import { useId, useState } from 'react';
import { Badge, formatDay, TagChip } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { parseQuickTask, priorityNames, quickSuggestions, withSuggestion } from '../quick-add';
import type { Tag } from '../spaces';
import type { Task } from '../tasks';
import { clockTime } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button } from './Button';

export function QuickAddTask({ listId, onAdded, spaceId }: { listId?: string; onAdded: (task: Task) => void; spaceId: string }) {
  const auth = useAuth();
  const adding = useAction();
  const hintId = useId();
  const suggestionsId = useId();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const tags = useResource<Tag[]>(focused ? `/spaces/${spaceId}/tags` : null, true);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const known = (tags.data ?? []).map((tag) => tag.name);
  const quick = parseQuickTask(text, known);
  const suggestions = dismissed === text ? [] : quickSuggestions(text, known);
  const highlighted = Math.min(active, suggestions.length - 1);
  const understood = Boolean(quick.dueDate || quick.priority || quick.tagNames.length);

  function pick(index: number) {
    setText(withSuggestion(text, suggestions[index]!));
    setActive(0);
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!quick.title) return;
        void adding.run(async () => {
          const added = await auth.request<Task>(`/spaces/${spaceId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ title: quick.title.slice(0, 200), listId, dueDate: quick.dueDate, dueTime: quick.dueTime, priority: quick.priority }),
          });
          const labels = (tags.data ?? []).filter((tag) => quick.tagNames.includes(tag.name));
          if (labels.length) await auth.request(`/items/${added.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds: labels.map((tag) => tag.id) }) });
          setText('');
          onAdded({ ...added, labels });
          return `Added ${added.title}.`;
        }, 'Could not add the task');
      }}
    >
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            aria-activedescendant={suggestions.length ? `${suggestionsId}-${highlighted}` : undefined}
            aria-autocomplete="list"
            aria-controls={suggestions.length ? suggestionsId : undefined}
            aria-describedby={understood ? hintId : undefined}
            aria-expanded={suggestions.length > 0}
            aria-label="Add a task"
            autoComplete="off"
            maxLength={300}
            onBlur={() => setDismissed(text)}
            onFocus={() => setFocused(true)}
            onChange={(event) => {
              setText(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (!suggestions.length) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                pick(highlighted);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(text);
              }
            }}
            placeholder="Add a task: call Sara tomorrow 5pm #work !2"
            role="combobox"
            type="text"
            value={text}
          />
          {suggestions.length > 0 && (
            <ul className="quick-suggestions" id={suggestionsId} role="listbox">
              {suggestions.map((suggestion, index) => (
                <li
                  aria-selected={index === highlighted}
                  className="quick-suggestion"
                  id={`${suggestionsId}-${index}`}
                  key={suggestion.insert}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(index);
                  }}
                  role="option"
                >
                  <span className="min-w-0 truncate text-ink">{suggestion.label}</span>
                  <span className="shrink-0 text-small text-muted">{suggestion.hint}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button disabled={!quick.title || adding.busy} label="Add" large submit />
      </div>
      {understood && (
        <div aria-label="Understood" className="flex flex-wrap items-center gap-2" id={hintId} role="status">
          {quick.dueDate && (
            <Badge icon="calendar">
              {`Due ${formatDay(quick.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}${quick.dueTime ? ` ${clockTime(quick.dueTime)}` : ''}`}
            </Badge>
          )}
          {quick.priority && <Badge icon="alert">{`${priorityNames[quick.priority]} priority`}</Badge>}
          {quick.tagNames.map((name) => (
            <TagChip color={tags.data?.find((tag) => tag.name === name)?.color} key={name} label={name} />
          ))}
        </div>
      )}
    </form>
  );
}
