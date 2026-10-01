import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ResendVerification } from '../components/ResendVerification';
import { atLeast, atMost, emailAddress, password, required, useFormErrors } from '../validation';

export function RegisterPage() {
  const auth = useAuth();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (
      !form.check(event.currentTarget, {
        displayName: [required('Enter a display name.'), atMost(80, 'Use at most 80 characters.')],
        handle: [
          required('Choose a handle.'),
          atLeast(3, 'Use at least 3 characters.'),
          atMost(32, 'Use at most 32 characters.'),
          (value) =>
            /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(value.trim().toLowerCase())
              ? undefined
              : 'Use letters, numbers, - and _, starting and ending with a letter or number.',
        ],
        email: [required('Enter your email address.'), emailAddress],
        password,
      })
    ) {
      return;
    }
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email')).trim();
    try {
      await auth.register({
        email,
        handle: String(values.get('handle')).trim().toLowerCase(),
        displayName: String(values.get('displayName')),
        password: String(values.get('password')),
      });
      setCreatedEmail(email);
    } catch (reason) {
      setError(errorMessage(reason, 'Registration failed'));
    } finally {
      setBusy(false);
    }
  }

  if (createdEmail) {
    return (
      <section className="form-panel page-enter">
        <p className="eyebrow">Almost there</p>
        <h1 className="page-title">Check your inbox</h1>
        <p className="mt-5 text-muted">
          We sent an email to {createdEmail}. Open the verification link in it within 24 hours to
          finish setting up your account. If that address already has an account, the email explains
          how to sign in instead.
        </p>
        <ResendVerification email={createdEmail} />
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <p className="eyebrow">Start your workspace</p>
      <h1 className="page-title">Create your account</h1>
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField autoComplete="name" label="Display name" maxLength={80} {...form.field('displayName')} />
        <TextField
          autoCapitalize="none"
          hint="How people find you to share spaces. It cannot be changed later."
          label="Handle"
          maxLength={32}
          spellCheck={false}
          {...form.field('handle')}
        />
        <TextField autoComplete="email" inputMode="email" label="Email" type="email" {...form.field('email')} />
        <TextField
          autoComplete="new-password"
          hint="At least 12 characters."
          label="Password"
          type="password"
          {...form.field('password')}
        />
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already registered? <Link className="rule-link" to="/login">Sign in</Link>
      </p>
    </section>
  );
}
