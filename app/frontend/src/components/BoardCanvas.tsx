import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, exportToBlob, getVisibleSceneBounds, isInvisiblySmallElement, MainMenu, reconcileElements, zoomToFitBounds } from '@excalidraw/excalidraw';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type { ExcalidrawElement, ExcalidrawTextElement, FileId } from '@excalidraw/excalidraw/element/types';
import type { AppState, Collaborator, ExcalidrawImperativeAPI, ExcalidrawProps, SocketId } from '@excalidraw/excalidraw/types';
import { Banner, FloatingToolbar, IconButton, LinesSkeleton, ToolbarButton, ToolbarSeparator, useSnackbar, type MenuItem } from '@project-graphite/ui';
import type * as Y from 'yjs';
import { useAuth } from '../auth';
import { fileSize, uploadFile } from '../files';
import { ActionsMenu } from './ActionsMenu';
import { IconLink } from './Button';
import { boardImage } from './board-files';
import { useFileSource } from './file-source';
import { boardTemplates } from './board-templates';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';
import { LiveDocumentStatus } from './LiveDocumentStatus';
import { downloadPageDraft } from '../page-draft';
import type { CommentAnchors, QuotedBlock } from './NoteComments';
import type { Back } from './Page';

const boardElementsKey = 'board';
const syncEveryMs = 200;
const presenceEveryMs = 40;
const maxBoardElements = 5_000;
const maxBoardImageBytes = 25 * 1024 * 1024;
const stickyColors = [
  { name: 'Yellow', value: '#ffec99' },
  { name: 'Green', value: '#b2f2bb' },
  { name: 'Blue', value: '#a5d8ff' },
  { name: 'Pink', value: '#fcc2d7' },
  { name: 'Orange', value: '#ffd8a8' },
];
const highlighter = { currentItemStrokeColor: '#fab005', currentItemStrokeWidth: 4, currentItemOpacity: 40 };

type Pen = Pick<AppState, 'currentItemStrokeColor' | 'currentItemStrokeWidth' | 'currentItemOpacity'>;

interface Pointer {
  x: number;
  y: number;
  tool: 'pointer' | 'laser';
}

function selectedTexts(elements: readonly ExcalidrawElement[], selected: Readonly<Record<string, true>>) {
  return elements.flatMap((element) =>
    element.type === 'text' && !element.isDeleted && (selected[element.id] || (element.containerId && selected[element.containerId])) && element.text.trim()
      ? [element.text.trim().replace(/\s+/g, ' ').slice(0, 200)]
      : [],
  );
}

const shapeNames: Partial<Record<ExcalidrawElement['type'], string>> = {
  rectangle: 'A box',
  ellipse: 'An ellipse',
  diamond: 'A diamond',
  arrow: 'An arrow',
  line: 'A line',
  freedraw: 'A drawing',
  image: 'An image',
  frame: 'A frame',
};

function shapeLabel(scene: readonly ExcalidrawElement[], id: string) {
  const element = scene.find((candidate) => candidate.id === id && !candidate.isDeleted);
  if (!element) return 'A shape that was removed';
  const text =
    element.type === 'text'
      ? element.text
      : scene.find((candidate): candidate is ExcalidrawTextElement => candidate.type === 'text' && candidate.containerId === id && !candidate.isDeleted)?.text;
  return text?.trim().replace(/\s+/g, ' ').slice(0, 80) || shapeNames[element.type] || 'A shape';
}

interface Pin {
  id: string;
  left: number;
  top: number;
}

const samePins = (current: Pin[], next: Pin[]) =>
  current.length === next.length && current.every((pin, index) => pin.id === next[index]!.id && pin.left === next[index]!.left && pin.top === next[index]!.top);

function usageWarning(shapes: number, imageBytes: number) {
  if (shapes >= maxBoardElements) return `This board is full at ${maxBoardElements.toLocaleString('en')} shapes. Remove some to add more.`;
  if (imageBytes >= maxBoardImageBytes * 0.9) return `Images on this board use ${fileSize(imageBytes)} of ${fileSize(maxBoardImageBytes)}.`;
  if (shapes >= maxBoardElements * 0.9) return `This board has ${shapes.toLocaleString('en')} of ${maxBoardElements.toLocaleString('en')} shapes.`;
  return undefined;
}

