import { useCallback, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import { errorMessage, isAbortError, useSettled } from '@project-graphite/ui';
import { ApiError } from './api';
import { useAuth } from './auth';
import { onChange, type Change, type Topic } from './changes';
import { ActiveSpaceContext, inActiveSpace, isSpaceResource } from './active-space';

export type Resource<T> = ReturnType<typeof useResource<T>>;

interface ResourceState<T> {
  key: string | null;
  data?: T;
  error: string;
  status?: number;
}

const cache = new Map<string, { at: number; data?: unknown; promise: Promise<unknown> }>();
const freshFor = 5_000;
const burst = 250;
const cacheLimit = 300;

function sharedRequest<T>(key: string, load: () => Promise<T>, since: number) {
  const hit = cache.get(key);
  if (hit && hit.at >= since) return hit.promise as Promise<T>;
  const entry = { at: Date.now(), data: hit?.data, promise: load() as Promise<unknown> };
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
  entry.promise.then(
    (data) => {
      entry.data = data;
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key);
    },
  );
  return entry.promise as Promise<T>;
}

export function clearResourceCache() {
  cache.clear();
}

export interface LiveOptions {
  live?: Topic[];
  every?: number;
  spaceId?: string;
  itemIds?: string[];
}

export function useLiveRefresh(refresh: () => void, { every, live, spaceId, itemIds }: LiveOptions = {}) {
  const watches = useEffectEvent((change?: Change) => !change || Boolean(
    live?.includes(change.topic) && (!spaceId || !change.spaceId || spaceId === change.spaceId) && (!itemIds || !change.itemId || itemIds.includes(change.itemId)),
  ));
  const run = useEffectEvent(refresh);
  const watching = live !== undefined;

  useEffect(() => {
    if (!watching && !every) return;
    let timer: number | undefined;
    const soon = () => {
      timer ??= window.setTimeout(() => {
        timer = undefined;
        run();
      }, 300);
    };
    const whenVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    const stopWatching = watching
      ? onChange((change) => {
          if (watches(change)) soon();
        })
      : undefined;
    const interval = every ? window.setInterval(whenVisible, every) : undefined;
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      stopWatching?.();
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [every, watching]);
}

export function useResource<T>(path: string | null, authenticated = false, live?: LiveOptions) {
  const auth = useAuth();
  const active = useContext(ActiveSpaceContext);
  const scoped = authenticated && path !== null && isSpaceResource(path);
  const spaceId = scoped ? active?.space?.id : undefined;
  path = scoped && !spaceId ? null : authenticated && path ? inActiveSpace(path, spaceId) : path;
  const { request } = auth;
  const userId = auth.user?.id;
  const key = !path ? null : authenticated ? (userId ? `${userId}|${spaceId ?? ''}|${path}` : null) : path;
  const [state, setState] = useState<ResourceState<T>>({ key: null, error: '' });
  const [version, setVersion] = useState(0);
  const inFlight = useRef<AbortController>(undefined);
  const refreshPending = useRef(false);
  const reloadedAt = useRef(0);

  useEffect(() => {
    if (!key || !path) return;
    const controller = new AbortController();
    inFlight.current = controller;
    void sharedRequest(key, () => request<T>(path), Math.max(Date.now() - freshFor, reloadedAt.current - burst))
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, error: '' });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && !isAbortError(reason)) {
          setState((current) => ({
            key,
            data: current.key === key && (!(reason instanceof ApiError) || reason.status >= 500) ? current.data : undefined,
            error: errorMessage(reason, 'Could not load this page'),
            status: reason instanceof ApiError ? reason.status : undefined,
          }));
        }
      })
      .finally(() => {
        if (inFlight.current === controller) {
          inFlight.current = undefined;
          if (refreshPending.current) {
            refreshPending.current = false;
            reloadedAt.current = Date.now();
            setVersion((current) => current + 1);
          }
        }
      });
    return () => controller.abort();
  }, [key, path, request, version]);

  const mutate = useCallback(
    (update: (data: T) => T) => {
      const entry = key ? cache.get(key) : undefined;
      if (entry?.data !== undefined) entry.data = update(entry.data as T);
      setState((current) =>
        current.key !== key || current.data === undefined ? current : { ...current, data: update(current.data) },
      );
    },
    [key],
  );
  const reload = useCallback(() => {
    reloadedAt.current = Date.now();
    setVersion((current) => current + 1);
  }, []);
  useLiveRefresh(() => {
    if (inFlight.current) refreshPending.current = true;
    else reload();
  }, live);

  const current = key && state.key === key ? state : undefined;
  const sameViewer = authenticated ? Boolean(userId && state.key?.startsWith(`${userId}|${spaceId ?? ''}|`)) : true;
  const cached = key ? (cache.get(key)?.data as T | undefined) : undefined;
  const data = useSettled(current ? current.data : (cached ?? (key && sameViewer ? state.data : undefined)));
  useEffect(() => {
    if (path && /^\/(notes|tasks|events|goals|trips|people|recipes|bookmarks|subscriptions)\/[^/?]+$/.test(path) && data && typeof data === 'object' && 'spaceId' in data && typeof data.spaceId === 'string' && data.spaceId !== active?.space?.id) active?.choose(data.spaceId);
  }, [path, data, active]);
  return {
    data,
    error: current?.data === undefined ? current?.error ?? '' : '',
    refreshError: current?.data === undefined ? '' : current.error,
    status: current?.status,
    loading: Boolean(key) && !current?.error && current?.data === undefined && cached === undefined,
    mutate,
    reload,
  };
}
