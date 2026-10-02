export const dayMs = 24 * 60 * 60 * 1000;

export function dateText(date: Date): string;
export function dateText(date: Date | null): string | null;
export function dateText(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function dateValue(text: string) {
  return new Date(`${text}T00:00:00Z`);
}

export function localDate(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
