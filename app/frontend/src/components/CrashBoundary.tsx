import { Component, type ReactNode } from 'react';
import { ErrorState } from '@project-graphite/ui';

export class CrashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorState
        action={
          <a className="secondary-button px-3 py-2 text-sm no-underline" href="/">
            Go home
          </a>
        }
        onRetry={() => window.location.reload()}
        title="This page hit a problem"
      >
        Reloading usually fixes it. If it keeps happening, the page may be broken for now.
      </ErrorState>
    );
  }
}
