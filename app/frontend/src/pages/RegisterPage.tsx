import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Banner, errorMessage, Placeholder, TextField, TextLink } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { Page } from '../components/Page';
import { ResendVerification } from '../components/ResendVerification';
import { ButtonSkeleton, FieldSkeleton, SkeletonLine } from '../components/Skeletons';
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
      <Page
        description={
          <>
            We sent an email to {createdEmail}. Open the verification link in it within 24 hours to
            finish setting up your account. If that address already has an account, the email explains
            how to sign in instead.
          </>
        }
        title="Check your inbox"
        variant="panel"
      >
        <ResendVerification email={createdEmail} />
      </Page>
    );
  }

  if (invite.loading || (!code && site.loading)) {
    return (
      <Page title="Create your account" variant="panel">
        <Placeholder label="Loading sign-up">
          {code && <SkeletonLine className="mt-4" width="w-3/4" />}
          <div className="mt-8 grid gap-5">
            <FieldSkeleton />
            <FieldSkeleton hint />
            <FieldSkeleton />
            <FieldSkeleton hint />
            <ButtonSkeleton large width="w-40" />
          </div>
          <SkeletonLine className="mt-6 text-sm" width="w-48" />
        </Placeholder>
      </Page>
    );
  }

  if (!invite.data && site.data?.inviteOnly) {
    return (
      <Page
        description={
          <>
            {invite.error || 'Strata is taking new accounts by invitation only at the moment.'} Ask someone who
            uses Strata to invite you, then open the link in their invite.
          </>
        }
        title="Sign-up is closed for now"
        variant="panel"
      >
        <p className="mt-6 text-small text-muted">
          Already registered? <TextLink href="/login">Sign in</TextLink>
        </p>
      </Page>
    );
  }

  return (
    <Page description={invite.data && `${invitedLine(invite.data)}.`} title="Create your account" variant="panel">
      {invite.error && <Banner className="mt-4" tone="danger">{invite.error}</Banner>}
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
        {error && <Banner tone="danger">{error}</Banner>}

        <Button disabled={busy} label={busy ? 'Creating…' : 'Create account'} large primary submit />
      </form>
      <p className="mt-6 text-small text-muted">
        Already registered? <TextLink href="/login">Sign in</TextLink>
      </p>
    </Page>
  );
}
