import { useEffect, useRef, useState } from 'react';

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker>();
  const reloading = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const { serviceWorker } = navigator;
    const offer = (worker: ServiceWorker | null) => {
      if (worker && serviceWorker.controller) setWaiting(worker);
    };
    void serviceWorker.register('/sw.js').then((registration) => {
      offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => installing.state === 'installed' && offer(installing));
      });
    });
    const reload = () => reloading.current && window.location.reload();
    serviceWorker.addEventListener('controllerchange', reload);
    return () => serviceWorker.removeEventListener('controllerchange', reload);
  }, []);

  if (!waiting) return null;
  return (
    <div className="snackbar-region" role="status">
      <div className="snackbar">
        <p className="m-0 min-w-0 flex-1 text-sm text-ink">A new version of Strata is ready.</p>
        <button
          className="rule-link mono-sm shrink-0"
          onClick={() => {
            reloading.current = true;
            waiting.postMessage('activate');
          }}
          type="button"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
