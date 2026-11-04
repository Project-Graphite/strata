import MuiDialog from '@mui/material/Dialog';
import MuiIconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useId, useState, type ReactNode } from 'react';
import { Icon, IconButton, Sheet } from '@project-graphite/ui';
import { ExpandGlyph } from './glyphs';

type FrameView = 'panel' | 'modal';

const viewKey = 'strata-task-view';

function storedView(): FrameView {
  try {
    return localStorage.getItem(viewKey) === 'modal' ? 'modal' : 'panel';
  } catch {
    return 'panel';
  }
}

function storeView(view: FrameView) {
  try {
    localStorage.setItem(viewKey, view);
  } catch {
    return;
  }
}

export function TaskFrame({ actions, children, eyebrow, footer, onClose, title }: { actions?: ReactNode; children: ReactNode; eyebrow?: ReactNode; footer?: ReactNode; onClose: () => void; title: ReactNode }) {
  const phone = useMediaQuery('(max-width: 47.99rem)', { noSsr: true });
  const [view, setView] = useState(storedView);
  const titleId = useId();
  const toggleLabel = view === 'modal' ? 'Open in the side panel' : 'Open in the middle of the screen';
  const toggle = !phone && (
    <MuiIconButton
      aria-label={toggleLabel}
      onClick={() => {
        const next = view === 'modal' ? 'panel' : 'modal';
        storeView(next);
        setView(next);
      }}
      title={toggleLabel}
    >
      {view === 'modal' ? <Icon name="panel" size={18} /> : <ExpandGlyph />}
    </MuiIconButton>
  );

  if (phone || view === 'panel') {
    return (
      <Sheet
        actions={
          <>
            {actions}
            {toggle}
          </>
        }
        eyebrow={eyebrow}
        footer={footer}
        onClose={onClose}
        title={title}
        width="56rem"
      >
        {children}
      </Sheet>
    );
  }
  return (
    <MuiDialog aria-labelledby={titleId} maxWidth={false} onClose={onClose} open slotProps={{ paper: { className: 'sheet-paper task-modal' } }}>
      <div className="sheet-head">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 className="m-0 text-h2" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {toggle}
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </MuiDialog>
  );
}
