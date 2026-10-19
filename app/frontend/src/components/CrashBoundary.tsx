import { Component, type ReactNode } from 'react';
import { Button, ErrorState } from '@project-graphite/ui';

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
          <Button href="/" LinkComponent="a" size="small">
            Go home
          </Button>
        }
        onRetry={() => window.location.reload()}
        title="This page hit a problem"
      >
        Reloading usually fixes it. If it keeps happening, the page may be broken for now.
      </ErrorState>
    );
  }
}
