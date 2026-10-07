const [base = 'http://localhost:4104', seconds = '30', concurrency = '10'] = process.argv.slice(2);
const token = process.env.STRATA_TOKEN;
const today = new Date().toISOString().slice(0, 10);
const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const routes = [
  { path: '/api/v1/health', signedIn: false },
  { path: '/api/v1/spaces', signedIn: true },
  { path: `/api/v1/agenda?from=${today}&to=${inAWeek}`, signedIn: true },
  { path: '/api/v1/tasks/today', signedIn: true },
  { path: '/api/v1/search?q=plan', signedIn: true },
].filter((route) => token || !route.signedIn);

const durations = [];
const statuses = new Map();
const deadline = Date.now() + Number(seconds) * 1000;

async function worker(offset) {
  for (let turn = offset; Date.now() < deadline; turn += 1) {
    const route = routes[turn % routes.length];
    const started = performance.now();
    const status = await fetch(`${base}${route.path}`, { headers: route.signedIn ? { Authorization: `Bearer ${token}` } : {} }).then(
      async (response) => {
        await response.arrayBuffer();
        return String(response.status);
      },
      (error) => error.cause?.code ?? 'network error',
    );
    durations.push(performance.now() - started);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
  }
}

await Promise.all(Array.from({ length: Number(concurrency) }, (_, index) => worker(index)));
durations.sort((a, b) => a - b);
const percentile = (share) => durations[Math.min(durations.length - 1, Math.floor(durations.length * share))]?.toFixed(0);
console.log(`${durations.length} requests in ${seconds}s with ${concurrency} at a time against ${base} (${routes.length} routes${token ? '' : ', signed out only'})`);
console.log(`${(durations.length / Number(seconds)).toFixed(1)} requests a second; p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms, p99 ${percentile(0.99)} ms`);
console.log(`Answers: ${[...statuses].map(([status, count]) => `${status} × ${count}`).join(', ')}`);
