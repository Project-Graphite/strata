import { useEffect, useState } from 'react';
import { errorMessage, ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { useResource } from '../useResource';
import { Empty, type SettingsProps, type WidgetProps } from './widget-parts';

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

export function Weather({ settings }: WidgetProps) {
  const place = placeOf(settings);
  const unit = settings.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const forecast = useResource<Forecast>(place ? `/widgets/weather?latitude=${place.latitude}&longitude=${place.longitude}&unit=${unit}` : null, true);

  if (!place) return <Empty>Choose a place in this widget's settings.</Empty>;
  if (forecast.error) return <LoadError compact error={forecast.error} onRetry={forecast.reload} />;
  if (!forecast.data) return <ListSkeleton label="Loading the weather" rows={2} />;
  const { current, daily } = forecast.data;
  return (
    <div className="grid gap-3">
      <div>
        <p className="m-0 text-3xl text-ink">
          {current.temperature}°{unit === 'fahrenheit' ? 'F' : 'C'}
        </p>
        <p className="mono-sm m-0 mt-1 text-faint">
          {condition(current.code)} · {place.name.split(',')[0]} · wind {current.wind} {unit === 'fahrenheit' ? 'mph' : 'km/h'}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center text-xs">
        {daily.map((day) => (
          <li className="grid gap-0.5" key={day.date} title={condition(day.code)}>
            <span className="text-faint">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            <span className="text-ink">{day.high}°</span>
            <span className="text-faint">{day.low}°</span>
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
      <p className="m-0 text-sm text-muted">{place ? `Showing ${place.name}.` : 'No place chosen yet.'}</p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search for a place"
          className="min-w-0 flex-1"
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
        <button className="secondary-button px-3 py-2 text-sm" disabled={query.trim().length < 2} onClick={() => void search()} type="button">
          Search
        </button>
        {'geolocation' in navigator && (
          <button className="secondary-button px-3 py-2 text-sm" onClick={here} type="button">
            Use my location
          </button>
        )}
      </div>
      {found && (
        <ul className="m-0 grid list-none gap-1 p-0">
          {found.length === 0 && <li className="text-sm text-muted">No places match.</li>}
          {found.map((option) => (
            <li key={`${option.latitude},${option.longitude}`}>
              <button
                className="text-button text-left text-sm"
                onClick={() => {
                  onChange({ ...settings, place: option });
                  setFound(undefined);
                  setQuery('');
                }}
                type="button"
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="m-0 text-sm text-danger">{problem}</p>}
      <label className="field-label max-w-xs">
        Units
        <select onChange={(event) => onChange({ ...settings, unit: event.currentTarget.value })} value={settings.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'}>
          <option value="celsius">Celsius, km/h</option>
          <option value="fahrenheit">Fahrenheit, mph</option>
        </select>
      </label>
    </div>
  );
}

function feedsOf(settings: Record<string, unknown>) {
  return Array.isArray(settings.feeds) ? (settings.feeds as unknown[]).filter((feed): feed is string => typeof feed === 'string') : [];
}

export function News({ settings }: WidgetProps) {
  const { request } = useAuth();
  const feeds = feedsOf(settings);
  const count = typeof settings.count === 'number' ? settings.count : 5;
  const key = feeds.join('\n');
  const [loaded, setLoaded] = useState<{ key: string; stories: Story[]; failed: number }>();

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
  }, [key, request]);

  if (feeds.length === 0) return <Empty>Add feed addresses in this widget's settings.</Empty>;
  if (loaded?.key !== key) return <ListSkeleton label="Loading the news" rows={3} />;
  return (
    <div className="grid gap-2">
      {loaded.stories.length === 0 && loaded.failed === 0 && <Empty>No stories yet.</Empty>}
      <ul className="m-0 grid list-none gap-2 p-0">
        {loaded.stories.slice(0, count).map((story) => (
          <li className="text-sm" key={story.link}>
            <a className="text-ink no-underline hover:underline" href={story.link} rel="noopener noreferrer" target="_blank">
              {story.title}
            </a>
            <span className="mono-sm block text-faint">
              {story.source}
              {story.published ? ` · ${timeAgo(story.published)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {loaded.failed > 0 && (
        <p className="m-0 text-xs text-faint">
          {loaded.failed === feeds.length ? 'None of the feeds loaded.' : `${loaded.failed} of ${feeds.length} feeds didn’t load.`}
        </p>
      )}
    </div>
  );
}

export function NewsSettings({ onChange, settings }: SettingsProps) {
  const [text, setText] = useState(feedsOf(settings).join('\n'));
  return (
    <div className="grid gap-3">
      <label className="field-label">
        Feed addresses, one per line (up to 5)
        <textarea
          onChange={(event) => {
            setText(event.currentTarget.value);
            const feeds = event.currentTarget.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 5);
            onChange({ ...settings, feeds });
          }}
          placeholder="https://example.com/feed.xml"
          rows={4}
          value={text}
        />
      </label>
      <label className="field-label max-w-xs">
        Stories to show
        <select onChange={(event) => onChange({ ...settings, count: Number(event.currentTarget.value) })} value={typeof settings.count === 'number' ? settings.count : 5}>
          {[3, 5, 10].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
