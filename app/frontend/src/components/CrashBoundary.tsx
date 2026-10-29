import { Component, type ReactNode } from 'react';
import { Button, ErrorState } from '@project-graphite/ui';
import { newIssueUrl } from '../project-links';
import { ButtonAnchor } from './Button';

function reportUrl(error: Error) {
  const body = [`Page: ${window.location.pathname}`, `Error: ${error.name}: ${error.message}`, `Browser: ${navigator.userAgent}`, '', 'What were you doing when it happened?'].join('\n');
  return `${newIssueUrl}?${new URLSearchParams({ title: `Crash: ${error.message.slice(0, 80)}`, body })}`;
}

export class CrashBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorState
        action={
          <>
            <Button href="/" LinkComponent="a" size="small">
              Go home
            </Button>
            <ButtonAnchor href={reportUrl(error)} label="Report it" />
          </>
        }
        onRetry={() => window.location.reload()}
        title="This page hit a problem"
      >
        <p className="m-0">Reloading usually fixes it. If it keeps happening, report it and the page will be looked at.</p>
        <p className="mono-sm mt-2 mb-0 break-words text-faint">{error.message}</p>
      </ErrorState>
    );
  }
}
