import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage, ListSkeleton, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';

export function OpenCreatedPage({ path, fallback, label, back }: { path: string; fallback: string; label: string; back: string }) {
  const { request } = useAuth();
  const navigate = useNavigate();
  const show = useSnackbar();

  useEffect(() => {
    let cancelled = false;
    request<{ noteId: string }>(path, { method: 'POST' }).then(
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
