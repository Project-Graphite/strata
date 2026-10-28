import Alert from '@mui/material/Alert';
import MuiLink from '@mui/material/Link';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, TextField } from '@project-graphite/ui';
import { apiRequest } from '../api';
import { emailAddress, password, required, useFormErrors } from '../validation';
import { Button, ButtonLink } from '../components/Button';
import { Hint } from '../components/Hint';
import { Page } from '../components/Page';

export function ForgotPasswordPage() {
  const form = useFormErrors();
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.check(event.currentTarget, { email: [required('Enter your email address.'), emailAddress] })) {
      return;
    }
    setBusy(true);
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSentTo(email);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not send the reset link'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Reset your password" variant="panel">
      {sentTo ? (
        <p className="mt-4 text-muted">
          If an account uses {sentTo}, a reset link is on its way. It works for one hour.
        </p>
      ) : (
        <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
          <TextField autoComplete="email" inputMode="email" label="Email" type="email" {...form.field('email')} />
          {error && (
            <Alert className="m-0" severity="error">
              {error}
            </Alert>
          )}
          <Button disabled={busy} label={busy ? 'Sending…' : 'Send reset link'} large primary submit />
        </form>
      )}
      <p className="mt-6 text-sm text-muted">
        <MuiLink component={Link} to="/login" underline="always">Back to sign in</MuiLink>
      </p>
    </Page>
  );
}

export function ResetPasswordPage() {
  const [parameters] = useSearchParams();
  const token = parameters.get('token');
  const form = useFormErrors();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.check(event.currentTarget, { password })) return;
    setBusy(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: String(new FormData(event.currentTarget).get('password')),
        }),
      });
      setDone(true);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not reset the password'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Page
        description="Every device that was signed in has been signed out. Your access tokens and private calendar link were revoked, and your webhooks were turned off."
        title="Sign in with your new password"
        variant="panel"
      >
        <div className="mt-8">
          <ButtonLink label="Sign in" large primary to="/login" />
        </div>
      </Page>
    );
  }

  if (!token) {
    return (
      <Page description="Open the whole link from the email, or request a new one." title="This link is incomplete" variant="panel">
        <div className="mt-8">
          <ButtonLink label="Request a new link" large primary to="/forgot-password" />
        </div>
      </Page>
    );
  }

  return (
    <Page title="Choose a new password" variant="panel">
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField
          autoComplete="new-password"
          hint="At least 12 characters."
          label="New password"
          type="password"
          {...form.field('password')}
        />
        {error && (
          <>
            <Alert className="m-0" severity="error">
              {error}
            </Alert>
            <Hint>
              <MuiLink component={Link} to="/forgot-password" underline="always">Request a new link</MuiLink>
            </Hint>
          </>
        )}
        <Button disabled={busy} label={busy ? 'Saving…' : 'Save password'} large primary submit />
      </form>
    </Page>
  );
}
