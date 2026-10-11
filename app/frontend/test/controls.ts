import { act } from 'react';

const named = (element: Element, name: string) =>
  element.getAttribute('aria-label') === name ||
  element.textContent === name ||
  document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent === name;

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
