import type { Task } from './tasks';
import { formatRange } from './time';

export interface Trip {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  destination: string;
  startsOn: string;
  endsOn: string;
  budgetMinor: number | null;
  currency: string | null;
  when: 'upcoming' | 'now' | 'past';
  createdAt: string;
  updatedAt: string;
}

export interface TripDetail extends Trip {
  itinerary: { linkId: string; id: string; title: string; startsOn: string; startTime: string | null; endsOn: string; endTime: string | null; location: string | null }[];
  packing: { id: string; title: string; tasks: Task[] } | null;
  documents: { linkId: string; id: string; title: string; mimeType: string | null; sizeBytes: number | null }[];
  pages: { linkId: string; id: string; title: string }[];
  expenses: { linkId: string; id: string; title: string; amountMinor: number; currency: string; spentOn: string; category: string }[];
  spending: { currency: string; spentMinor: number; missing: string[] };
}

export const tripDates = (trip: Pick<Trip, 'startsOn' | 'endsOn'>) => formatRange(trip.startsOn, trip.endsOn);

export function countdown(trip: Trip, today: string) {
  if (trip.when === 'now') return 'Happening now';
  if (trip.when === 'past') return null;
  const days = Math.round((Date.parse(trip.startsOn) - Date.parse(today)) / 86_400_000);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}
