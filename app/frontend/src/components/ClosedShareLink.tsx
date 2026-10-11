import { EmptyState } from '@project-graphite/ui';

export function ClosedShareLink() {
  return (
    <EmptyState title="This link has expired or was turned off">
      <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Ask the person who shared it for a new link.</p>
    </EmptyState>
  );
}
