import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, TextField, useSnackbar } from '@project-graphite/ui';
import { apiRequest } from '../api';
import { emailAddress, password, required, useFormErrors } from '../validation';
import { Button, ButtonLink } from '../components/Button';
import { Hint } from '../components/Hint';
import { useDocumentTitle } from '../components/Page';

export function ForgotPasswordPage() {
  const form = useFormErrors();
  const [sentTo, setSentTo] = useState('');
  const show = useSnackbar();
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Reset your password');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      show({ message: errorMessage(reason, 'Could not send the reset link'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Reset your password</h1>
      {sentTo ? (
        <p className="mt-6 text-muted">
          If an account uses {sentTo}, a reset link is on its way. It works for one hour.
        </p>
      ) : (
        <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
          <TextField autoComplete="email" inputMode="email" label="Email" type="email" {...form.field('email')} />
          <Button disabled={busy} label={busy ? 'Sending…' : 'Send reset link'} large primary submit />
        </form>
      )}
      <p className="mt-6 text-sm text-muted">
        <Link className="rule-link" to="/login">Back to sign in</Link>
      </p>
    </section>
  );
}

export function ResetPasswordPage() {
  const [parameters] = useSearchParams();
  const form = useFormErrors();
  const [done, setDone] = useState(false);
  const show = useSnackbar();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Choose a new password');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.check(event.currentTarget, { password })) return;
    setBusy(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: parameters.get('token') ?? '',
          password: String(new FormData(event.currentTarget).get('password')),
        }),
      });
      setDone(true);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not reset the password'));
      show({ message: errorMessage(reason, 'Could not reset the password'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="form-panel page-enter">
        <h1 className="page-heading">Sign in with your new password.</h1>
        <p className="mt-5 text-muted">Every device that was signed in has been signed out. Your access tokens and private calendar link were revoked, and your webhooks were turned off.</p>
        <div className="mt-7">
          <ButtonLink label="Sign in" large primary to="/login" />
        </div>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Choose a new password</h1>
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField
          autoComplete="new-password"
          hint="At least 12 characters."
          label="New password"
          type="password"
          {...form.field('password')}
        />
        {error && (
          <Hint>
            <Link className="rule-link" to="/forgot-password">Request a new link</Link>
          </Hint>
        )}
        <Button disabled={busy} label={busy ? 'Saving…' : 'Save password'} large primary submit />
      </form>
    </section>
  );
}
