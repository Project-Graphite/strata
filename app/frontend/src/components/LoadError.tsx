import { ErrorState, Icon } from '@project-graphite/ui';

export function LoadError({ compact = false, error, onRetry }: { compact?: boolean; error: string; onRetry: () => void }) {
  if (compact) {
    return (
      <div className="flex items-start gap-2 text-sm" role="alert">
        <span className="mt-0.5 shrink-0 text-danger">
          <Icon name="alert" size={16} />
        </span>
        <span className="min-w-0 flex-1 text-muted">{error}</span>
        <button className="text-button shrink-0 text-sm" onClick={onRetry} type="button">
          Retry
        </button>
      </div>
    );
  }
  return (
    <ErrorState onRetry={onRetry} title="This didn’t load">
      {error}
    </ErrorState>
  );
}
