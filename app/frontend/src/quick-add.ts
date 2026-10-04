import { addDays, dayKey } from './agenda';

export interface QuickTask {
  title: string;
  dueDate?: string;
  dueTime?: string;
  tagNames: string[];
  priority?: number;
}

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ordinaryWords = new Set(['sat', 'sun']);
const pad = (value: number) => String(value).padStart(2, '0');

function weekday(word: string) {
  return ordinaryWords.has(word) ? -1 : weekdays.findIndex((name) => word.length >= 3 && name.startsWith(word));
}

function month(word: string) {
  return word.length >= 3 ? months.findIndex((name) => name.startsWith(word)) : -1;
}

function time(word: string) {
  if (word === 'noon') return '12:00';
  const twelve = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(word);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return undefined;
    return `${pad((hour % 12) + (twelve[3] === 'pm' ? 12 : 0))}:${pad(minute)}`;
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(word);
  return clock && Number(clock[1]) < 24 && Number(clock[2]) < 60 ? `${pad(Number(clock[1]))}:${clock[2]}` : undefined;
}

function dayAndMonth(day: string, monthName: string, today: string) {
  const index = month(monthName);
  if (!/^\d{1,2}$/.test(day) || index < 0) return undefined;
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${pad(index + 1)}-${pad(Number(day))}`;
  if (dayKey(new Date(`${candidate}T00:00:00`)) !== candidate) return undefined;
  return candidate < today ? `${year + 1}${candidate.slice(4)}` : candidate;
}

function date(words: string[], today: string): [string, number] | undefined {
  const [first = '', second = '', third = ''] = words;
  if (first === 'today' || first === 'tonight') return [today, 1];
  if (first === 'tomorrow') return [addDays(today, 1), 1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(first) && dayKey(new Date(`${first}T00:00:00`)) === first) return [first, 1];
  if (first === 'in' && /^\d{1,3}$/.test(second) && /^(day|week)s?$/.test(third)) {
    return [addDays(today, Number(second) * (third.startsWith('week') ? 7 : 1)), 3];
  }
  const next = first === 'next' ? 1 : 0;
  const named = weekday(next ? second : first);
  if (named >= 0) {
    const ahead = (named - new Date(`${today}T00:00:00`).getDay() + 7) % 7;
    return [addDays(today, next && ahead === 0 ? 7 : ahead), 1 + next];
  }
  const dated = dayAndMonth(first, second, today) ?? dayAndMonth(second, first, today);
  return dated ? [dated, 2] : undefined;
}

export function parseQuickTask(text: string, knownTags: string[], now = new Date()): QuickTask {
  const today = dayKey(now);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const result: QuickTask = { title: '', tagNames: [] };
  for (let index = 0; index < words.length; ) {
    const word = words[index]!;
    const lower = word.toLowerCase();
    const connector = ['at', 'on', 'by'].includes(lower) ? 1 : 0;
    const rest = words.slice(index + connector).map((entry) => entry.toLowerCase());
    const tag = knownTags.find((name) => `#${name.toLowerCase()}` === lower);
    const priority = /^!([1-3])$/.exec(lower);
    const foundTime = result.dueTime === undefined ? time(rest[0] ?? '') : undefined;
    const foundDate = result.dueDate === undefined ? date(rest, today) : undefined;
    if (tag && !result.tagNames.includes(tag)) {
      result.tagNames.push(tag);
      index += 1;
    } else if (priority && result.priority === undefined) {
      result.priority = Number(priority[1]);
      index += 1;
    } else if (foundTime) {
      result.dueTime = foundTime;
      index += connector + 1;
    } else if (foundDate) {
      result.dueDate = foundDate[0];
      if (rest[0] === 'tonight' && result.dueTime === undefined) result.dueTime = '20:00';
      index += connector + foundDate[1];
    } else {
      kept.push(word);
      index += 1;
    }
  }
  if (result.dueTime && !result.dueDate) {
    result.dueDate = result.dueTime > `${pad(now.getHours())}:${pad(now.getMinutes())}` ? today : addDays(today, 1);
  }
  result.title = kept.join(' ');
  return result;
}

export function describeQuickTask(task: QuickTask) {
  return [
    task.dueDate &&
      `due ${new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${
        task.dueTime ? ` ${task.dueTime}` : ''
      }`,
    ...task.tagNames.map((name) => `tag ${name}`),
    task.priority && `${['', 'low', 'medium', 'high'][task.priority]} priority`,
  ]
    .filter(Boolean)
    .join(' · ');
}
