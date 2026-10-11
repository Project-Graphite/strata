export interface GiftIdea {
  id: string;
  text: string;
  done: boolean;
}

export interface Person {
  id: string;
  spaceId: string;
  spaceName: string;
  name: string;
  relationship: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  birthYear: number | null;
  nextBirthday: string | null;
  turning: number | null;
  email: string | null;
  phone: string | null;
  notes: string;
  giftIdeas: GiftIdea[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonDetail extends Person {
  events: { linkId: string; ownLink: boolean; id: string; title: string; startsOn: string; startTime: string | null }[];
}

const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index, 1))));

export const monthOptions = monthNames.map((label, index) => ({ value: String(index + 1), label }));
export const dayOptions = Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));

export function birthdayText(person: Pick<Person, 'birthdayDay' | 'birthdayMonth' | 'birthYear'>) {
  if (!person.birthdayDay || !person.birthdayMonth) return null;
  return `${person.birthdayDay} ${monthNames[person.birthdayMonth - 1]}${person.birthYear ? ` ${person.birthYear}` : ''}`;
}

export function nextBirthdayText(person: Person, today: string) {
  if (!person.nextBirthday) return null;
  const days = Math.round((Date.parse(person.nextBirthday) - Date.parse(today)) / 86_400_000);
  const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${person.nextBirthday}T00:00:00Z`));
  return person.turning ? `${when} · turns ${person.turning}` : when;
}
