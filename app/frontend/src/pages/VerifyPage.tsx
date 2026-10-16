import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage, TextField, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { required, useFormErrors } from '../validation';
import { Button, ButtonLink } from '../components/Button';
import { useDocumentTitle } from '../components/Page';

export function VerifyPage() {
  const auth = useAuth();
  const [parameters] = useSearchParams();
  const form = useFormErrors();
  const show = useSnackbar();
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Verify your email');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      show({ message: errorMessage(reason, 'Verification failed'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <section className="form-panel page-enter">
        <h1 className="page-heading">Your email address is confirmed.</h1>
        <div className="mt-7">
          {auth.user ? <ButtonLink label="Back to settings" large primary to="/settings" /> : <ButtonLink label="Sign in" large primary to="/login" />}
        </div>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Verify your email</h1>
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField
          defaultValue={parameters.get('token') ?? ''}
          label="Verification token"
          spellCheck={false}
          {...form.field('token')}
        />
        <Button disabled={busy} label={busy ? 'Verifying…' : 'Verify email'} large primary submit />
      </form>
    </section>
  );
}
