import { useEffect } from 'react';
import { EmptyState, Kbd } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ButtonLink } from '../components/Button';
import { Page } from '../components/Page';

const areas = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/pages', label: 'Pages' },
  { href: '/spending', label: 'Spending' },
];

export function NotFoundPage() {
  const signedIn = Boolean(useAuth().user);
  useEffect(() => {
    const robots = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' });
    document.head.append(robots);
    return () => robots.remove();
  }, []);
  return (
    <Page title="Page not found" titleHidden>
      <EmptyState
        action={
          <>
            <ButtonLink label="Go home" primary to="/" />
            {signedIn ? areas.map((area) => <ButtonLink key={area.href} label={area.label} to={area.href} />) : <ButtonLink label="Sign in" to="/login" />}
          </>
        }
        icon="compass"
        title="This page doesn’t exist"
        variant="page"
      >
        <p>The link may be wrong, or the page may have moved or been deleted.</p>
        {signedIn && (
          <p className="mt-2">
            Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to search your workspace.
          </p>
        )}
      </EmptyState>
    </Page>
  );
}
