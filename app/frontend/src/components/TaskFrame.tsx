import MuiDialog from '@mui/material/Dialog';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useId, useState, type ReactNode } from 'react';
import { IconButton, Sheet } from '@project-graphite/ui';

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
  const toggle = !phone && (
    <IconButton
      icon={view === 'modal' ? 'panel' : 'monitor'}
      label={view === 'modal' ? 'Open in the side panel' : 'Open in the middle of the screen'}
      onClick={() => {
        const next = view === 'modal' ? 'panel' : 'modal';
        storeView(next);
        setView(next);
      }}
    />
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
