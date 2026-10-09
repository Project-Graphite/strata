import '@excalidraw/excalidraw/index.css';
import { useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, isInvisiblySmallElement, MainMenu, reconcileElements } from '@excalidraw/excalidraw';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type { ExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types';
import type { Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import { Avatar, LinesSkeleton, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { maxUploadBytes, preparedUpload } from '../files';
import type { Item } from '../spaces';
import { boardImage } from './board-files';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';

const boardElementsKey = 'board';
const syncEveryMs = 80;

interface Pointer {
  x: number;
  y: number;
  tool: 'pointer' | 'laser';
}

function LiveBoard({ connection, editable, spaceId }: { connection: Connection; editable: boolean; spaceId: string }) {
  const auth = useAuth();
  const show = useSnackbar();
  const { label, people, outdated } = useLiveStatus(connection, editable);
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const synced = useRef(new Map<string, number>());
  const loading = useRef(new Set<string>());
  const pending = useRef<number | undefined>(undefined);
  const elements = connection.document.getMap<ExcalidrawElement>(boardElementsKey);
  const user = auth.user!;

  useEffect(() => {
    connection.provider.setAwarenessField('user', { name: user.displayName, color: colorFor(user.id) });
  }, [connection, user.displayName, user.id]);

  useEffect(() => {
    if (!api) return;
    const loadImages = (scene: readonly ExcalidrawElement[]) => {
      const known = api.getFiles();
      for (const element of scene) {
        if (element.type !== 'image' || !element.fileId || element.isDeleted || known[element.fileId] || loading.current.has(element.fileId)) continue;
        const fileId = element.fileId;
        loading.current.add(fileId);
        boardImage(auth.request, fileId)
          .then((file) => api.addFiles([file]))
          .catch(() => loading.current.delete(fileId));
      }
    };
    const applyRemote = () => {
      const remote = [...elements.values()];
      for (const element of remote) synced.current.set(element.id, element.version);
      const scene = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as RemoteExcalidrawElement[], api.getAppState());
      api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
      loadImages(scene);
    };
    applyRemote();
    const observer = (_event: unknown, transaction: { origin: unknown }) => {
      if (transaction.origin !== api) applyRemote();
    };
    elements.observe(observer);
    return () => elements.unobserve(observer);
  }, [api, auth, elements]);

  useEffect(() => {
    if (!api) return;
    const toCollaborators = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      for (const [clientId, state] of connection.provider.awareness?.getStates() ?? []) {
        if (clientId === connection.provider.awareness?.clientID || !state.user) continue;
        const person = state.user as { name: string; color: string };
        const pointer = state.pointer as (Pointer & { button: 'up' | 'down' }) | undefined;
        collaborators.set(String(clientId) as SocketId, {
          username: person.name,
          color: { background: person.color, stroke: person.color },
          pointer: pointer && { x: pointer.x, y: pointer.y, tool: pointer.tool },
          button: pointer?.button,
        });
      }
      api.updateScene({ collaborators, captureUpdate: CaptureUpdateAction.NEVER });
    };
    connection.provider.on('awarenessChange', toCollaborators);
    return () => {
      connection.provider.off('awarenessChange', toCollaborators);
    };
  }, [api, connection]);

  useEffect(() => () => window.clearTimeout(pending.current), []);

  function sendChanges() {
    pending.current = undefined;
    if (!api) return;
    const changed = api
      .getSceneElementsIncludingDeleted()
      .filter((element) => synced.current.get(element.id) !== element.version && !isInvisiblySmallElement(element));
    if (changed.length === 0) return;
    connection.document.transact(() => {
      for (const element of changed) {
        elements.set(element.id, element);
        synced.current.set(element.id, element.version);
      }
    }, api);
  }

  async function upload(file: File) {
    if (file.size > maxUploadBytes) {
      show({ message: `${file.name} is over 25 MB.`, tone: 'error' });
      throw new Error('Too large');
    }
    const uploaded = await auth.request<Item>(`/spaces/${spaceId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: await preparedUpload(file),
    });
    return uploaded.id as FileId;
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3">
        {people.length > 0 && (
          <div aria-label={`Also here: ${people.map((person) => person.name).join(', ')}`} className="flex -space-x-2" role="group">
            {people.slice(0, 5).map((person) => (
              <Avatar key={person.clientId} name={person.name} present />
            ))}
          </div>
        )}
        <span className="mono-sm text-faint" role="status">
          {label}
        </span>
      </div>
      <div aria-label="Board" className="board-canvas" role="region">
        <Excalidraw
          excalidrawAPI={setApi}
          generateIdForFile={upload}
          isCollaborating
          onChange={() => {
            if (editable && !outdated && pending.current === undefined) pending.current = window.setTimeout(sendChanges, syncEveryMs);
          }}
          onPointerUpdate={({ pointer, button }) => connection.provider.setAwarenessField('pointer', { ...pointer, button })}
          theme="light"
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
          viewModeEnabled={!editable || outdated}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}

export default function BoardCanvas({ editable, noteId, spaceId }: { editable: boolean; noteId: string; spaceId: string }) {
  const connection = useLiveDocument(noteId);
  if (!connection) return <LinesSkeleton label="Loading the board" lines={6} />;
  return <LiveBoard connection={connection} editable={editable} spaceId={spaceId} />;
}
