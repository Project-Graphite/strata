import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import { useEffect, useState } from 'react';
import { errorMessage, formatDay, Placeholder, Select, TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { useLiveRefresh, useResource } from '../useResource';
import { SkeletonLine } from '../components/Skeletons';
import { LinkRowsSkeleton, WidgetEmpty, type SettingsProps, type WidgetProps } from './widget-parts';
import { Button } from '../components/Button';

const outsideRefresh = { every: 15 * 60_000 };

interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

interface Forecast {
  unit: 'celsius' | 'fahrenheit';
  current: { temperature: number; code: number; wind: number };
  daily: { date: string; code: number; high: number; low: number }[];
}

interface Story {
  title: string;
  link: string;
  published: string | null;
  source: string;
}

const conditions: [number[], string][] = [
  [[0], 'Clear'],
  [[1], 'Mostly clear'],
  [[2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67], 'Rain'],
  [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Showers'],
  [[85, 86], 'Snow showers'],
  [[95, 96, 99], 'Thunderstorm'],
];

const condition = (code: number) => conditions.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown';

function placeOf(settings: Record<string, unknown>) {
  const place = settings.place as Place | undefined;
  return place && typeof place.latitude === 'number' && typeof place.longitude === 'number' ? place : undefined;
}

export function Weather({ configure, settings }: WidgetProps) {
  const place = placeOf(settings);
  const unit = settings.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const forecast = useResource<Forecast>(place ? `/widgets/weather?latitude=${place.latitude}&longitude=${place.longitude}&unit=${unit}` : null, true, outsideRefresh);

  if (!place) return <WidgetEmpty action={configure && <Button label="Choose a place" onClick={configure} />} icon="compass" title="No place chosen" />;
  if (forecast.error) return <LoadError compact error={forecast.error} onRetry={forecast.reload} />;
  if (!forecast.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading the weather">
        <div>
          <SkeletonLine className="widget-figure" width="w-20" />
          <SkeletonLine className="mt-1 text-small" width="w-48" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-body">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <div className="grid gap-0.5" key={day}>
              <SkeletonLine className="justify-center" width="w-3" />
              <SkeletonLine className="justify-center" width="w-6" />
              <SkeletonLine className="justify-center" width="w-6" />
            </div>
          ))}
        </div>
      </Placeholder>
    );
  }
  const { current, daily } = forecast.data;
  return (
    <div className="grid gap-3">
      <div>
        <p className="widget-figure">
          {current.temperature}°{unit === 'fahrenheit' ? 'F' : 'C'}
        </p>
        <p className="m-0 mt-1 text-small text-muted">
          {condition(current.code)} · {place.name.split(',')[0]} · wind {current.wind} {unit === 'fahrenheit' ? 'mph' : 'km/h'}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center text-body">
        {daily.map((day) => (
          <li className="grid gap-0.5" key={day.date} title={condition(day.code)}>
            <span className="text-muted">{formatDay(day.date, { weekday: 'narrow' })}</span>
            <span className="text-ink">{day.high}°</span>
            <span className="text-muted">{day.low}°</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeatherSettings({ onChange, settings }: SettingsProps) {
  const auth = useAuth();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[]>();
  const [problem, setProblem] = useState('');
  const place = placeOf(settings);

  async function search() {
    setProblem('');
    try {
      const results = await auth.request<Place[]>(`/widgets/places?name=${encodeURIComponent(query.trim())}`);
      setFound(results);
    } catch (reason) {
      setProblem(errorMessage(reason, 'Could not search for places'));
    }
  }

  function here() {
    setProblem('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        onChange({
          ...settings,
          place: { name: 'Current location', latitude: Number(coords.latitude.toFixed(2)), longitude: Number(coords.longitude.toFixed(2)) },
        }),
      () => setProblem('Your browser did not share your location.'),
    );
  }

  return (
    <div className="grid gap-3">
      <Hint>{place ? `Showing ${place.name}.` : 'No place chosen yet.'}</Hint>
      <div className="flex flex-wrap items-stretch gap-2">
        <TextField
          className="min-w-0 grow basis-40"
          label="Search for a place"
          maxLength={80}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (query.trim().length >= 2) void search();
            }
          }}
          placeholder="City or town"
          value={query}
        />
        <Button disabled={query.trim().length < 2} label="Search" onClick={() => void search()} />
        {'geolocation' in navigator && (
          <Button label="Use my location" onClick={here} />
        )}
      </div>
      {found && (
        <List dense disablePadding>
          {found.length === 0 && <li className="text-small text-muted">No places match.</li>}
          {found.map((option) => (
            <ListItemButton
              key={`${option.latitude},${option.longitude}`}
              onClick={() => {
                onChange({ ...settings, place: option });
                setFound(undefined);
                setQuery('');
              }}
            >
              {option.name}
            </ListItemButton>
          ))}
        </List>
      )}
      {problem && <p className="m-0 text-sm text-danger">{problem}</p>}
      <Select
        className="max-w-xs"
        label="Units"
        onChange={(unit) => onChange({ ...settings, unit })}
        options={[
          { value: 'celsius', label: 'Celsius, km/h' },
          { value: 'fahrenheit', label: 'Fahrenheit, mph' },
        ]}
        size="small"
        value={settings.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'}
      />
    </div>
  );
}

