import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { required, useFormErrors } from '../validation';

export function VerifyPage() {
  const auth = useAuth();
  const [parameters] = useSearchParams();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (
      !form.check(event.currentTarget, {
        token: [required('Paste the token from the email, or open the link it contains.')],
      })
    ) {
      return;
    }
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await auth.verify(String(values.get('token')).trim());
      setVerified(true);
    } catch (reason) {
      setError(errorMessage(reason, 'Verification failed'));
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <section className="form-panel page-enter">
        <p className="eyebrow">Email verified</p>
        <h1 className="page-title">Your email address is confirmed.</h1>
        {auth.user ? (
          <Link className="primary-button mt-7 inline-flex" to="/settings/account">Back to settings</Link>
        ) : (
          <Link className="primary-button mt-7 inline-flex" to="/login">Sign in</Link>
        )}
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <p className="eyebrow">One last step</p>
      <h1 className="page-title">Verify your email</h1>
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField
          defaultValue={parameters.get('token') ?? ''}
          label="Verification token"
          spellCheck={false}
          {...form.field('token')}
        />
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
    </section>
  );
}
