import { TextButton } from './Button';
import type { useLiveStatus } from './live-document';
import { LivePresence, type PresenceActions } from './LivePresence';

export function LiveDocumentStatus({ onDownload, onDownloadDraft, presenceActions, status }: { onDownload?: () => void; onDownloadDraft?: () => void; presenceActions?: PresenceActions; status: ReturnType<typeof useLiveStatus> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LivePresence actions={presenceActions} people={status.people} />
      <span className="mono-sm text-faint" role="status">{status.label}</span>
      {status.deviceLabel && <span className="mono-sm text-faint" role={status.deviceUnavailable ? 'alert' : 'status'}>{status.deviceLabel}</span>}
      {status.deviceUnavailable && <TextButton label="Retry device storage" onClick={status.retryDevice} />}
      {status.canRetry && <TextButton disabled={status.retrying} label={status.retrying ? 'Retrying…' : 'Retry save'} onClick={status.retry} />}
      {status.canDownload && onDownload && <TextButton label="Download text" onClick={onDownload} />}
      {status.canDownload && onDownloadDraft && <TextButton label="Download draft" onClick={onDownloadDraft} />}
    </div>
  );
}
