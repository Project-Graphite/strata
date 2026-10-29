import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';

const swipeDistance = 96;

export function useSwipe({ enabled, onLeft, onRight }: { enabled: boolean; onLeft?: () => void; onRight?: () => void }) {
  const start = useRef<{ x: number; y: number }>(undefined);
  const swiped = useRef(false);
  const [offset, setOffset] = useState(0);
  const settle = () => {
    start.current = undefined;
    setOffset(0);
  };
  return {
    offset,
    passed: Math.abs(offset) >= swipeDistance,
    props: {
      'data-swiping': offset !== 0 || undefined,
      style: (offset !== 0 ? { '--swipe': `${offset}px` } : {}) as CSSProperties,
      onClickCapture: (event: MouseEvent) => {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      onPointerCancel: settle,
      onPointerDown: (event: PointerEvent) => {
        swiped.current = false;
        if (enabled && event.pointerType === 'touch') start.current = { x: event.clientX, y: event.clientY };
      },
      onPointerMove: (event: PointerEvent) => {
        if (!start.current) return;
        const across = event.clientX - start.current.x;
        if (offset === 0 && Math.abs(event.clientY - start.current.y) > Math.abs(across)) return settle();
        if ((across > 8 && onRight) || (across < -8 && onLeft)) setOffset(Math.max(-swipeDistance * 1.5, Math.min(across, swipeDistance * 1.5)));
      },
      onPointerUp: () => {
        if (Math.abs(offset) > 8) swiped.current = true;
        if (offset >= swipeDistance) onRight?.();
        if (offset <= -swipeDistance) onLeft?.();
        settle();
      },
    },
  };
}
