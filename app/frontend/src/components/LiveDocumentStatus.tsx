import { useEffect, useState } from 'react';
import { TextButton } from './Button';
import type { useLiveStatus } from './live-document';
import { LivePresence, type PresenceActions } from './LivePresence';

export function LiveDocumentStatus({ onDownload, onDownloadDraft, presenceActions, status }: { onDownload?: () => void; onDownloadDraft?: () => void; presenceActions?: PresenceActions; status: ReturnType<typeof useLiveStatus> }) {
  const [saving, setSaving] = useState(status.label === 'Saving…');
  useEffect(() => {
    if (status.label !== 'Saved') {
      setSaving(status.label === 'Saving…');
      return;
    }
    const timer = window.setTimeout(() => setSaving(false), 650);
    return () => window.clearTimeout(timer);
  }, [status.label]);
  const label = status.label === 'Saved' && saving ? 'Saving…' : status.label;
  return (
    <div className="live-document-status">
      <div className="live-document-summary">
        <LivePresence actions={presenceActions} people={status.people} />
        <span aria-atomic="true" className="live-save-status" data-busy={label === 'Saving…' || label === 'Connecting…'} data-saved={label === 'Saved'} role="status">
          <span aria-hidden="true" className="live-save-indicator" />
          <span>{label}</span>
        </span>
      </div>
      {(status.deviceUnavailable || status.canDownload || status.blocked) && status.deviceLabel && <span className="live-device-status" role={status.deviceUnavailable ? 'alert' : 'status'} title={status.deviceLabel}>{status.deviceLabel}</span>}
      {(status.deviceUnavailable || status.canRetry || status.canDownload) && <div className="live-document-actions">
        {status.deviceUnavailable && <TextButton label="Retry device storage" onClick={status.retryDevice} />}
        {status.canRetry && <TextButton disabled={status.retrying} label={status.retrying ? 'Retrying…' : 'Retry save'} onClick={status.retry} />}
        {status.canDownload && onDownload && <TextButton label="Download text" onClick={onDownload} />}
        {status.canDownload && onDownloadDraft && <TextButton label="Download draft" onClick={onDownloadDraft} />}
      </div>}
    </div>
  );
}
