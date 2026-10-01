import { useCallback, useEffect, useState } from 'react';
import { errorMessage, isAbortError } from '@project-graphite/ui';
import { ApiError } from './api';
import { useAuth } from './auth';

export type Resource<T> = ReturnType<typeof useResource<T>>;

interface ResourceState<T> {
  key: string | null;
  data?: T;
  error: string;
  status?: number;
}

export function useResource<T>(path: string | null, authenticated = false) {
  const auth = useAuth();
  const { request } = auth;
  const userId = auth.user?.id;
  const key = !path ? null : authenticated ? (userId ? `${userId}|${path}` : null) : path;
  const [state, setState] = useState<ResourceState<T>>({ key: null, error: '' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key || !path) return;
    const controller = new AbortController();
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

  const current = key && state.key === key ? state : undefined;
  return {
    data: current?.data,
    error: current?.error ?? '',
    status: current?.status,
    loading: Boolean(key) && !current?.error && current?.data === undefined,
    mutate,
    reload,
  };
}