function stringsOf(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function AddressLines({ label, max, onChange, placeholder, values }: { label: string; max: number; onChange: (values: string[]) => void; placeholder: string; values: string[] }) {
  const [text, setText] = useState(values.join('\n'));
  return (
    <TextAreaField
      label={label}
      onChange={(event) => {
        setText(event.currentTarget.value);
        onChange(
          event.currentTarget.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, max),
        );
      }}
      placeholder={placeholder}
      rows={4}
      value={text}
    />
  );
}

export function News({ configure, settings }: WidgetProps) {
  const { request } = useAuth();
  const feeds = stringsOf(settings.feeds);
  const count = typeof settings.count === 'number' ? settings.count : 5;
  const key = feeds.join('\n');
  const [loaded, setLoaded] = useState<{ key: string; stories: Story[]; failed: number }>();
  const [version, setVersion] = useState(0);
  useLiveRefresh(() => setVersion((current) => current + 1), outsideRefresh);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void Promise.allSettled(
      key.split('\n').map((url) =>
        request<{ title: string; items: Omit<Story, 'source'>[] }>(`/widgets/feed?url=${encodeURIComponent(url)}`, { signal: controller.signal }),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const stories = results.flatMap((result, index) =>
        result.status === 'fulfilled'
          ? result.value.items.map((item) => ({ ...item, source: result.value.title || new URL(key.split('\n')[index]!).hostname }))
          : [],
      );
      stories.sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));
      setLoaded({ key, stories, failed: results.filter((result) => result.status === 'rejected').length });
    });
    return () => controller.abort();
  }, [key, request, version]);

  if (feeds.length === 0) return <WidgetEmpty action={configure && <Button label="Add feeds" onClick={configure} />} icon="mail" title="No news feeds yet" />;
  if (loaded?.key !== key) {
    return (
      <Placeholder label="Loading the news">
        <LinkRowsSkeleton className="gap-2" rows={3} />
      </Placeholder>
    );
  }
  return (
    <div className="grid gap-2">
      {loaded.stories.length === 0 && loaded.failed === 0 && <WidgetEmpty icon="mail" title="No stories yet" />}
      <ul className="m-0 grid list-none gap-2 p-0">
        {loaded.stories.slice(0, count).map((story) => (
          <li className="text-body" key={story.link}>
            <a className="text-ink no-underline hover:underline" href={story.link} rel="noopener noreferrer" target="_blank">
              {story.title}
            </a>
            <span className="block text-small text-muted">
              {story.source}
              {story.published ? ` · ${timeAgo(story.published)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {loaded.failed > 0 && (
        <Hint>{loaded.failed === feeds.length ? 'None of the feeds loaded.' : `${loaded.failed} of ${feeds.length} feeds didn’t load.`}</Hint>
      )}
    </div>
  );
}

export function NewsSettings({ onChange, settings }: SettingsProps) {
  return (
    <div className="grid gap-3">
      <AddressLines
        label="Feed addresses, one per line (up to 5)"
        max={5}
        onChange={(feeds) => onChange({ ...settings, feeds })}
        placeholder="https://example.com/feed.xml"
        values={stringsOf(settings.feeds)}
      />
      <Select
        className="max-w-xs"
        label="Stories to show"
        onChange={(count) => onChange({ ...settings, count: Number(count) })}
        options={[3, 5, 10].map((count) => ({ value: String(count), label: String(count) }))}
        size="small"
        value={String(typeof settings.count === 'number' ? settings.count : 5)}
      />
    </div>
  );
}
