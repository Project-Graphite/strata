import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { RowText } from '../components/RowText';
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
    <Page actions={writable.length > 0 && <Button icon="plus" label="New trip" large onClick={() => setAdding(true)} primary />} title="Trips">
      {trips.error ? (
        <LoadError error={trips.error} onRetry={trips.reload} />
      ) : !trips.data ? (
        <ListSkeleton label="Loading your trips" rows={3} />
      ) : trips.data.length === 0 ? (
        <Empty title="No trips yet">Plan a trip to keep its itinerary, packing list, documents and spending in one place.</Empty>
      ) : (
        groups
          .filter(([, shown]) => shown.length > 0)
          .map(([label, shown]) => (
            <Section key={label} title={label}>
              <ul className="panel-rows">
                {shown.map((trip) => (
                  <li key={trip.id}>
                    <Link className="panel-row flex items-center gap-3 text-ink no-underline hover:bg-line-soft" to={`/trips/${trip.id}`}>
                      <RowText detail={[trip.destination, tripDates(trip), trip.spaceName].filter(Boolean).join(' · ')} title={trip.title} />
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
