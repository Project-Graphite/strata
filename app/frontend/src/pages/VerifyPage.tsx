import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ButtonLink } from '../components/Button';
import { useDocumentTitle } from '../components/Page';

export function VerifyPage() {
  const auth = useAuth();
  const [parameters] = useSearchParams();
  const token = parameters.get('token')?.trim() ?? '';
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const started = useRef('');
  useDocumentTitle('Verify your email');

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
      <section className="form-panel page-enter">
        <h1 className="page-heading">Your email address is confirmed</h1>
        <div className="mt-7">{next}</div>
      </section>
    );
  }

  if (!token || error) {
    return (
      <section className="form-panel page-enter">
        <h1 className="page-heading">{token ? 'Your email was not verified' : 'This link is incomplete'}</h1>
        {error ? (
          <p className="error-message mt-5 mb-0" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-5 text-muted">Open the whole link from the email.</p>
        )}
        <p className="mt-3 text-muted">{auth.user ? 'Change your email in settings to get a new link.' : 'Sign in to get a new link.'}</p>
        <div className="mt-7">{next}</div>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Verify your email</h1>
      <p className="mt-5 text-muted" role="status">
        Confirming your email address…
      </p>
    </section>
  );
}
