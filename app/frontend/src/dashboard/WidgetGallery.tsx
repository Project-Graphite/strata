import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
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
        <TextField autoComplete="off" autoFocus label="Search widgets" onChange={(event) => setQuery(event.currentTarget.value)} value={query} />
        {kinds.length === 0 && <Hint>No widget matches “{query}”.</Hint>}
        {widgetGroups.map((group) => {
          const inGroup = kinds.filter((type) => widgetKinds[type].group === group);
          return (
            inGroup.length > 0 && (
              <section className="grid gap-2" key={group}>
                <Subheading>{group}</Subheading>
                <div className="grid gap-2 sm:grid-cols-2">
                  {inGroup.map((type) => (
                    <Card key={type} variant="outlined">
                      <CardActionArea className="grid h-full content-start gap-1 p-3 text-left" onClick={() => onAdd(type)}>
                        <span className="text-ink">{widgetKinds[type].title}</span>
                        <span className="text-sm text-muted">{widgetKinds[type].description}</span>
                      </CardActionArea>
                    </Card>
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
