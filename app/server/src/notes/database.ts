export const propertyTypes = ['text', 'number', 'select', 'multiSelect', 'date', 'checkbox', 'person', 'link'] as const;
export const databaseViews = ['table', 'board', 'list', 'calendar'] as const;

export type PropertyType = (typeof propertyTypes)[number];

export interface PropertyOption {
  id: string;
  name: string;
  color: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options?: PropertyOption[];
}

export const propertyRules: Record<PropertyType, string> = {
  text: 'is at most 2,000 characters long',
  number: 'needs a number',
  select: 'needs one of its options',
  multiSelect: 'needs some of its options',
  date: 'needs a date',
  checkbox: 'is either ticked or not',
  person: 'needs a member of this space',
  link: 'needs an http:// or https:// link',
};

export function valueMap(entries: { propertyId: string; value: unknown }[]) {
  return Object.fromEntries(entries.map((entry) => [entry.propertyId, entry.value]));
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return datePattern.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validLink(value: string) {
  try {
    return value.length <= 2000 && ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function propertyValue(property: Property, value: unknown, members: Set<string>): unknown {
  const options = new Set((property.options ?? []).map((option) => option.id));
  switch (property.type) {
    case 'text':
      return typeof value === 'string' && value.trim().length <= 2000 ? value.trim() : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'select':
      return typeof value === 'string' && options.has(value) ? value : undefined;
    case 'multiSelect':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && options.has(entry)) ? [...new Set(value)] : undefined;
    case 'date':
      return typeof value === 'string' && validDate(value) ? value : undefined;
    case 'checkbox':
      return typeof value === 'boolean' ? value : undefined;
    case 'person':
      return typeof value === 'string' && members.has(value) ? value : undefined;
    case 'link':
      return typeof value === 'string' && validLink(value.trim()) ? value.trim() : undefined;
  }
}
