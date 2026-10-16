import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { errorMessage, isAbortError, useSettled } from '@project-graphite/ui';
import { ApiError } from './api';
import { useAuth } from './auth';
import { onChange, type Change, type Topic } from './changes';

export type Resource<T> = ReturnType<typeof useResource<T>>;

interface ResourceState<T> {
  key: string | null;
  data?: T;
  error: string;
  status?: number;
}

export interface LiveOptions {
  live?: Topic[];
  every?: number;
}

export function useLiveRefresh(refresh: () => void, { every, live }: LiveOptions = {}) {
  const watches = useEffectEvent((change?: Change) => !change || Boolean(live?.includes(change.topic)));
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
  const { request } = auth;
  const userId = auth.user?.id;
  const key = !path ? null : authenticated ? (userId ? `${userId}|${path}` : null) : path;
  const [state, setState] = useState<ResourceState<T>>({ key: null, error: '' });
  const [version, setVersion] = useState(0);
  const inFlight = useRef<AbortController>(undefined);

  useEffect(() => {
    if (!key || !path) return;
    const controller = new AbortController();
    inFlight.current = controller;
    void request<T>(path, { signal: controller.signal })
      .then((data) => setState({ key, data, error: '' }))
      .catch((reason: unknown) => {
        if (!isAbortError(reason)) {
          setState({
            key,
            error: errorMessage(reason, 'Could not load this page'),
            status: reason instanceof ApiError ? reason.status : undefined,
          });
        }
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = undefined;
      });
    return () => controller.abort();
  }, [key, path, request, version]);

  const mutate = useCallback(
    (update: (data: T) => T) =>
      setState((current) =>
        current.data === undefined ? current : { ...current, data: update(current.data) },
      ),
    [],
  );
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  useLiveRefresh(() => {
    if (!inFlight.current) reload();
  }, live);

  const current = key && state.key === key ? state : undefined;
  const sameViewer = authenticated ? Boolean(userId && state.key?.startsWith(`${userId}|`)) : true;
  const data = useSettled(current ? current.data : key && sameViewer ? state.data : undefined);
  return {
    data,
    error: current?.error ?? '',
    status: current?.status,
    loading: Boolean(key) && !current?.error && current?.data === undefined,
    mutate,
    reload,
  };
}
