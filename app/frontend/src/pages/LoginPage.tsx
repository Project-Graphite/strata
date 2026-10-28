import { useState, type FormEvent } from 'react';
import { Banner, CodeInput, errorMessage, TextField, TextLink } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { Page } from '../components/Page';
import { ResendVerification } from '../components/ResendVerification';
import { emailAddress, required, useFormErrors } from '../validation';

const unverified = 'Verify your email before signing in';

function TwoStepForm({ challenge, onRestart }: { challenge: string; onRestart: () => void }) {
  const auth = useAuth();
  const form = useFormErrors();
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.check(event.currentTarget, { code: [required(recovery ? 'Enter a recovery code.' : 'Enter the code.')] })) {
      return;
    }
    setBusy(true);
    try {
      await auth.completeTwoStep(challenge, String(new FormData(event.currentTarget).get('code')).trim());
    } catch (reason) {
      setError(errorMessage(reason, 'Sign in failed'));
      setBusy(false);
    }
  }

  return (
    <Page
      description={
        recovery
          ? 'Type one of the recovery codes you saved. Each one works once.'
          : 'Open your authenticator app and type the six-digit code it shows for Strata.'
      }
      title="Enter your code"
      variant="panel"
    >
      <form className="mt-8 grid gap-5" key={recovery ? 'recovery' : 'code'} noValidate onSubmit={submit}>
        {recovery ? (
          <TextField
            autoCapitalize="none"
            autoComplete="off"
            label="Recovery code"
            spellCheck={false}
            {...form.field('code')}
          />
        ) : (
          <CodeInput autoFocus label="Six-digit code" {...form.field('code')} />
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        <Button disabled={busy} label={busy ? 'Signing in…' : 'Sign in'} large primary submit />
      </form>
      <p className="mt-6 text-small text-muted">
        <TextLink onClick={() => setRecovery((current) => !current)}>
          {recovery ? 'Use the authenticator app instead' : 'Use a recovery code instead'}
        </TextLink>
      </p>
      <p className="mt-2 text-small text-muted">
        <TextLink onClick={onRestart}>Start again</TextLink>
      </p>
    </Page>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState('');

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
      const result = await auth.login(submitted, String(values.get('password')));
      if (result) {
        setChallenge(result.challenge);
        setBusy(false);
      }
    } catch (reason) {
      setError(errorMessage(reason, 'Sign in failed'));
      setBusy(false);
    }
  }

  if (challenge) {
    return <TwoStepForm challenge={challenge} onRestart={() => setChallenge('')} />;
  }

  return (
    <Page title="Sign in" variant="panel">
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField autoComplete="email" inputMode="email" label="Email" type="email" {...form.field('email')} />
        <TextField autoComplete="current-password" label="Password" type="password" {...form.field('password')} />
        {error && <Banner tone="danger">{error}</Banner>}
        <Button disabled={busy} label={busy ? 'Signing in…' : 'Sign in'} large primary submit />
      </form>
      {error === unverified && <ResendVerification email={email} key={email} />}
      <p className="mt-6 text-small text-muted">
        <TextLink href="/forgot-password">Forgot your password?</TextLink>
      </p>
      <p className="mt-2 text-small text-muted">
        New here? <TextLink href="/register">Create account</TextLink>
      </p>
    </Page>
  );
}
