import { act } from 'react';

const named = (element: Element, name: string) =>
  element.getAttribute('aria-label') === name ||
  element.textContent === name ||
  (element.getAttribute('aria-labelledby') ?? '').split(' ').some((id) => document.getElementById(id)?.textContent === name);

export async function choose(root: ParentNode, name: string, option: string) {
  const trigger = [...root.querySelectorAll<HTMLElement>('[role="combobox"]')].find((element) => named(element, name))!;
  await act(async () => trigger.click());
  const choice = [...root.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.startsWith(option))!;
  await act(async () => choice.click());
}

export async function chooseFromMenu(root: ParentNode, trigger: string, item: string) {
  const button = [...root.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"]')].find((element) => named(element, trigger))!;
  await act(async () => button.click());
  const entry = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent === item)!;
  await act(async () => entry.click());
}

export async function pickDay(root: ParentNode, name: string, day: string) {
  const trigger = [...root.querySelectorAll<HTMLElement>('button[aria-haspopup="dialog"]')].find((element) => named(element, name))!;
  await act(async () => trigger.click());
  for (let step = 0; step < 24 && !root.querySelector(`[data-day="${day}"]`); step += 1) {
    const later = day > root.querySelector<HTMLElement>('[data-day]')!.dataset.day!;
    await act(async () => root.querySelector<HTMLButtonElement>(`button[aria-label="${later ? 'Next month' : 'Previous month'}"]`)!.click());
  }
  await act(async () => root.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)!.click());
}

export async function pickChip(root: ParentNode, label: string) {
  await act(async () => [...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((chip) => chip.textContent === label)!.click());
}

export async function pickFromGrid(root: ParentNode, name: string, day: string) {
  const trigger = [...root.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]')].find((element) => named(element, name))!;
  await act(async () => trigger.click());
  await act(async () => [...root.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === day)!.click());
}

export async function pickTime(root: ParentNode, name: string, time: string) {
  const field = [...root.querySelectorAll<HTMLElement>('.field-label')].find((element) => element.firstElementChild?.textContent === name)!;
  await act(async () => field.querySelector('button')!.click());
  const dialog = [...document.querySelectorAll('dialog')].at(-1)!;
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const twelve = Boolean(dialog.querySelector('[role="radiogroup"]'));
  const type = async (label: string, value: number) => {
    const digits = dialog.querySelector(`[role="spinbutton"][aria-label="${label}"]`)!;
    for (const key of String(value).padStart(2, '0')) await act(async () => void digits.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  };
  await type('Hours', twelve ? hours % 12 || 12 : hours);
  await type('Minutes', minutes);
  if (twelve) await act(async () => [...dialog.querySelectorAll<HTMLElement>('[role="radio"]')].find((half) => half.textContent === (hours >= 12 ? 'PM' : 'AM'))!.click());
  await act(async () => [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Set time')!.click());
}
