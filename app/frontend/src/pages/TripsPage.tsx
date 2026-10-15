import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';
import { TripEditor } from '../components/TripEditor';
import { useSpaces } from '../spaces';
import { countdown, tripDates, type Trip } from '../trips';
import { useResource } from '../useResource';

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

  return (
    <Page actions={writable.length > 0 && <HeaderButton icon="plus" label="New trip" onClick={() => setAdding(true)} primary />} title="Trips">
      {trips.error ? (
        <LoadError error={trips.error} onRetry={trips.reload} />
      ) : !trips.data ? (
        <ListSkeleton label="Loading your trips" rows={3} />
      ) : trips.data.length === 0 ? (
        <Empty title="No trips yet" />
      ) : (
        groups
          .filter(([, shown]) => shown.length > 0)
          .map(([label, shown]) => (
            <Section key={label} title={label}>
              <ul className="panel-rows">
                {shown.map((trip) => (
                  <li key={trip.id}>
                    <Link className="panel-row flex items-center gap-3 text-ink no-underline hover:bg-line-soft" to={`/trips/${trip.id}`}>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate">{trip.title}</span>
                        <span className="truncate text-sm text-muted">{[trip.destination, tripDates(trip), trip.spaceName].filter(Boolean).join(' · ')}</span>
                      </span>
                      {countdown(trip, today) && <span className="shrink-0 text-sm text-muted">{countdown(trip, today)}</span>}
                    </Link>
                  </li>
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
