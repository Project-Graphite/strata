import { useState } from 'react';
import { Card, Dialog, EmptyState, Icon, SectionHeading } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { widgetGroups, widgetKinds, type WidgetType } from './widgets';
import { Button } from '../components/Button';
import { DialogActions } from '../components/DialogActions';

export function WidgetGallery({ onAdd, onClose }: { onAdd: (type: WidgetType) => void; onClose: () => void }) {
  const auth = useAuth();
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase();
  const features = auth.user?.features ?? [];
  const kinds = (Object.keys(widgetKinds) as WidgetType[]).filter((type) => {
    const { app, description, title } = widgetKinds[type];
    return (!app || features.includes(app)) && `${title} ${description}`.toLowerCase().includes(words);
  });

  return (
    <Dialog onClose={onClose} title="Add widget">
      <div className="mt-5 grid gap-5">
        <input aria-label="Search widgets" autoComplete="off" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search widgets" type="search" value={query} />
        {kinds.length === 0 && <EmptyState title="No widgets match" variant="filtered" />}
        {widgetGroups.map((group) => {
          const inGroup = kinds.filter((type) => widgetKinds[type].group === group);
          return (
            inGroup.length > 0 && (
              <section className="grid gap-3" key={group}>
                <SectionHeading level={3} title={group} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {inGroup.map((type) => (
                    <Card className="p-0" interactive key={type}>
                      <button className="grid h-full w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-3 p-3 text-left" onClick={() => onAdd(type)} type="button">
                        <span aria-hidden="true" className="widget-icon">
                          <Icon name={widgetKinds[type].icon} size={18} />
                        </span>
                        <span className="grid gap-0.5">
                          <span className="text-ink">{widgetKinds[type].title}</span>
                          <span className="text-small text-muted">{widgetKinds[type].description}</span>
                        </span>
                      </button>
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
