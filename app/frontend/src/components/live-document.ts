import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { realtimeUrl } from '../notes';
import { editorFormat } from '../editor-format';
import { LocalPageDraft } from '../local-page-draft';
export { editorFormat } from '../editor-format';

export interface Connection {
  document: Y.Doc;
  provider: HocuspocusProvider;
  guest: boolean;
  drafts?: LocalPageDraft;
  refused?: 'closed' | 'outdated' | 'restricted' | 'oversized';
}

export interface Person {
  id: string;
  name: string;
  access: 'view' | 'edit';
  guest: boolean;
  activity: 'reading' | 'editing' | 'idle';
}

const colors = ['#e5736b', '#e0915a', '#d7b24a', '#5fbf7f', '#4fb8b0', '#6a9eea', '#a388e8', '#e07fb5'];
const tokenUnavailableReason = 'Session renewal unavailable';

export function colorFor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
}

export function useLiveDocument(noteId: string, { shareCode, onTitle, localDrafts = false }: { shareCode?: string; onTitle?: (title: string) => void; localDrafts?: boolean } = {}) {
  const auth = useAuth();
  const userId = auth.user?.id;
  const [connection, setConnection] = useState<Connection>();
  const accessToken = useRef(auth.accessToken);
  accessToken.current = auth.accessToken;
  const titleChanged = useRef(onTitle);
  titleChanged.current = onTitle;

  useEffect(() => {
    if (!shareCode && !userId) return;
    const document = new Y.Doc();
    let titleAt = 0;
    let active = true;
    let renewalFailures = 0;
    let renewalDelay = 1_000;
    let renewalTimer: number | undefined;
    const drafts = !shareCode && localDrafts ? new LocalPageDraft(`strata-note-v${editorFormat}-${userId}-${noteId}`, document, [`strata-note-v4-${userId}-${noteId}`, `strata-note-${userId}-${noteId}`]) : undefined;
    const websocketProvider = new HocuspocusProviderWebsocket({ url: `${realtimeUrl()}?format=${editorFormat}` });
    const provider = new HocuspocusProvider({
      name: noteId,
      document,
      websocketProvider,
      flushDelay: 50,
      token: async () => {
        if (shareCode) return `share:${shareCode}`;
        try {
          return await accessToken.current();
        } catch (error) {
          renewalDelay = Math.max(Math.min(30_000, 1_000 * 2 ** Math.min(5, renewalFailures)), error instanceof ApiError ? (error.retryAfter ?? 0) * 1_000 : 0);
          renewalFailures += 1;
          throw new Error(tokenUnavailableReason);
        }
      },
      onStateless: ({ payload }) => {
        const message = JSON.parse(payload);
        if (message.type === 'title' && Date.parse(message.updatedAt) >= titleAt) {
          titleAt = Date.parse(message.updatedAt);
          titleChanged.current?.(message.title);
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        if (!active) return;
        if (reason.includes(tokenUnavailableReason)) {
          websocketProvider.disconnect();
          window.clearTimeout(renewalTimer);
          renewalTimer = window.setTimeout(() => { if (active) void websocketProvider.connect(); }, renewalDelay);
        } else refuse(reason === 'outdated' ? 'outdated' : 'closed');
      },
      onAuthenticated: () => { renewalFailures = 0; window.clearTimeout(renewalTimer); },
      onClose: ({ event }) => {
        if (event.reason === 'Access changed' || event.reason === 'Signed out') refuse('closed');
        else if (event.reason === 'Edit rejected') refuse('restricted');
        else if (event.code === 1009) refuse('oversized');
        else if (event.reason === 'This page is too large') websocketProvider.disconnect();
        else websocketProvider.webSocket?.close();
      },
    });
    function refuse(refused: NonNullable<Connection['refused']>) {
      window.clearTimeout(renewalTimer);
      setConnection((current) => (current?.provider === provider ? { ...current, refused } : current));
      websocketProvider.disconnect();
    }
    provider.attach();
    setConnection({ document, provider, guest: Boolean(shareCode), drafts });
    return () => {
      active = false;
      window.clearTimeout(renewalTimer);
      provider.destroy();
      websocketProvider.destroy();
      drafts?.destroy();
      document.destroy();
    };
  }, [noteId, shareCode, userId, localDrafts]);

  return connection;
}

export function useLiveStatus(connection: Connection, editable: boolean) {
  const draftStatus = useSyncExternalStore(connection.drafts?.subscribe ?? (() => () => {}), () => connection.drafts?.status);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>(connection.provider.isSynced ? 'connected' : 'connecting');
  const [unsynced, setUnsynced] = useState(connection.provider.unsyncedChanges);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<'save-failed' | 'too-large'>();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const { document, provider } = connection;
    const onUpdate = () => setSaved(false);
    const onStatus = ({ status: next }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      if (next !== 'connected') {
        setPeople([]);
        setRetrying(false);
      }
      setStatus((current) => (next === 'connecting' && current !== 'connecting' ? 'disconnected' : next));
    };
    const onUnsynced = ({ number }: { number: number }) => setUnsynced(number);
    const onStateless = ({ payload }: { payload: string }) => {
      const message = JSON.parse(payload);
      if (message.type === 'presence') setPeople(message.people);
      if (message.type === 'saved') {
        const current = Y.equalSnapshots(Y.decodeSnapshot(Uint8Array.from(atob(message.snapshot), (character) => character.charCodeAt(0))), Y.snapshot(document));
        if (current) {
          setFailure(undefined);
          setRetrying(false);
        }
        setSaved(current);
      }
      if (message.type === 'too-large' || message.type === 'save-failed') {
        setFailure(message.type);
        setRetrying(false);
      }
    };
    const onSynced = () => {
      setStatus('connected');
      provider.sendStateless('status');
    };
    document.on('update', onUpdate);
    provider.on('status', onStatus);
    provider.on('unsyncedChanges', onUnsynced);
    provider.on('stateless', onStateless);
    provider.on('synced', onSynced);
    if (provider.isSynced) onSynced();
    return () => {
      document.off('update', onUpdate);
      provider.off('status', onStatus);
      provider.off('unsyncedChanges', onUnsynced);
      provider.off('stateless', onStateless);
      provider.off('synced', onSynced);
    };
  }, [connection]);

  useEffect(() => {
    let activeAt = Date.now();
    let reportedAt = 0;
    const report = () => {
      if (!connection.provider.isSynced || connection.refused) return;
      connection.provider.sendStateless(document.visibilityState === 'visible' && Date.now() - activeAt < 60_000 ? 'active' : 'idle');
      reportedAt = Date.now();
    };
    const active = () => {
      activeAt = Date.now();
      if (Date.now() - reportedAt > 5_000) report();
    };
    window.addEventListener('pointerdown', active, { passive: true });
    window.addEventListener('keydown', active);
    window.addEventListener('scroll', active, { passive: true, capture: true });
    document.addEventListener('visibilitychange', report);
    connection.provider.on('synced', report);
    const interval = window.setInterval(report, 15_000);
    report();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
      window.removeEventListener('scroll', active, true);
      document.removeEventListener('visibilitychange', report);
      connection.provider.off('synced', report);
    };
  }, [connection]);

  const blocked = Boolean(connection.refused) || failure === 'too-large' || draftStatus === 'loading';
  const label = connection.refused
      ? {
          outdated: 'Strata was updated. Reload the page to keep editing',
          closed: 'Access changed. Reload the page to continue',
          restricted: 'This edit needs member access. Reload the page to continue',
          oversized: 'That change is too large to send. Download the draft to recover it as smaller pages',
        }[connection.refused]
      : failure
        ? {
            'too-large': 'This page is too large to save. Download its draft to recover it as smaller pages',
            'save-failed': 'Could not save to the server. Keep this tab open',
          }[failure]
      : status === 'disconnected'
      ? editable
        ? draftStatus === 'saved' ? 'Offline. Draft saved on this device' : 'Offline. Keep this tab open to reconnect'
        : 'Offline'
      : status === 'connecting'
        ? 'Connecting…'
        : editable && (unsynced > 0 || !saved)
          ? 'Saving…'
          : editable
            ? 'Saved'
            : 'View only';
  const canRetry = editable && failure === 'save-failed' && status === 'connected' && !blocked;
  return {
    label,
    people: blocked ? [] : people,
    blocked,
    canRetry,
    retrying,
    deviceLabel: draftStatus === 'unavailable'
      ? connection.drafts?.failure === 'load'
        ? 'Device drafts unavailable. Previous device-only edits may not be loaded'
        : 'Device drafts unavailable. Keep this tab open or download a draft'
      : draftStatus === 'loading'
        ? 'Loading device draft…'
        : !saved && draftStatus === 'saving'
          ? 'Saving device draft…'
          : !saved && draftStatus === 'saved'
            ? 'Draft saved on this device'
            : undefined,
    deviceUnavailable: draftStatus === 'unavailable',
    retryDevice: () => connection.drafts?.retry(),
    canDownload: editable && Boolean(failure || status === 'disconnected' || connection.refused || draftStatus === 'unavailable'),
    retry: () => {
      if (!canRetry || retrying) return;
      setRetrying(true);
      connection.provider.sendStateless('retry-save');
    },
  };
}
