import { isAbortError } from '@project-graphite/ui';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class OutageError extends ApiError {
  constructor() {
    super('Strata cannot be reached right now', 503);
  }
}

export interface Page<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

const outageListeners = new Set<() => void>();

export function onOutage(listener: () => void) {
  outageListeners.add(listener);
  return () => {
    outageListeners.delete(listener);
  };
}

function reportOutage() {
  for (const listener of outageListeners) listener();
}

const gatewayStatuses = [500, 502, 503, 504];

const statusMessages: Record<number, string> = {
  400: 'Something in that request was not accepted. Check it and try again.',
  401: 'Your session has ended. Sign in again.',
  403: 'You don’t have permission to do that.',
  404: 'That no longer exists, or you can’t see it.',
  409: 'Someone changed this at the same time. Reload and try again.',
  413: 'That is too large.',
  429: 'Too many attempts. Wait a minute, then try again.',
};

export const readBlob = (response: Response) => response.blob();

async function readJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
  read: (response: Response) => Promise<unknown> = readJson,
) {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (reason) {
    if (isAbortError(reason)) throw reason;
    reportOutage();
    throw new OutageError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    if (!body?.message && gatewayStatuses.includes(response.status)) {
      reportOutage();
      throw new OutageError();
    }
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message;
    throw new ApiError(
      message ?? statusMessages[response.status] ?? `Something went wrong (error ${response.status}). Try again.`,
      response.status,
    );
  }
  return (await read(response)) as T;
}
