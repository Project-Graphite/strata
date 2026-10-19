import { createContext, useContext } from 'react';
import type { Resource } from './useResource';

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const InboxContext = createContext<Resource<{ unread: number }> | null>(null);

export function useInbox() {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error('useInbox must be used inside the shell');
  }
  return context;
}
