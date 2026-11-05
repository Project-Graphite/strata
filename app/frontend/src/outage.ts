export type OutageCondition = 'offline' | 'updating' | 'failing';

export const outageCopy: Record<OutageCondition, { eyebrow: string; title: string; body: string; page: string }> = {
  offline: {
    eyebrow: 'offline',
    title: 'You are offline',
    body: 'Strata needs a connection to load your workspace. It carries on by itself as soon as you are back online.',
    page: 'offline.html',
  },
  updating: {
    eyebrow: 'updating',
    title: 'Strata is being updated',
    body: 'This usually takes under a minute. Nothing you saved is lost, and this page comes back by itself.',
    page: 'maintenance.html',
  },
  failing: {
    eyebrow: 'server error',
    title: 'Strata is having trouble',
    body: 'The server is answering with errors. It has been noticed, and this page comes back by itself once it recovers.',
    page: 'server-error.html',
  },
};

export const healthPath = '/api/v1/health';

export const retryDelays = [3_000, 6_000, 12_000, 15_000];

export const retryDelay = (attempt: number) => retryDelays[Math.min(attempt, retryDelays.length - 1)]!;

export function conditionOf(response: { status: number } | null, online = true): OutageCondition | null {
  if (!online) return 'offline';
  if (!response) return 'updating';
  if (response.status >= 502 && response.status <= 504) return 'updating';
  if (response.status >= 500) return 'failing';
  return null;
}

export async function serverHealth(healthUrl: string): Promise<OutageCondition | null> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!online) return 'offline';
  const response = await fetch(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(5_000) }).catch(() => null);
  return conditionOf(response, typeof navigator === 'undefined' || navigator.onLine !== false);
}

export const nextTryLabel = (dueAt: number, now: number) => `Trying again in ${Math.max(1, Math.ceil((dueAt - now) / 1000))} s`;

const escaped = (text: string) => text.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);

export function outagePage(condition: OutageCondition) {
  const copy = outageCopy[condition];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/outage.css" />
    <script defer src="/outage.js"></script>
    <title>${escaped(copy.title)}</title>
  </head>
  <body class="outage-page">
    <main class="outage" data-delays="${retryDelays.join(',')}" data-health="${healthPath}" role="alert">
      <img alt="" height="56" src="/favicon.svg" width="56" />
      <p class="outage-eyebrow">${escaped(copy.eyebrow)}</p>
      <h1 class="outage-title">${escaped(copy.title)}</h1>
      <p class="outage-body">${escaped(copy.body)}</p>
      <div class="outage-actions">
        <button class="outage-button" type="button">Try again now</button>
        <span aria-live="polite" class="outage-next" data-next></span>
      </div>
    </main>
  </body>
</html>
`;
}

export const outageScript = `(() => {
  const main = document.querySelector('.outage');
  const next = main.querySelector('[data-next]');
  const button = main.querySelector('button');
  const delays = main.dataset.delays.split(',').map(Number);
  let attempt = 0;
  let due = 0;
  let timer = 0;
  const schedule = () => {
    const delay = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    due = Date.now() + delay;
    timer = window.setTimeout(check, delay);
  };
  const check = async () => {
    window.clearTimeout(timer);
    button.disabled = true;
    next.textContent = 'Checking the server…';
    const healthy = await fetch(main.dataset.health, { cache: 'no-store' }).then((response) => response.ok, () => false);
    if (healthy) return window.location.reload();
    button.disabled = false;
    schedule();
  };
  window.setInterval(() => {
    if (!button.disabled) next.textContent = 'Trying again in ' + Math.max(1, Math.ceil((due - Date.now()) / 1000)) + ' s';
  }, 250);
  button.addEventListener('click', check);
  window.addEventListener('online', check);
  schedule();
})();
`;
