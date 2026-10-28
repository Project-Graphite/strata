import * as Sentry from '@sentry/nestjs';

export function scrubEvent(event: Sentry.ErrorEvent) {
  if (event.request) {
    const { method, url, headers } = event.request;
    event.request = {
      method,
      url: url?.split('?')[0],
      headers: headers && Object.fromEntries(Object.entries(headers).filter(([name]) => !/^(authorization|cookie)$/i.test(name))),
    };
  }
  return event;
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
    beforeSend: scrubEvent,
  });
}
