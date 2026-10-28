import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Banner, errorMessage } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ButtonLink } from '../components/Button';
import { Page } from '../components/Page';

export function VerifyPage() {
  const auth = useAuth();
  const [parameters] = useSearchParams();
  const token = parameters.get('token')?.trim() ?? '';
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const started = useRef('');

  useEffect(() => {
    if (!token || started.current === token) return;
    started.current = token;
    auth.verify(token).then(
      () => setVerified(true),
      (reason: unknown) => setError(errorMessage(reason, 'Verification failed')),
    );
  }, [auth, token]);

  const next = auth.user ? <ButtonLink label="Back to settings" large primary to="/settings" /> : <ButtonLink label="Sign in" large primary to="/login" />;

  if (verified) {
    return (
      <Page title="Your email address is confirmed" variant="panel">
        <div className="mt-8">{next}</div>
      </Page>
    );
  }

  if (!token || error) {
    return (
      <Page title={token ? 'Your email wasn’t verified' : 'This link is incomplete'} variant="panel">
        {error ? (
          <Banner className="mt-4" tone="danger">
            {error}
          </Banner>
        ) : (
          <p className="mt-4 text-muted">Open the whole link from the email.</p>
        )}
        <p className="mt-3 text-muted">{auth.user ? 'Change your email in settings to get a new link.' : 'Sign in to get a new link.'}</p>
        <div className="mt-8">{next}</div>
      </Page>
    );
  }

  return (
    <Page title="Verify your email" variant="panel">
      <p className="mt-4 text-muted" role="status">
        Confirming your email address…
      </p>
    </Page>
  );
}
