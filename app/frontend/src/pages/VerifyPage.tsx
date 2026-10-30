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
      <Page
        description={`${error ? '' : 'Open the whole link from the email. '}${auth.user ? 'Change your email in settings to get a new link.' : 'Sign in to get a new link.'}`}
        title={token ? 'Your email wasn’t verified' : 'This link is incomplete'}
        variant="panel"
      >
        {error && (
          <Banner className="mt-4" tone="danger">
            {error}
          </Banner>
        )}
        <div className="mt-8">{next}</div>
      </Page>
    );
  }

  return (
    <Page description={<span role="status">Confirming your email address…</span>} title="Verify your email" variant="panel">
      {null}
    </Page>
  );
}
