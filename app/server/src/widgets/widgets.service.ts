import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { parseFeed, type Feed } from './feed';
import { fetchPublic, statusOfPublic, UnsafeUrlError } from './safe-fetch';

const cacheSeconds = 30 * 60;
const statusCacheSeconds = 60;

interface Forecast {
  current: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

interface Geocoding {
  results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
}

const round = (value: number, places: number) => Number(value.toFixed(places));

@Injectable()
export class WidgetsService {
  constructor(private readonly redis: RedisService) {}

  async weather(latitude: number, longitude: number, unit: 'celsius' | 'fahrenheit') {
    const lat = round(latitude, 1);
    const lon = round(longitude, 1);
    return this.cached(`widget:weather:${lat}:${lon}:${unit}`, async () => {
      const query = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: 'temperature_2m,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        forecast_days: '7',
        temperature_unit: unit,
        wind_speed_unit: unit === 'fahrenheit' ? 'mph' : 'kmh',
      });
      const forecast = await this.openMeteo<Forecast>(`https://api.open-meteo.com/v1/forecast?${query}`);
      return {
        unit,
        current: {
          temperature: Math.round(forecast.current.temperature_2m),
          code: forecast.current.weather_code,
          wind: Math.round(forecast.current.wind_speed_10m),
        },
        daily: forecast.daily.time.map((date, index) => ({
          date,
          code: forecast.daily.weather_code[index] ?? 0,
          high: Math.round(forecast.daily.temperature_2m_max[index] ?? 0),
          low: Math.round(forecast.daily.temperature_2m_min[index] ?? 0),
        })),
      };
    });
  }

  async places(name: string) {
    return this.cached(`widget:places:${name.toLowerCase()}`, async () => {
      const query = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
      const found = await this.openMeteo<Geocoding>(`https://geocoding-api.open-meteo.com/v1/search?${query}`);
      return (found.results ?? []).map((place) => ({
        name: [place.name, place.admin1, place.country].filter((part, index, all) => part && all.indexOf(part) === index).join(', '),
        latitude: round(place.latitude, 2),
        longitude: round(place.longitude, 2),
      }));
    });
  }

  async feed(url: string) {
    return this.cached<Feed>(`widget:feed:${url}`, async () => {
      let body: string;
      try {
        body = await fetchPublic(url, {
          accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
          maxBytes: 2 * 1024 * 1024,
          timeoutMs: 5_000,
        });
      } catch (error) {
        if (error instanceof UnsafeUrlError) throw new BadRequestException(error.message);
        throw new BadGatewayException(`Could not read that feed: ${(error as Error).message}`);
      }
      try {
        return parseFeed(body);
      } catch (error) {
        throw new BadGatewayException((error as Error).message);
      }
    });
  }

  async status(url: string) {
    return this.cached(
      `widget:status:${url}`,
      async () => {
        const started = Date.now();
        try {
          const status = await statusOfPublic(url, 5_000);
          return { up: status >= 200 && status < 400, status, ms: Date.now() - started, error: null };
        } catch (error) {
          if (error instanceof UnsafeUrlError) throw new BadRequestException(error.message);
          return { up: false, status: null, ms: Date.now() - started, error: (error as Error).message };
        }
      },
      statusCacheSeconds,
    );
  }

  private async openMeteo<T>(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (!response?.ok) throw new BadGatewayException('The weather service is not answering right now');
    return (await response.json()) as T;
  }

  private async cached<T>(key: string, load: () => Promise<T>, seconds = cacheSeconds) {
    const hit = await this.redis.run((client) => client.get(key));
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    await this.redis.run((client) => client.set(key, JSON.stringify(value), { EX: seconds }));
    return value;
  }
}
