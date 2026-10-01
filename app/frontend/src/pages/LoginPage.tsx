import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ResendVerification } from '../components/ResendVerification';
import { emailAddress, required, useFormErrors } from '../validation';

const unverified = 'Verify your email before signing in';

export function LoginPage() {
  const auth = useAuth();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (
      !form.check(event.currentTarget, {
        email: [required('Enter your email address.'), emailAddress],
        password: [required('Enter your password.')],
      })
    ) {
      return;
    }
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const submitted = String(values.get('email')).trim();
    setEmail(submitted);
    try {
      await auth.login(submitted, String(values.get('password')));
    } catch (reason) {
      setError(errorMessage(reason, 'Sign in failed'));
      setBusy(false);
    }
  }

  return (
    <section className="form-panel page-enter">
      <p className="eyebrow">Welcome back</p>
      <h1 className="page-title">Sign in</h1>
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField autoComplete="email" inputMode="email" label="Email" type="email" {...form.field('email')} />
        <TextField autoComplete="current-password" label="Password" type="password" {...form.field('password')} />
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error === unverified && <ResendVerification email={email} key={email} />}
      <p className="mt-6 text-sm text-muted">
        <Link className="rule-link" to="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        New here? <Link className="rule-link" to="/register">Create an account</Link>
      </p>
    </section>
  );
}
