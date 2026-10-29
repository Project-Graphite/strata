import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isAbortError, type TagColor } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { useResource } from '../useResource';

export interface Background {
  colour?: TagColor;
  imageId?: string;
}

interface Choice {
  id: string;
  layout: { background?: Background };
}

const chosenKey = 'strata-dashboard';

export function rememberedDashboard() {
  try {
    return sessionStorage.getItem(chosenKey);
  } catch {
    return null;
  }
}

export function rememberDashboard(id: string) {
  try {
    sessionStorage.setItem(chosenKey, id);
  } catch {
    return;
  }
}

export const chosenDashboard = <T extends Pick<Choice, 'id'>>(dashboards: T[], chosen?: string | null) =>
  dashboards.find((dashboard) => dashboard.id === (chosen ?? rememberedDashboard())) ?? dashboards[0]!;

export function useBackdrop(background?: Background) {
  const { request } = useAuth();
  const [image, setImage] = useState('');

  useEffect(() => {
    if (!background?.imageId) return;
    const controller = new AbortController();
    let created = '';
    void request<Blob>(`/files/${background.imageId}`, { signal: controller.signal }, readBlob).then(
      (blob) => {
        created = URL.createObjectURL(blob);
        setImage(created);
      },
      (reason: unknown) => {
        if (!isAbortError(reason)) throw reason;
      },
    );
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
      setImage('');
    };
  }, [background?.imageId, request]);

  return {
    className: background?.colour ? `dashboard-backdrop-color tag-${background.colour}` : image ? 'dashboard-backdrop-image' : '',
    image: image && `url(${image})`,
  };
}

const BackdropContext = createContext<(background?: Background | null) => void>(() => {});

export function SiteBackdrop({ children }: { children: ReactNode }) {
  const dashboards = useResource<Choice[]>('/me/dashboards', true, { live: ['dashboards'] });
  const [shown, setShown] = useState<Background | null>();
  const chosen = dashboards.data && chosenDashboard(dashboards.data);
  const { className, image } = useBackdrop(shown === undefined ? chosen?.layout.background : (shown ?? undefined));

  useEffect(() => {
    if (!className) return;
    const classes = className.split(' ');
    document.body.classList.add(...classes);
    if (image) document.body.style.setProperty('--backdrop-image', image);
    return () => {
      document.body.classList.remove(...classes);
      document.body.style.removeProperty('--backdrop-image');
    };
  }, [className, image]);

  return <BackdropContext.Provider value={setShown}>{children}</BackdropContext.Provider>;
}

export function ShowBackdrop({ background }: { background?: Background }) {
  const show = useContext(BackdropContext);
  useEffect(() => {
    show(background ?? null);
    return () => show(undefined);
  }, [background, show]);
  return null;
}
