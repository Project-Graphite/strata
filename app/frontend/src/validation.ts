import { useState } from 'react';

export type Check = (value: string) => string | undefined;

export const required =
  (message: string): Check =>
  (value) =>
    value.trim() ? undefined : message;

export const atLeast =
  (length: number, message: string): Check =>
  (value) =>
    !value.trim() || value.trim().length >= length ? undefined : message;

export const atMost =
  (length: number, message: string): Check =>
  (value) =>
    value.length <= length ? undefined : message;

export const emailAddress: Check = (value) =>
  !value.trim() || /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(value.trim())
    ? undefined
    : 'Enter an email address like name@example.com.';

export const webAddress: Check = (value) =>
  !value.trim() || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(value.trim()) ? undefined : 'Enter a web address that starts with https://.';

export const httpsLink: Check = (value) => (!value.trim() || /^https:\/\/\S+$/.test(value.trim()) ? undefined : 'Use an https:// link.');

export const decimalNumber: Check = (value) =>
  !value.trim() || Number.isFinite(Number(value.replace(',', '.'))) ? undefined : 'Enter a number such as 12.5.';

export const moneyAmount: Check = (value) => (/^\d+([.,]\d{1,3})?$/.test(value.trim()) ? undefined : 'Enter an amount such as 9.99.');

export const notCardNumber: Check = (value) => (/\d(?:[ -]?\d){4}/.test(value) ? 'Use a label such as "Visa ending 1234", never a card number.' : undefined);

export const password = [
  required('Enter a password.'),
  atLeast(12, 'Use at least 12 characters.'),
  atMost(128, 'Use at most 128 characters.'),
];

export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function check(form: HTMLFormElement, checks: Record<string, Check[]>) {
    const values = new FormData(form);
    const found: Record<string, string> = {};
    for (const [name, rules] of Object.entries(checks)) {
      const value = String(values.get(name) ?? '');
      const message = rules.map((rule) => rule(value)).find(Boolean);
      if (message) found[name] = message;
    }
    setErrors(found);
    const [first] = Object.keys(found);
    if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return !first;
  }

  function field(name: string) {
    return {
      name,
      error: errors[name],
      onInput: () =>
        setErrors((current) => {
          if (!current[name]) return current;
          const { [name]: _cleared, ...rest } = current;
          return rest;
        }),
    };
  }

  return { check, errors, field };
}
