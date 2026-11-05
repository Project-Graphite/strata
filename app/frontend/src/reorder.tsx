import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export function moved<T>(list: readonly T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

const sameOrder = (first: readonly string[], second: readonly string[]) => first.length === second.length && first.every((key, index) => key === second[index]);

interface Grab {
  key: string;
  index: number;
  pointer?: number;
}

export function useReorder({ keys, label, onCommit }: { keys: string[]; label: (key: string) => string; onCommit: (keys: string[]) => void }) {
  const [grab, setGrab] = useState<Grab>();
  const [announcement, setAnnouncement] = useState('');
  const order = grab ? moved(keys, keys.indexOf(grab.key), grab.index) : keys;
  const position = (index: number) => `position ${index + 1} of ${keys.length}`;

  function drop() {
    setGrab(undefined);
    if (!grab) return;
    setAnnouncement(`Dropped ${label(grab.key)} at ${position(grab.index)}.`);
    if (!sameOrder(order, keys)) onCommit(order);
  }

  function cancel() {
    if (grab) setAnnouncement(`Put ${label(grab.key)} back at ${position(keys.indexOf(grab.key))}.`);
    setGrab(undefined);
  }

  function handle(key: string) {
    const grabbed = grab?.key === key;
    return {
      'aria-pressed': grabbed,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (grabbed) drop();
          else {
            setGrab({ key, index: keys.indexOf(key) });
            setAnnouncement(`Picked up ${label(key)} at ${position(keys.indexOf(key))}. Use the arrow keys to move it, Space to drop it and Escape to cancel.`);
          }
        } else if (grabbed && (event.key === 'Escape' || event.key === 'Tab')) {
          if (event.key === 'Escape') event.preventDefault();
          cancel();
        } else if (grabbed && ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : grab.index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1);
          const next = Math.max(0, Math.min(keys.length - 1, index));
          setGrab({ ...grab, index: next });
          const moving = event.currentTarget;
          requestAnimationFrame(() => moving.focus());
          setAnnouncement(`${label(key)} is at ${position(next)}.`);
        }
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        setGrab({ key, index: keys.indexOf(key), pointer: event.pointerId });
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!grabbed || grab.pointer !== event.pointerId) return;
        const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-reorder-key]')?.dataset.reorderKey;
        if (over && over !== key) setGrab({ ...grab, index: order.indexOf(over) });
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => grabbed && grab.pointer === event.pointerId && drop(),
      onPointerCancel: () => grabbed && cancel(),
    };
  }

  return {
    order,
    grabbed: grab?.key,
    handle,
    item: (key: string) => ({ 'data-reorder-key': key, 'data-dragging': grab?.key === key || undefined }),
    status: (
      <span aria-live="assertive" className="sr-only">
        {announcement}
      </span>
    ),
  };
}
