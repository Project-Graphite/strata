import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ListRow, Placeholder } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { TripEditor } from '../components/TripEditor';
import { useSpaces } from '../spaces';
import { countdown, tripDates, type Trip } from '../trips';
import { useResource } from '../useResource';

const empty = { title: 'No trips yet', hint: 'Plan a trip to keep its itinerary, packing list, documents and spending in one place.' };

export function TripsPage() {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const trips = useResource<Trip[]>('/me/trips', true);
  const [adding, setAdding] = useState(false);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const today = dayKey(new Date());
  const groups = [
    ['Happening now', (trips.data ?? []).filter((trip) => trip.when === 'now')],
    ['Coming up', (trips.data ?? []).filter((trip) => trip.when === 'upcoming')],
    ['Past trips', (trips.data ?? []).filter((trip) => trip.when === 'past').reverse()],
  ] as const;
  const shape = useRememberedShape('trips', trips.data && groups.map(([, shown]) => shown.length), [0, 3, 0]);

  return (
    <Page actions={writable.length > 0 && <Button icon="plus" label="New trip" large onClick={() => setAdding(true)} primary />} title="Trips">
      {trips.error ? (
        <LoadError error={trips.error} onRetry={trips.reload} />
      ) : !trips.data ? (
        <Placeholder className="grid gap-8" label="Loading your trips">
          {shape.some(Boolean) ? (
            groups.map(
              ([label], group) =>
                shape[group]! > 0 && (
                  <Section key={label} title={label}>
                    <RowsSkeleton rows={shape[group]!} trail={<SkeletonLine className="shrink-0 text-sm" width="w-16" />} />
                  </Section>
                ),
            )
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : trips.data.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        groups
          .filter(([, shown]) => shown.length > 0)
          .map(([label, shown]) => (
            <Section key={label} title={label}>
              <ul className="panel-rows">
                {shown.map((trip) => (
                  <ListRow
                    href={`/trips/${trip.id}`}
                    key={trip.id}
                    meta={[trip.destination, tripDates(trip), trip.spaceName].filter(Boolean).join(' · ')}
                    title={trip.title}
                    trail={countdown(trip, today) && <span className="text-small">{countdown(trip, today)}</span>}
                  />
                ))}
              </ul>
            </Section>
          ))
      )}
      {adding && (
        <TripEditor
          onClose={() => setAdding(false)}
          onSaved={(saved) => navigate(`/trips/${saved.id}`)}
          spaces={writable}
        />
      )}
    </Page>
  );
}
