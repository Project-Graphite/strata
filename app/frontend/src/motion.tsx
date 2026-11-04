import useMediaQuery from '@mui/material/useMediaQuery';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function Reveal({ children, className = '', open }: { children: ReactNode; className?: string; open: boolean }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  return (
    <div
      className={`reveal ${className}`}
      data-open={open || undefined}
      inert={!open}
      onTransitionEnd={(event) => {
        if (!open && event.target === event.currentTarget) setShown(false);
      }}
    >
      <div>{shown && (open || !reduced) && children}</div>
    </div>
  );
}

export function useHeightMorph<T extends HTMLElement>() {
  const box = useRef<T>(null);
  const from = useRef<number>(undefined);
  const [turn, setTurn] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    const start = from.current;
    from.current = undefined;
    if (!element || start === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timing = { duration: parseFloat(token('--duration-slow')), easing: token('--ease-settle') };
    element.animate([{ height: `${start}px`, overflow: 'clip' }, { height: `${element.offsetHeight}px`, overflow: 'clip' }], timing);
    element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  }, [turn]);
  return {
    ref: box,
    morph: (change: () => void) => {
      from.current = box.current?.offsetHeight;
      change();
      setTurn((current) => current + 1);
    },
  };
}
