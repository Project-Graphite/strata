import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metrics = new Registry();
collectDefaultMetrics({ register: metrics });

const httpLabels = ['method', 'route', 'status_class'] as const;

export const httpRequests = new Counter({ name: 'strata_http_requests_total', help: 'API requests answered', labelNames: httpLabels, registers: [metrics] });
export const httpDuration = new Histogram({ name: 'strata_http_request_duration_seconds', help: 'API request duration in seconds', labelNames: httpLabels, registers: [metrics] });
export const httpServerErrors = new Counter({ name: 'strata_http_server_errors_total', help: 'API requests answered with a 5xx status', labelNames: ['method', 'route'], registers: [metrics] });
export const authFailures = new Counter({ name: 'strata_auth_failures_total', help: 'API requests answered with 401, 403 or 429', labelNames: ['status'], registers: [metrics] });
export const backgroundJobFailures = new Counter({ name: 'strata_background_job_failures_total', help: 'Failed scheduled job attempts and maintenance runs', labelNames: ['kind'], registers: [metrics] });
export const redisUp = new Gauge({ name: 'strata_redis_up', help: 'Whether Redis answered a ping at scrape time', registers: [metrics] });
export const realtimeClients = new Gauge({ name: 'strata_realtime_connected_clients', help: 'Open collaborative editing connections', registers: [metrics] });
export const realtimeDocuments = new Gauge({ name: 'strata_realtime_open_documents', help: 'Documents loaded for collaborative editing', registers: [metrics] });
export const sseStreams = new Gauge({ name: 'strata_sse_streams', help: 'Open live update streams', registers: [metrics] });
