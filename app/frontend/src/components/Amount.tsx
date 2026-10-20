import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ExpenseDirection } from '../spending';
import { money } from '../subscriptions';

function useTween(target: number, enabled: boolean) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (!enabled) return;
    const from = current.current;
    const started = performance.now();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = requestAnimationFrame(function step(now) {
      const progress = still ? 1 : Math.min((now - started) / 500, 1);
      current.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, target]);

  return enabled ? Math.round(shown) : target;
}

export function Amount({ children, currency, danger, direction, minor, tween = false }: { children?: ReactNode; currency: string; danger?: boolean; direction?: ExpenseDirection | null; minor: number; tween?: boolean }) {
  const incoming = direction === 'received' || direction === 'refund';
  const shown = useTween(minor, tween);
  return (
    <span className={`shrink-0 tabular-nums ${danger ? 'text-danger' : incoming ? 'text-live' : 'text-ink'}`}>
      {incoming && '+'}
      {money(shown, currency)}
      {children}
    </span>
  );
}
