import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { NoteDetails } from './notes';

const PageNavigationContext = createContext<readonly [NoteDetails | undefined, Dispatch<SetStateAction<NoteDetails | undefined>>] | null>(null);

export function PageNavigationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<NoteDetails>();
  return <PageNavigationContext.Provider value={useMemo(() => [current, setCurrent] as const, [current])}>{children}</PageNavigationContext.Provider>;
}

export function usePageNavigation() {
  const context = useContext(PageNavigationContext);
  if (!context) throw new Error('usePageNavigation must be used inside the shell');
  return context;
}
