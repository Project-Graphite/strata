export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface DayRule {
  weekday: Weekday;
  ordinal: number | null;
}

export interface RepetitionRule {
  frequency: Frequency;
  interval: number;
  byDay: DayRule[];
  byMonthDay: number[];
  bySetPos: number[];
  count: number | null;
  until: Date | null;
  weekStart: Weekday;
}

export class RuleError extends Error {}

export const weekdays: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const frequencies = new Set<string>(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function integers(value: string, name: string, valid: (number: number) => boolean) {
  return value.split(',').map((part) => {
    if (!/^[+-]?\d+$/.test(part) || !valid(Number(part))) {
      throw new RuleError(`${name} has an invalid value: ${part}`);
    }
    return Number(part);
  });
}

function weekday(value: string, name: string) {
  if (!weekdays.includes(value as Weekday)) {
    throw new RuleError(`${name} has an invalid weekday: ${value}`);
  }
  return value as Weekday;
}

function untilDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(value);
  if (!match) {
    throw new RuleError('UNTIL must be a UTC date such as 20261231T235959Z');
  }
  const [, year, month, day, hour = '23', minute = '59', second = '59'] = match;
  return new Date(Date.UTC(+year!, +month! - 1, +day!, +hour, +minute, +second));
}

export function parseRule(text: string): RepetitionRule {
  const parts = new Map<string, string>();
  for (const part of text.trim().replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = part.split('=');
    if (!key || value === undefined || parts.has(key.toUpperCase())) {
      throw new RuleError(`Repetition rules are KEY=VALUE pairs separated by semicolons, each key once`);
    }
    parts.set(key.toUpperCase(), value.toUpperCase());
  }
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYSETPOS', 'COUNT', 'UNTIL', 'WKST']);
  const unknown = [...parts.keys()].filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new RuleError(`Strata does not support ${unknown.join(', ')} in repetition rules`);
  }
  const frequency = parts.get('FREQ');
  if (!frequency || !frequencies.has(frequency)) {
    throw new RuleError('FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY');
  }
  if (parts.has('COUNT') && parts.has('UNTIL')) {
    throw new RuleError('A repetition rule can have COUNT or UNTIL, not both');
  }
  const byDay = parts.has('BYDAY')
    ? parts
        .get('BYDAY')!
        .split(',')
        .map((part) => {
          const match = /^([+-]?\d{1,2})?([A-Z]{2})$/.exec(part);
          if (!match) throw new RuleError(`BYDAY has an invalid value: ${part}`);
          const ordinal = match[1] === undefined ? null : Number(match[1]);
          if (ordinal !== null && (ordinal === 0 || Math.abs(ordinal) > 5 || frequency !== 'MONTHLY')) {
            throw new RuleError(`BYDAY ordinals such as ${part} work only with FREQ=MONTHLY, from -5 to 5`);
          }
          return { weekday: weekday(match[2]!, 'BYDAY'), ordinal };
        })
    : [];
  const byMonthDay = parts.has('BYMONTHDAY')
    ? integers(parts.get('BYMONTHDAY')!, 'BYMONTHDAY', (day) => day !== 0 && Math.abs(day) <= 31)
    : [];
  const bySetPos = parts.has('BYSETPOS')
    ? integers(parts.get('BYSETPOS')!, 'BYSETPOS', (position) => position !== 0 && Math.abs(position) <= 366)
    : [];
  if (frequency === 'YEARLY' && (byDay.length > 0 || byMonthDay.length > 0)) {
    throw new RuleError('Yearly rules repeat on the start date, without BYDAY or BYMONTHDAY');
  }
  if (frequency === 'WEEKLY' && byMonthDay.length > 0) {
    throw new RuleError('BYMONTHDAY does not apply to weekly rules');
  }
  if (bySetPos.length > 0 && (frequency === 'DAILY' || frequency === 'YEARLY' || (byDay.length === 0 && byMonthDay.length === 0))) {
    throw new RuleError('BYSETPOS needs a weekly or monthly rule with BYDAY or BYMONTHDAY');
  }
  return {
    frequency: frequency as Frequency,
    interval: parts.has('INTERVAL') ? integers(parts.get('INTERVAL')!, 'INTERVAL', (value) => value >= 1 && value <= 999)[0]! : 1,
    byDay,
    byMonthDay,
    bySetPos,
    count: parts.has('COUNT') ? integers(parts.get('COUNT')!, 'COUNT', (value) => value >= 1 && value <= 10_000)[0]! : null,
    until: parts.has('UNTIL') ? untilDate(parts.get('UNTIL')!) : null,
    weekStart: parts.has('WKST') ? weekday(parts.get('WKST')!, 'WKST') : 'MO',
  };
}

export function formatRule(rule: RepetitionRule) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const until = rule.until;
  return [
    `FREQ=${rule.frequency}`,
    rule.interval !== 1 && `INTERVAL=${rule.interval}`,
    rule.byDay.length > 0 && `BYDAY=${rule.byDay.map((day) => `${day.ordinal ?? ''}${day.weekday}`).join(',')}`,
    rule.byMonthDay.length > 0 && `BYMONTHDAY=${rule.byMonthDay.join(',')}`,
    rule.bySetPos.length > 0 && `BYSETPOS=${rule.bySetPos.join(',')}`,
    rule.count !== null && `COUNT=${rule.count}`,
    until &&
      `UNTIL=${until.getUTCFullYear()}${pad(until.getUTCMonth() + 1)}${pad(until.getUTCDate())}T${pad(until.getUTCHours())}${pad(until.getUTCMinutes())}${pad(until.getUTCSeconds())}Z`,
    rule.weekStart !== 'MO' && `WKST=${rule.weekStart}`,
  ]
    .filter(Boolean)
    .join(';');
}
