import Alert from '@mui/material/Alert';
import MuiLink from '@mui/material/Link';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, FormPanelSkeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../components/Page';
import { ResendVerification } from '../components/ResendVerification';
import { invitedLine, type InviteDetails } from '../invitations';
import { useResource } from '../useResource';
import { atLeast, atMost, emailAddress, password, required, useFormErrors } from '../validation';

export function RegisterPage() {
  const auth = useAuth();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const code = params.get('invite');
  const invite = useResource<InviteDetails>(code ? `/invitations/lookup/${encodeURIComponent(code)}` : null);
  const site = useResource<{ inviteOnly: boolean }>('/site');
  useDocumentTitle('Create account');

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
        ...(invite.data && code ? { invite: code } : {}),
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
        <h1 className="page-heading">Check your inbox</h1>
        <p className="mt-4 text-muted">
          We sent an email to {createdEmail}. Open the verification link in it within 24 hours to
          finish setting up your account. If that address already has an account, the email explains
          how to sign in instead.
        </p>
        <ResendVerification email={createdEmail} />
      </section>
    );
  }

  if (invite.loading || (!code && site.loading)) {
    return <FormPanelSkeleton label="Loading sign-up" />;
  }

  if (!invite.data && site.data?.inviteOnly) {
    return (
      <section className="form-panel page-enter">
        <h1 className="page-heading">Sign-up is closed for now</h1>
        <p className="mt-4 text-muted">
          {invite.error || 'Strata is taking new accounts by invitation only at the moment.'} Ask someone who
          uses Strata to invite you, then open the link in their invite.
        </p>
        <p className="mt-6 text-sm text-muted">
          Already registered? <MuiLink component={Link} to="/login" underline="always">Sign in</MuiLink>
        </p>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Create your account</h1>
      {invite.data && <p className="mt-4 mb-0 text-muted">{invitedLine(invite.data)}.</p>}
      {invite.error && <Alert className="mt-4 mb-0" severity="error">{invite.error}</Alert>}
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField autoComplete="name" label="Display name" maxLength={80} {...form.field('displayName')} />
        <TextField
          autoCapitalize="none"
          hint="How people find you to share spaces. It can’t be changed later."
          label="Handle"
          maxLength={32}
          spellCheck={false}
          {...form.field('handle')}
        />
        <TextField
          autoComplete="email"
          defaultValue={invite.data?.email ?? undefined}
          inputMode="email"
          label="Email"
          type="email"
          {...form.field('email')}
        />
        <TextField
          autoComplete="new-password"
          hint="At least 12 characters."
          label="Password"
          type="password"
          {...form.field('password')}
        />
        {error && (
          <Alert className="m-0" severity="error">
            {error}
          </Alert>
        )}
        <Button disabled={busy} label={busy ? 'Creating…' : 'Create account'} large primary submit />
      </form>
      <p className="mt-6 text-sm text-muted">
        Already registered? <MuiLink component={Link} to="/login" underline="always">Sign in</MuiLink>
      </p>
    </section>
  );
}
