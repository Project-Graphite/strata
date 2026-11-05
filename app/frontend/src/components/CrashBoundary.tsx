import { Component, Fragment, type ReactNode } from 'react';
import { Banner, ErrorState } from '@project-graphite/ui';
import { newIssueUrl } from '../project-links';
import { ButtonAnchor, ButtonLink, TextButton } from './Button';

function reportUrl(error: Error) {
  const body = [`Page: ${window.location.pathname}`, `Error: ${error.name}: ${error.message}`, `Browser: ${navigator.userAgent}`, '', 'What were you doing when it happened?'].join('\n');
  return `${newIssueUrl}?${new URLSearchParams({ title: `Crash: ${error.message.slice(0, 80)}`, body })}`;
}

interface CrashBoundaryProps {
  children: ReactNode;
  compact?: boolean;
  label?: string;
  resetKey?: string;
}

interface CrashBoundaryState {
  attempt: number;
  error?: Error;
  resetKey?: string;
}

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = { attempt: 0, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<CrashBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: CrashBoundaryProps, state: CrashBoundaryState): Partial<CrashBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { error: undefined, resetKey: props.resetKey };
  }

  retry = () => this.setState(({ attempt }) => ({ attempt: attempt + 1, error: undefined }));

  render() {
    const { attempt, error } = this.state;
    const { children, compact, label } = this.props;
    if (!error) return <Fragment key={attempt}>{children}</Fragment>;
    if (compact) {
      return (
        <Banner action={<TextButton label="Try again" onClick={this.retry} />} tone="danger">
          {label ? `${label} stopped working.` : 'This part stopped working.'} Everything else still works.
        </Banner>
      );
    }
    return (
      <ErrorState
        action={
          <>
            <ButtonLink label="Go home" to="/" />
            <ButtonAnchor href={reportUrl(error)} label="Report it" />
          </>
        }
        onRetry={this.retry}
        title={label ? `${label} hit a problem` : 'This feature hit a problem'}
      >
        <p className="m-0">Only this feature failed. The rest of Strata still works, so you can carry on from the sidebar. If it keeps happening, report it and it will be looked at.</p>
        <p className="mono-sm mt-2 mb-0 break-words text-faint">{error.message}</p>
      </ErrorState>
    );
  }
}
