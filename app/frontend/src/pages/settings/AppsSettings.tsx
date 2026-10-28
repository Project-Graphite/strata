import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link, useLocation, type Location } from 'react-router';
import { Banner, Icon } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { appCatalogue, enabledApps } from '../../apps';
import { useAction } from '../../useAction';

interface Drag {
  key: string;
  touch: boolean;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  active: boolean;
  timer?: number;
}

const longPressMs = 300;
const dragSlop = 6;
const labelOf = (key: string) => appCatalogue.find((app) => app.key === key)!.label;

export function AppsSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const state = location.state as { app: string; from: Location } | null;
  const asked = appCatalogue.find((app) => app.key === state?.app);
  const keys = enabledApps(auth.user?.features).map((app) => app.key);
  const grid = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag>(undefined);
  const dropped = useRef(false);
  const [order, setOrder] = useState<string[]>();
  const [pointer, setPointer] = useState<{ key: string; x: number; y: number }>();
  const [focusing, setFocusing] = useState<string>();
  const shown = order ?? keys;
  const tiles = [...shown.map((key) => appCatalogue.find((app) => app.key === key)!), ...appCatalogue.filter((app) => !shown.includes(app.key))];

  useEffect(() => {
    const list = grid.current!;
    const holdStill = (event: TouchEvent) => {
      if (drag.current?.active) event.preventDefault();
    };
    list.addEventListener('touchmove', holdStill, { passive: false });
    return () => list.removeEventListener('touchmove', holdStill);
  }, []);

  useLayoutEffect(() => {
    const tile = pointer && grid.current!.querySelector<HTMLElement>(`[data-app="${pointer.key}"]`);
    if (!tile) return;
    const origin = grid.current!.getBoundingClientRect();
    tile.style.transform = `translate(${pointer.x - origin.left - drag.current!.grabX - tile.offsetLeft}px, ${pointer.y - origin.top - drag.current!.grabY - tile.offsetTop}px)`;
    return () => {
      tile.style.transform = '';
    };
  }, [pointer, shown]);

  useEffect(() => {
    if (!focusing || saving.busy) return;
    grid.current!.querySelector<HTMLButtonElement>(`[data-app="${focusing}"] button`)?.focus();
    setFocusing(undefined);
  }, [focusing, saving.busy]);

  function save(features: string[], done: string) {
    void saving
      .run(async () => {
        const saved = await auth.request<{ features: string[] }>('/me', { method: 'PATCH', body: JSON.stringify({ features }) });
        auth.updateUser({ features: saved.features });
        return done;
      }, 'Could not change your apps')
      .then(() => setOrder(undefined));
  }

  function toggle(key: string) {
    if (dropped.current) return;
    const on = !keys.includes(key);
    save(on ? [...keys, key] : keys.filter((shown) => shown !== key), `Turned ${on ? 'on' : 'off'} ${labelOf(key)}.`);
  }

  function moveTo(key: string, index: number) {
    const next = shown.filter((shown) => shown !== key);
    next.splice(index, 0, key);
    return next;
  }

  function start(event: PointerEvent<HTMLLIElement>, key: string) {
    if (saving.busy || !keys.includes(key) || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const touch = event.pointerType === 'touch';
    const begun: Drag = { key, touch, startX: event.clientX, startY: event.clientY, grabX: event.clientX - bounds.left, grabY: event.clientY - bounds.top, active: false };
    if (touch) {
      begun.timer = window.setTimeout(() => {
        begun.active = true;
        navigator.vibrate?.(10);
        setPointer({ key, x: begun.startX, y: begun.startY });
      }, longPressMs);
    }
    drag.current = begun;
  }

  function follow(event: PointerEvent<HTMLLIElement>) {
    const current = drag.current;
    if (!current) return;
    const far = Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > dragSlop;
    if (!current.active) {
      if (!far) return;
      if (current.touch) return stop();
      current.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const over = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-app]')?.dataset.app)
      .find((key) => key && key !== current.key);
    if (over && shown.includes(over)) setOrder(moveTo(current.key, shown.indexOf(over)));
    setPointer({ key: current.key, x: event.clientX, y: event.clientY });
  }

  function stop() {
    const current = drag.current;
    if (!current) return;
    window.clearTimeout(current.timer);
    drag.current = undefined;
    setPointer(undefined);
    if (!current.active) return;
    dropped.current = true;
    window.setTimeout(() => (dropped.current = false));
    if (shown.join() === keys.join()) setOrder(undefined);
    else save(shown, `Moved ${labelOf(current.key)}.`);
  }

  function nudge(event: KeyboardEvent, key: string) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    const index = keys.indexOf(key) + (step ?? 0);
    if (!event.altKey || !step || !keys.includes(key) || index < 0 || index >= keys.length) return;
    event.preventDefault();
    const next = moveTo(key, index);
    setOrder(next);
    setFocusing(key);
    save(next, `Moved ${labelOf(key)} ${step < 0 ? 'earlier' : 'later'}.`);
  }

  return (
    <Section
      description="Tap an app to turn it on or off; turning one off hides it and keeps everything in it. Drag the ones that are on, or hold one on a phone, to set their order in your menu."
      title="Apps"
    >
      {asked &&
        (keys.includes(asked.key) ? (
          <Banner>
            <Link to={`${state!.from.pathname}${state!.from.search}`}>Open {asked.label}</Link>
          </Banner>
        ) : (
          <Banner>Turn on {asked.label} to open it.</Banner>
        ))}
      <ul aria-label="Apps" className="app-tiles" ref={grid}>
        {tiles.map((app) => {
          const on = shown.includes(app.key);
          return (
            <li
              className={`app-tile ${on ? '' : 'app-tile-off'} ${pointer?.key === app.key ? 'app-tile-moving' : ''}`}
              data-app={app.key}
              key={app.key}
              onContextMenu={(event) => drag.current?.touch && event.preventDefault()}
              onPointerCancel={stop}
              onPointerDown={(event) => start(event, app.key)}
              onPointerMove={follow}
              onPointerUp={stop}
            >
              <button
                aria-describedby={`app-${app.key}-about`}
                aria-pressed={on}
                disabled={saving.busy}
                onClick={() => toggle(app.key)}
                onKeyDown={(event) => nudge(event, app.key)}
                title={app.description}
                type="button"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="app-tile-icon">
                    <Icon name={app.icon} size={18} />
                  </span>
                  <span aria-hidden="true" className="app-tile-check">
                    {on && <Icon name="check-mark" size={12} />}
                  </span>
                </span>
                <span className="app-tile-label">{app.label}</span>
                <span className="sr-only" id={`app-${app.key}-about`}>
                  {app.description}
                  {on && ' Alt and an arrow key moves it.'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
