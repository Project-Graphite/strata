import type { SelectOption } from '@project-graphite/ui';

function offsetOf(zone: string) {
  return new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? '';
}

let zones: SelectOption[] | undefined;

export function timeZoneOptions(current?: string | null) {
  zones ??= [...new Set(['Etc/UTC', ...Intl.supportedValuesOf('timeZone')])].map((zone) => {
    const parts = zone.split('/');
    return { value: zone, label: parts.at(-1)!.replaceAll('_', ' '), hint: `${parts.length > 1 ? `${parts.slice(0, -1).join(' / ').replaceAll('_', ' ')} · ` : ''}${offsetOf(zone)}` };
  });
  return current && !zones.some((option) => option.value === current) ? [{ value: current, label: current }, ...zones] : zones;
}

const currencyNames = new Intl.DisplayNames(undefined, { type: 'currency' });

export const currencyName = (code: string) => currencyNames.of(code) ?? code;

export const allCurrencies = Intl.supportedValuesOf('currency');
