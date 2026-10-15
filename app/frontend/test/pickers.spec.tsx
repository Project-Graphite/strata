import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryChips } from '../src/components/CategoryChips';
import { CurrencyField } from '../src/components/CurrencyField';
import { WidgetGallery } from '../src/dashboard/WidgetGallery';
import { applyTimeFormat, TimeField } from '../src/time';
import { pickTime } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Pickers', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    applyTimeFormat(undefined);
  });

  const options = () => [...container.querySelectorAll('[role="option"]')].map((option) => option.textContent);
  const type = (input: HTMLInputElement, text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('offers USD, EUR and EGP first and finds any other currency by searching', async () => {
    const chosen = vi.fn();
    await act(async () => root.render(<CurrencyField name="currency" onChange={chosen} value="SAR" />));
    await act(async () => container.querySelector<HTMLButtonElement>('[role="combobox"]')!.click());
    expect(options().map((option) => option!.slice(0, 3))).toEqual(['USD', 'EUR', 'EGP', 'SAR']);

    await type(container.querySelector<HTMLInputElement>('input[aria-label="Search currencies"]')!, 'yen');
    expect(options().map((option) => option!.slice(0, 3))).toContain('JPY');
    await type(container.querySelector<HTMLInputElement>('input[aria-label="Search currencies"]')!, 'kz');
    expect(options()[0]!.slice(0, 3)).toBe('KZT');
    await act(async () => (container.querySelector('[role="option"]') as HTMLElement).click());
    expect(chosen).toHaveBeenCalledWith('KZT');
  });

  it('sets a time on a digital clock with AM and PM, or on a 24-hour clock', async () => {
    const changed = vi.fn();
    applyTimeFormat('12h');
    await act(async () => root.render(<TimeField label="Start time" name="startTime" onChange={changed} />));
    expect(container.textContent).toContain('No time');
    await pickTime(container, 'Start time', '19:45');
    expect(changed).toHaveBeenLastCalledWith('19:45');
    expect(container.querySelector<HTMLInputElement>('input[name="startTime"]')!.value).toBe('19:45');
    expect(container.textContent).toMatch(/7:45\sPM/);

    applyTimeFormat('24h');
    await act(async () => root.render(<TimeField label="Start time" name="startTime" onChange={changed} />));
    await pickTime(container, 'Start time', '06:05');
    expect(changed).toHaveBeenLastCalledWith('06:05');
    expect(container.textContent).toContain('06:05');
  });

  it('shows the six most used categories first and the rest on request', async () => {
    const categories = ['groceries', 'eating out', 'transport', 'housing', 'utilities', 'health', 'shopping', 'other'].map((name, index) => ({
      name,
      colour: 'gray' as const,
      uses: name === 'other' ? 50 : index,
    }));
    const chosen = vi.fn();
    await act(async () => root.render(<CategoryChips categories={categories} onChange={chosen} value="groceries" />));
    const chips = () => [...container.querySelectorAll('button[aria-pressed]')].map((chip) => chip.textContent);
    expect(chips()).toEqual(['Groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Shopping', 'Other']);
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'More…')!.click());
    expect(chips()).toHaveLength(8);
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((chip) => chip.textContent === 'Eating out')!.click());
    expect(chosen).toHaveBeenCalledWith('eating out');
  });

  it('groups widgets, searches them and adds the chosen one', async () => {
    const added = vi.fn();
    await act(async () => root.render(<WidgetGallery onAdd={added} onClose={() => {}} />));
    const headings = () => [...document.querySelectorAll('dialog h3')].map((heading) => heading.textContent);
    expect(headings()).toEqual(['Your day', 'Money', 'Notes and links', 'Around you']);
    await type(document.querySelector<HTMLInputElement>('dialog input[aria-label="Search widgets"]')!, 'budget');
    expect(headings()).toEqual(['Money']);
    await act(async () => document.querySelector<HTMLButtonElement>('dialog .widget-choice')!.click());
    expect(added).toHaveBeenCalledWith('spending');
  });
});
