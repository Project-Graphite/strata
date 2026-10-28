import { createContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { TabItem } from '@project-graphite/ui';
import type { Back } from './components/Page';

interface HeaderTitle {
  pathname: string;
  title: string;
  back?: Back;
  tab?: Pick<TabItem, 'href' | 'label'>;
}

export const HeaderTitleContext = createContext<{
  enabled: boolean;
  title?: HeaderTitle;
  setTitle: Dispatch<SetStateAction<HeaderTitle | undefined>>;
} | null>(null);

export function HeaderTitleProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [title, setTitle] = useState<HeaderTitle>();
  return <HeaderTitleContext.Provider value={useMemo(() => ({ enabled, title, setTitle }), [enabled, title])}>{children}</HeaderTitleContext.Provider>;
}