function throttledPresence(connection: Connection, field: string) {
  let next: unknown;
  let sentAt = 0;
  let timer: number | undefined;
  return {
    set(value: unknown) {
      next = value;
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        sentAt = Date.now();
        connection.provider.setAwarenessField(field, next);
      }, Math.max(0, sentAt + presenceEveryMs - Date.now()));
    },
    cancel: () => window.clearTimeout(timer),
  };
}

interface BoardComments {
  commentedBlocks: string[];
  onComment?: (block: QuotedBlock) => void;
  onAnchors: (anchors: CommentAnchors) => void;
  onOpenThread: (blockId: string) => void;
}

interface BoardMember {
  comments: BoardComments;
  spaceId: string;
}

export interface BoardBar {
  back?: Back;
  title: ReactNode;
  actions?: ReactNode;
  menu?: MenuItem[];
}

export function LiveBoard({ bar, boardId, connection, editable, member }: { bar: BoardBar; boardId: string; connection: Connection; editable: boolean; member?: BoardMember }) {
  const auth = useAuth();
  const show = useSnackbar();
  const status = useLiveStatus(connection, editable);
  const { blocked } = status;
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const [picked, setPicked] = useState<string[]>([]);
  const [making, setMaking] = useState(false);
  const [single, setSingle] = useState<string>();
  const [pins, setPins] = useState<Pin[]>([]);
  const [warning, setWarning] = useState<string>();
  const [tool, setTool] = useState<'sticky' | 'highlighter'>();
  const [stickyColor, setStickyColor] = useState(stickyColors[0]!.value);
  const canvas = connection.document.getMap<string>('canvas');
  const [dark, setDark] = useState(canvas.get('theme') === 'dark');
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const commentedBlocks = member?.comments.commentedBlocks ?? [];
  const synced = useRef(new Map<string, number>());
  const loading = useRef(new Set<string>());
  const pending = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const selection = useRef<AppState['selectedElementIds']>(undefined);
  const anchors = useRef(new Map<string, { x: number; y: number }>());
  const imageBytes = useRef(0);
  const pen = useRef<Pen>(undefined);
  const followed = useRef(false);
  const followedView = useRef<string>(undefined);
  const printFrame = useRef<HTMLIFrameElement>(undefined);
  const elements = connection.document.getMap<ExcalidrawElement>(boardElementsKey);
  const user = auth.user ? { id: auth.user.id, name: auth.user.displayName } : { id: `guest-${connection.document.clientID}`, name: 'Guest' };
  const load = useFileSource();
  const spaceId = member?.spaceId;
  const pointer = useMemo(() => throttledPresence(connection, 'pointer'), [connection]);
  const view = useMemo(() => throttledPresence(connection, 'view'), [connection]);
  const latest = useRef({ api, editing: false, commented: commentedBlocks, stickyColor });
  latest.current = { api, editing: editable && !blocked, commented: commentedBlocks, stickyColor };

  useEffect(() => {
    connection.provider.setAwarenessField('user', { name: user.name, color: colorFor(user.id) });
  }, [connection, user.name, user.id]);

  useEffect(() => {
    const changed = () => setDark(canvas.get('theme') === 'dark');
    canvas.observe(changed);
    return () => canvas.unobserve(changed);
  }, [canvas]);

  useEffect(() => {
    if (!api) return;
    const applyRemote = (keys: Iterable<string>) => {
      const remote: ExcalidrawElement[] = [];
      for (const key of keys) {
        const element = elements.get(key);
        if (!element) continue;
        remote.push(element);
        synced.current.set(element.id, element.version);
      }
      if (remote.length === 0) return;
      const scene = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as RemoteExcalidrawElement[], api.getAppState());
      api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
      const known = api.getFiles();
      for (const element of remote) {
        if (element.type !== 'image' || !element.fileId || element.isDeleted || known[element.fileId] || loading.current.has(element.fileId)) continue;
        const fileId = element.fileId;
        loading.current.add(fileId);
        boardImage(load, fileId)
          .then((file) => api.addFiles([file]))
          .catch(() => loading.current.delete(fileId));
      }
    };
    applyRemote(elements.keys());
    const observer = (event: Y.YMapEvent<ExcalidrawElement>, transaction: Y.Transaction) => {
      if (transaction.origin !== api) applyRemote(event.keysChanged);
    };
    elements.observe(observer);
    return () => elements.unobserve(observer);
  }, [api, load, elements]);

  useEffect(() => {
    if (!api) return;
    const toCollaborators = () => {
      const awareness = connection.provider.awareness;
      const mine = awareness?.clientID;
      const following = api.getAppState().userToFollow?.socketId;
      const collaborators = new Map<SocketId, Collaborator>();
      let watched = false;
      let target: [number, number, number, number] | undefined;
      for (const [clientId, state] of awareness?.getStates() ?? []) {
        if (clientId === mine || !state.user) continue;
        const socketId = String(clientId) as SocketId;
        const person = state.user as { name: string; color: string };
        const pointer = state.pointer as (Pointer & { button: 'up' | 'down' }) | undefined;
        if (state.following === mine) watched = true;
        if (socketId === following && Array.isArray(state.view) && state.view.length === 4) target = state.view as [number, number, number, number];
        collaborators.set(socketId, {
          socketId,
          username: person.name,
          color: { background: person.color, stroke: person.color },
          pointer: pointer && { x: pointer.x, y: pointer.y, tool: pointer.tool },
          button: pointer?.button,
        });
      }
      if (watched && !followed.current) view.set(getVisibleSceneBounds(api.getAppState()).map(Math.round));
      if (!watched && followed.current) view.set(null);
      followed.current = watched;
      const shown = target?.join(' ');
      if (target && shown !== followedView.current) {
        followedView.current = shown;
        const { appState } = zoomToFitBounds({ bounds: target, appState: api.getAppState(), fitToViewport: true, viewportZoomFactor: 1 });
        api.updateScene({ collaborators, appState: { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom }, captureUpdate: CaptureUpdateAction.NEVER });
        return;
      }
      api.updateScene({ collaborators, captureUpdate: CaptureUpdateAction.NEVER });
    };
    connection.provider.on('awarenessChange', toCollaborators);
    return () => {
      connection.provider.off('awarenessChange', toCollaborators);
    };
  }, [api, connection, view]);

  useEffect(
    () => () => {
      window.clearTimeout(pending.current);
      pointer.cancel();
      view.cancel();
      printFrame.current?.remove();
    },
    [pointer, view],
  );

  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);

  const onAnchors = member?.comments.onAnchors;
  useEffect(() => {
    if (!api || !onAnchors) return;
    onAnchors({
      noun: 'shape',
      label: (id) => shapeLabel(api.getSceneElements(), id),
      show: (id) => {
        const element = api.getSceneElements().find((candidate) => candidate.id === id);
        if (!element) return;
        api.updateScene({ appState: { selectedElementIds: { [id]: true } }, captureUpdate: CaptureUpdateAction.NEVER });
        api.scrollToContent(element, { animate: true });
      },
    });
  }, [api, onAnchors]);

  const placePins = useCallback(({ scrollX, scrollY, zoom }: Pick<AppState, 'scrollX' | 'scrollY' | 'zoom'>) => {
    const next = [...anchors.current].map(([id, { x, y }]) => ({ id, left: (x + scrollX) * zoom.value, top: (y + scrollY) * zoom.value }));
    setPins((current) => (samePins(current, next) ? current : next));
  }, []);

  const tick = useCallback(() => {
    window.clearTimeout(pending.current);
    pending.current = undefined;
    const { api, editing, commented } = latest.current;
    if (!api) return;
    const scene = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    const inProgress = new Set([appState.newElement?.id, appState.editingTextElement?.id, appState.multiElement?.id]);
    const wanted = new Set(commented);
    const files = new Set<string>();
    const changed: ExcalidrawElement[] = [];
    const dropped = new Set<string>();
    let shapes = 0;
    anchors.current = new Map();
    for (const element of scene) {
      if (!element.isDeleted) {
        if (editing && shapes >= maxBoardElements && !elements.has(element.id) && !inProgress.has(element.id)) {
          dropped.add(element.id);
          continue;
        }
        shapes += 1;
        if (wanted.has(element.id)) anchors.current.set(element.id, { x: element.x + element.width, y: element.y });
        if (element.type === 'image' && element.fileId) files.add(element.fileId);
      }
      if (editing && !inProgress.has(element.id) && synced.current.get(element.id) !== element.version && !isInvisiblySmallElement(element)) changed.push(element);
    }
    if (dropped.size > 0) {
      api.updateScene({ elements: scene.filter((element) => !dropped.has(element.id)), captureUpdate: CaptureUpdateAction.NEVER });
      show({ message: `A board holds up to ${maxBoardElements.toLocaleString('en')} shapes. Remove some to add more.`, tone: 'error' });
    }
    if (changed.length > 0) {
      connection.document.transact(() => {
        for (const element of changed) {
          elements.set(element.id, element);
          synced.current.set(element.id, element.version);
        }
      }, api);
    }
    const known = api.getFiles();
    imageBytes.current = [...files].reduce((total, id) => total + Math.round((known[id]?.dataURL.length ?? 0) * 0.75), 0);
    setWarning(editing ? usageWarning(shapes, imageBytes.current) : undefined);
    placePins(appState);
  }, [connection, elements, placePins, show]);

  const placed = commentedBlocks.join(' ');
  useEffect(() => {
    if (api) tick();
  }, [api, placed, tick]);

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (scene, appState) => {
      const active = Boolean(appState.newElement || appState.editingTextElement || appState.multiElement || appState.resizingElement || appState.selectedElementsAreBeingDragged);
      if (busy.current && !active) tick();
      else if (pending.current === undefined) pending.current = window.setTimeout(tick, syncEveryMs);
      busy.current = active;
      if (pen.current && appState.activeTool.type !== 'freedraw') {
        const previous = pen.current;
        pen.current = undefined;
        latest.current.api?.updateScene({ appState: previous, captureUpdate: CaptureUpdateAction.NEVER });
      }
      setTool(appState.activeTool.type === 'custom' && appState.activeTool.customType === 'sticky' ? 'sticky' : pen.current ? 'highlighter' : undefined);
      if (appState.selectedElementIds === selection.current) return;
      selection.current = appState.selectedElementIds;
      const texts = selectedTexts(scene, appState.selectedElementIds);
      setPicked((current) => (current.join('\n') === texts.join('\n') ? current : texts));
      const selected = Object.keys(appState.selectedElementIds);
      setSingle(selected.length === 1 ? selected[0] : undefined);
    },
    [tick],
  );

  const onPointerUp = useCallback<NonNullable<ExcalidrawProps['onPointerUp']>>(
    (activeTool, pointerDownState) => {
      window.clearTimeout(pending.current);
      pending.current = window.setTimeout(tick);
      const { api, stickyColor } = latest.current;
      if (!api || activeTool.type !== 'custom' || activeTool.customType !== 'sticky') return;
      const { x, y } = pointerDownState.origin;
      const [note] = convertToExcalidrawElements(
        [{ type: 'rectangle', x: x - 100, y: y - 100, width: 200, height: 200, backgroundColor: stickyColor, fillStyle: 'solid', strokeColor: 'transparent', roughness: 0, roundness: { type: 3 } }],
        { regenerateIds: true },
      );
      api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), note!], appState: { selectedElementIds: { [note!.id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      api.setActiveTool({ type: 'selection' });
      requestAnimationFrame(() => document.querySelector('.board-canvas .excalidraw')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    },
    [tick],
  );

  const onScrollChange = useCallback<NonNullable<ExcalidrawProps['onScrollChange']>>(
    (scrollX, scrollY, zoom) => {
      placePins({ scrollX, scrollY, zoom });
      const api = latest.current.api;
      if (followed.current && api) view.set(getVisibleSceneBounds(api.getAppState()).map(Math.round));
    },
    [placePins, view],
  );

  const onPointerUpdate = useCallback<NonNullable<ExcalidrawProps['onPointerUpdate']>>(
    ({ pointer: { x, y, tool }, button }) => pointer.set({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tool, button }),
    [pointer],
  );

  useEffect(
    () =>
      api?.onUserFollow(({ action, userToFollow }) => {
        followedView.current = undefined;
        connection.provider.setAwarenessField('following', action === 'FOLLOW' ? Number(userToFollow.socketId) : null);
      }),
    [api, connection],
  );

  const upload = useCallback(
    async (file: File) => {
      if (!spaceId) throw new Error('Images need a space');
      if (imageBytes.current + file.size > maxBoardImageBytes) {
        show({ message: `Images on a board can add up to ${fileSize(maxBoardImageBytes)}. ${file.name} does not fit.`, tone: 'error' });
        throw new Error('Too large');
      }
      const uploaded = await uploadFile(auth.request, spaceId, file);
      return uploaded.id as FileId;
    },
    [auth.request, show, spaceId],
  );

  function addElements(skeletons: Parameters<typeof convertToExcalidrawElements>[0]) {
    if (!api) return;
    const added = convertToExcalidrawElements(skeletons, { regenerateIds: true });
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.scrollToContent(added, { fitToContent: true });
  }

  function pickSticky(color: string) {
    setStickyColor(color);
    api?.setActiveTool({ type: 'custom', customType: 'sticky' });
  }

  function toggleHighlighter() {
    if (!api) return;
    if (pen.current) {
      api.setActiveTool({ type: 'selection' });
      return;
    }
    const { currentItemStrokeColor, currentItemStrokeWidth, currentItemOpacity } = api.getAppState();
    api.setActiveTool({ type: 'freedraw' });
    api.updateScene({ appState: highlighter, captureUpdate: CaptureUpdateAction.NEVER });
    pen.current = { currentItemStrokeColor, currentItemStrokeWidth, currentItemOpacity };
  }

  async function printBoard() {
    if (!api) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      files: api.getFiles(),
      mimeType: 'image/png',
      appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
    });
    printFrame.current?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'board-print-frame';
    document.body.append(frame);
    printFrame.current = frame;
    const page = frame.contentWindow!;
    const url = URL.createObjectURL(blob);
    const image = page.document.createElement('img');
    image.style.width = '100%';
    image.onload = () => {
      URL.revokeObjectURL(url);
      page.addEventListener('afterprint', () => frame.remove());
      page.print();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      frame.remove();
    };
    image.src = url;
    page.document.body.append(image);
  }

  const makeTasks = useCallback(
    async (spaceId: string) => {
      setMaking(true);
      try {
        for (const title of picked) {
          const task = await auth.request<{ id: string }>(`/spaces/${spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) });
          await auth.request(`/items/${task.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: boardId, kind: 'reference' }) });
        }
        show({ message: picked.length === 1 ? 'Added a task.' : `Added ${picked.length} tasks.` });
      } catch {
        show({ message: 'Could not add the tasks.', tone: 'error' });
      } finally {
        setMaking(false);
      }
    },
    [auth.request, boardId, picked, show],
  );

  const onComment = member?.comments.onComment;
  const renderTopRightUI = useCallback(
    () =>
      spaceId && editable && !blocked ? (
        <div className="flex gap-2">
          {single && onComment && (
            <button className="board-action" onClick={() => api && onComment({ id: single, excerpt: shapeLabel(api.getSceneElements(), single) })} type="button">
              Comment
            </button>
          )}
          {picked.length > 0 && (
            <button className="board-action" disabled={making} onClick={() => void makeTasks(spaceId)} type="button">
              Make {picked.length === 1 ? 'a task' : `${picked.length} tasks`}
            </button>
          )}
        </div>
      ) : null,
    [api, blocked, editable, makeTasks, making, onComment, picked.length, single, spaceId],
  );

  const uiOptions = useMemo<ExcalidrawProps['UIOptions']>(
    () => ({ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false }, tools: { image: Boolean(spaceId) } }),
    [spaceId],
  );

  const mainMenu = useMemo(
    () => (
      <MainMenu>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    ),
    [],
  );

  const drawing = editable && !blocked;
  const menu = [
    drawing ? boardTemplates.map((template) => ({ label: `Add the ${template.label} template`, onSelect: () => addElements(template.build()) })) : [],
    [
      ...(drawing ? [{ label: dark ? 'Use a white canvas' : 'Use a dark canvas', onSelect: () => (dark ? canvas.delete('theme') : canvas.set('theme', 'dark')) }] : []),
      { label: 'Export as image', onSelect: () => api?.updateScene({ appState: { openDialog: { name: 'imageExport' } }, captureUpdate: CaptureUpdateAction.NEVER }) },
      { label: 'Print or save as PDF', onSelect: () => void printBoard() },
    ],
    bar.menu ?? [],
  ]
    .filter((group) => group.length > 0)
    .flatMap((group, index) => group.map((item, position) => ({ ...item, separated: index > 0 && position === 0 })));

  return (
    <div className="board-stage">
      <div className="board-bar">
        {bar.back && <IconLink icon="chevron-left" label={`Back to ${bar.back.label}`} to={bar.back.to} />}
        {bar.title}
        <LiveDocumentStatus onDownloadDraft={() => downloadPageDraft(connection.document, 'board', boardId)} status={status} />
        {bar.actions}
        {document.fullscreenEnabled && (
          <IconButton
            className="max-md:hidden"
            icon={fullscreen ? 'x' : 'monitor'}
            label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={() => void (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          />
        )}
        <ActionsMenu items={menu} name="Board" />
      </div>
      <div aria-label="Board" className="board-canvas" role="region">
        {warning && (
          <Banner className="board-limit" tone="warning">
            {warning}
          </Banner>
        )}
        {drawing && (
          <FloatingToolbar className="board-tools" label="Board tools">
            <ToolbarButton active={tool === 'sticky'} icon="file" label="Sticky note" onClick={() => (tool === 'sticky' ? api?.setActiveTool({ type: 'selection' }) : pickSticky(stickyColor))} />
            {stickyColors.map((color) => (
              <ToolbarButton active={tool === 'sticky' && stickyColor === color.value} key={color.value} label={`${color.name} sticky note`} onClick={() => pickSticky(color.value)}>
                <span aria-hidden="true" className="board-swatch" style={{ background: color.value }} />
              </ToolbarButton>
            ))}
            <ToolbarSeparator />
            <ToolbarButton active={tool === 'highlighter'} icon="highlight" label="Highlighter" onClick={toggleHighlighter} />
          </FloatingToolbar>
        )}
        {pins.map((pin) => (
          <button
            aria-label={`Comments on ${api ? shapeLabel(api.getSceneElements(), pin.id) : 'a shape'}`}
            className="board-pin"
            key={pin.id}
            onClick={() => member?.comments.onOpenThread(pin.id)}
            style={{ left: pin.left, top: pin.top }}
            type="button"
          />
        ))}
        <Excalidraw
          excalidrawAPI={setApi}
          generateIdForFile={spaceId ? upload : undefined}
          isCollaborating
          onChange={onChange}
          onPointerUp={onPointerUp}
          onPointerUpdate={onPointerUpdate}
          onScrollChange={onScrollChange}
          renderTopRightUI={renderTopRightUI}
          theme={dark ? 'dark' : 'light'}
          UIOptions={uiOptions}
          viewModeEnabled={!drawing}
        >
          {mainMenu}
        </Excalidraw>
      </div>
    </div>
  );
}

export default function BoardCanvas({ bar, editable, noteId, spaceId, ...comments }: { bar: BoardBar; editable: boolean; noteId: string; spaceId: string } & BoardComments) {
  const connection = useLiveDocument(noteId, { localDrafts: editable });
  if (!connection) return <LinesSkeleton label="Loading the board" lines={6} />;
  return <LiveBoard bar={bar} boardId={noteId} connection={connection} editable={editable} member={{ comments, spaceId }} />;
}
