import { useState } from 'react';
import { Dialog, TextField } from '@project-graphite/ui';
import { widgetGroups, widgetKinds, type WidgetType } from './widgets';
import { Button } from '../components/Button';
import { DialogActions } from '../components/DialogActions';
import { Hint } from '../components/Hint';
import { Subheading } from '../components/Page';

export function WidgetGallery({ onAdd, onClose }: { onAdd: (type: WidgetType) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase();
  const kinds = (Object.keys(widgetKinds) as WidgetType[]).filter((type) => `${widgetKinds[type].title} ${widgetKinds[type].description}`.toLowerCase().includes(words));

  return (
    <Dialog onClose={onClose} title="Add a widget">
      <div className="mt-5 grid gap-5">
        <TextField aria-label="Search widgets" autoComplete="off" autoFocus label="" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search widgets" value={query} />
        {kinds.length === 0 && <Hint>No widget matches “{query}”.</Hint>}
        {widgetGroups.map((group) => {
          const inGroup = kinds.filter((type) => widgetKinds[type].group === group);
          return (
            inGroup.length > 0 && (
              <section className="grid gap-2" key={group}>
                <Subheading>{group}</Subheading>
                <div className="grid gap-2 sm:grid-cols-2">
                  {inGroup.map((type) => (
                    <button className="choice-card grid gap-1 text-left" key={type} onClick={() => onAdd(type)} type="button">
                      <span className="text-ink">{widgetKinds[type].title}</span>
                      <span className="text-sm text-muted">{widgetKinds[type].description}</span>
                    </button>
                  ))}
                </div>
              </section>
            )
          );
        })}
        <DialogActions>
          <Button label="Cancel" large onClick={onClose} />
        </DialogActions>
      </div>
    </Dialog>
  );
}
