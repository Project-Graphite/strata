import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage, ListSkeleton, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';

const opening = new Map<string, Promise<{ noteId: string }>>();

export function OpenCreatedPage({ path, fallback, label, back }: { path: string; fallback: string; label: string; back: string }) {
  const { request } = useAuth();
  const navigate = useNavigate();
  const show = useSnackbar();

  useEffect(() => {
    let cancelled = false;
    let created = opening.get(path);
    if (!created) {
      created = request<{ noteId: string }>(path, { method: 'POST' }).finally(() => opening.delete(path));
      opening.set(path, created);
    }
    created.then(
      ({ noteId }) => !cancelled && navigate(`/notes/${noteId}`, { replace: true }),
      (reason: unknown) => {
        if (cancelled) return;
        show({ message: errorMessage(reason, fallback), tone: 'error' });
        navigate(back, { replace: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [back, fallback, navigate, path, request, show]);

  return <ListSkeleton label={label} rows={4} />;
}
