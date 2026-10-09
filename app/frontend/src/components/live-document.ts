import { useEffect, useRef, useState } from 'react';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { useSnackbar } from '@project-graphite/ui';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useAuth } from '../auth';
import { realtimeUrl } from '../notes';

export interface Connection {
  document: Y.Doc;
  provider: HocuspocusProvider;
}

export interface Person {
  clientId: number;
  name: string;
  color: string;
}

export const editorFormat = 3;

const colors = ['#e5736b', '#e0915a', '#d7b24a', '#5fbf7f', '#4fb3c4', '#6b8fe5', '#a07be5', '#e57bb5'];

export function colorFor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
}

export function useLiveDocument(noteId: string) {
  const auth = useAuth();
  const [connection, setConnection] = useState<Connection>();
  const accessToken = useRef(auth.accessToken);
  accessToken.current = auth.accessToken;

  useEffect(() => {
    const document = new Y.Doc();
    const drafts = new IndexeddbPersistence(`strata-note-${noteId}`, document);
    const websocketProvider = new HocuspocusProviderWebsocket({ url: `${realtimeUrl()}?format=${editorFormat}` });
    const provider = new HocuspocusProvider({ name: noteId, document, websocketProvider, token: () => accessToken.current() });
    provider.attach();
    setConnection({ document, provider });
    return () => {
      provider.destroy();
      websocketProvider.destroy();
      void drafts.destroy();
      document.destroy();
    };
  }, [noteId]);

  return connection;
}

export function useLiveStatus(connection: Connection, editable: boolean) {
  const show = useSnackbar();
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'outdated'>('connecting');
  const [unsynced, setUnsynced] = useState(0);

  useEffect(() => {
    const { provider } = connection;
    const onStatus = ({ status: next }: { status: 'connecting' | 'connected' | 'disconnected' }) =>
      setStatus((current) => (current === 'outdated' ? current : next === 'connecting' && current !== 'connecting' ? 'disconnected' : next));
    const onRefused = ({ reason }: { reason: string }) => {
      if (reason !== 'outdated') return;
      setStatus('outdated');
      provider.disconnect();
    };
    const onUnsynced = ({ number }: { number: number }) => setUnsynced(number);
    const onAwareness = () =>
      setPeople(
        [...(provider.awareness?.getStates().entries() ?? [])]
          .filter(([clientId, state]) => clientId !== provider.awareness?.clientID && state.user)
          .map(([clientId, state]) => ({ clientId, ...(state.user as { name: string; color: string }) })),
      );
    const onStateless = ({ payload }: { payload: string }) => {
      if (payload.includes('too-large')) show({ message: 'This page is too large to save. Split it into smaller pages.', tone: 'error' });
    };
    provider.on('status', onStatus);
    provider.on('unsyncedChanges', onUnsynced);
    provider.on('awarenessChange', onAwareness);
    provider.on('stateless', onStateless);
    provider.on('authenticationFailed', onRefused);
    return () => {
      provider.off('status', onStatus);
      provider.off('unsyncedChanges', onUnsynced);
      provider.off('awarenessChange', onAwareness);
      provider.off('stateless', onStateless);
      provider.off('authenticationFailed', onRefused);
    };
  }, [connection, show]);

  const label =
    status === 'outdated'
      ? 'Strata was updated. Reload the page to keep editing'
      : status === 'disconnected'
      ? editable
        ? 'Offline. Changes are kept on this device'
        : 'Offline'
      : status === 'connecting'
        ? 'Connecting…'
        : unsynced > 0
          ? 'Saving…'
          : editable
            ? 'Saved'
            : 'View only';
  return { label, people, outdated: status === 'outdated' };
}
