import useMediaQuery from '@mui/material/useMediaQuery';
import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export const sidebarWidths = { min: 240, max: 480, step: 16 };
const widthKey = 'strata-sidebar-width';

export const clampSidebarWidth = (width: number) => Math.round(Math.max(sidebarWidths.min, Math.min(sidebarWidths.max, width)));

function storedWidth() {
  try {
    const stored = Number(localStorage.getItem(widthKey));
    return stored ? clampSidebarWidth(stored) : sidebarWidths.min;
  } catch (reason) {
    if (!(reason instanceof DOMException)) throw reason;
    return sidebarWidths.min;
  }
}

function applyWidth(width: number) {
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
}

export function applyStoredSidebarWidth() {
  applyWidth(storedWidth());
}

function storeWidth(width: number) {
  try {
    localStorage.setItem(widthKey, String(width));
  } catch (reason) {
    if (!(reason instanceof DOMException)) throw reason;
  }
}

export function SidebarResize() {
  const resizable = useMediaQuery('(min-width: 48rem) and (pointer: fine)');
  const [width, setWidth] = useState(storedWidth);
  const [dragging, setDragging] = useState<{ pointer: number; from: number; start: number }>();

  if (!resizable) return null;

  function resize(next: number, keep = true) {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    applyWidth(clamped);
    if (keep) storeWidth(clamped);
  }

  return (
    <div
      aria-label="Resize the sidebar"
      aria-orientation="vertical"
      aria-valuemax={sidebarWidths.max}
      aria-valuemin={sidebarWidths.min}
      aria-valuenow={width}
      className="sidebar-resize"
      data-dragging={dragging ? true : undefined}
      onDoubleClick={() => resize(sidebarWidths.min)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const next = { ArrowLeft: width - sidebarWidths.step, ArrowRight: width + sidebarWidths.step, Home: sidebarWidths.min, End: sidebarWidths.max }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        resize(next);
      }}
      onLostPointerCapture={() => {
        if (dragging) storeWidth(width);
        setDragging(undefined);
        document.documentElement.removeAttribute('data-sidebar-resizing');
      }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.setAttribute('data-sidebar-resizing', '');
        setDragging({ pointer: event.pointerId, from: event.clientX, start: width });
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (dragging?.pointer === event.pointerId) resize(dragging.start + event.clientX - dragging.from, false);
      }}
      role="separator"
      tabIndex={0}
      title="Drag to resize, double-click to reset"
    />
  );
}
