import { Banner, ErrorState } from '@project-graphite/ui';
import { TextButton } from './Button';

export function LoadError({ compact = false, error, onRetry }: { compact?: boolean; error: string; onRetry: () => void }) {
  if (compact) {
    return (
      <Banner action={<TextButton label="Try again" onClick={onRetry} />} tone="danger">
        {error}
      </Banner>
    );
  }
  return (
    <ErrorState onRetry={onRetry} title="This didn’t load">
      {error}
    </ErrorState>
  );
}
