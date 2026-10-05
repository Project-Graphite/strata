import { afterEach, describe, expect, it, vi } from 'vitest';
import { integrationApp } from './harness';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Home widget data against Postgres and Redis', () => {
  const strata = integrationApp();
  const { member } = strata;
  const realFetch = globalThis.fetch;

  afterEach(() => vi.restoreAllMocks());

  function stubOpenMeteo() {
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('https://api.open-meteo.com/')) {
        seen.push(url);
        return Promise.resolve(
          json({
            current: { temperature_2m: 17.6, weather_code: 3, wind_speed_10m: 11.2 },
            daily: { time: ['2026-10-05', '2026-10-06'], weather_code: [3, 61], temperature_2m_max: [19.4, 16.1], temperature_2m_min: [11.2, 9.8] },
          }),
        );
      }
      if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
        seen.push(url);
        return Promise.resolve(json({ results: [{ name: 'Lisbon', admin1: 'Lisbon', country: 'Portugal', latitude: 38.71667, longitude: -9.13333 }] }));
      }
      return realFetch(input, init);
    });
    return seen;
  }

  it('serves weather for a rounded location and place search to signed-in people only', async () => {
    const owner = await member('forecaster');
    const seen = stubOpenMeteo();

    expect((await strata.anonymous('GET', '/widgets/weather?latitude=38.7166&longitude=-9.1333')).status).toBe(401);
    expect((await owner.call('GET', '/widgets/weather?latitude=120&longitude=0')).status).toBe(400);

    const unknown = await owner.call('GET', `/widgets/weather?latitude=38.71667&longitude=-9.13333&unit=celsius&nonce=${owner.id}`);
    expect(unknown.status).toBe(400);

    const weather = await owner.call('GET', '/widgets/weather?latitude=38.71667&longitude=-9.13333&unit=celsius');
    expect(weather.body).toEqual({
      unit: 'celsius',
      current: { temperature: 18, code: 3, wind: 11 },
      daily: [
        { date: '2026-10-05', code: 3, high: 19, low: 11 },
        { date: '2026-10-06', code: 61, high: 16, low: 10 },
      ],
    });
    await owner.call('GET', '/widgets/weather?latitude=38.74&longitude=-9.12&unit=celsius');
    const forecasts = seen.filter((url) => url.includes('/v1/forecast'));
    expect(forecasts.every((url) => url.includes('latitude=38.7&longitude=-9.1&'))).toBe(true);

    const places = await owner.call('GET', '/widgets/places?name=Lisbon');
    expect(places.body).toEqual([{ name: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.13 }]);
    expect((await owner.call('GET', '/widgets/places?name=L')).status).toBe(400);
  });

  it('refuses feed addresses that are not public https', async () => {
    const reader = await member('reader');
    for (const url of ['http://example.com/feed', 'https://localhost/feed', 'https://127.0.0.1/rss', 'https://169.254.169.254/latest', 'https://user:pw@example.com/feed']) {
      const reply = await reader.call('GET', `/widgets/feed?url=${encodeURIComponent(url)}`);
      expect({ url, status: reply.status }).toEqual({ url, status: 400 });
    }
    expect((await strata.anonymous('GET', '/widgets/feed?url=https%3A%2F%2Fexample.com%2Ffeed')).status).toBe(401);
  });
});
