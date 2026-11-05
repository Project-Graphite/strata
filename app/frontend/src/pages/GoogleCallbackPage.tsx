import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Banner, CodeInput, errorMessage, FormPanelSkeleton, TextField, TextLink, useSnackbar } from '@project-graphite/ui';
import { useAuth, type GoogleChoice } from '../auth';
import { Button } from '../components/Button';
import { Page } from '../components/Page';
import { googleConnectedMessages } from '../google';
import { required, useFormErrors } from '../validation';
import { TwoStepForm } from './LoginPage';

function ChooseAccount({ choice }: { choice: GoogleChoice }) {
  const auth = useAuth();
  const form = useFormErrors();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [twoStep, setTwoStep] = useState(false);

  async function attempt(work: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await work();
    } catch (reason) {
      setError(errorMessage(reason, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.check(event.currentTarget, { login: [required('Enter your email or handle.')], password: [required('Enter your password.')], ...(twoStep ? { code: [required('Enter the code.')] } : {}) })) return;
    const values = new FormData(event.currentTarget);
    void attempt(async () => {
      const result = await auth.linkGoogleToExisting(String(values.get('login')).trim(), String(values.get('password')), twoStep ? String(values.get('code')).trim() : undefined);
      if (result) setTwoStep(true);
    });
  }

  return (
    <Page
      description={
        choice.choose === 'email'
          ? `A Strata account already uses ${choice.email}. Sign in to it once and Google is linked, so next time Google signs you straight in.`
          : `You've signed in to Strata on this browser before. If that's your account, sign in to it once and ${choice.email} is linked to it.`
      }
      title={choice.choose === 'email' ? 'Link Google to your account' : 'Is this your Strata account?'}
      variant="panel"
    >
      <form className="mt-8 grid gap-5" noValidate onSubmit={submit}>
        <TextField autoCapitalize="none" autoComplete="username" defaultValue={choice.choose === 'email' ? choice.email : undefined} label="Email or handle" spellCheck={false} {...form.field('login')} />
        <TextField autoComplete="current-password" label="Password" type="password" {...form.field('password')} />
        {twoStep && <CodeInput autoFocus label="Six-digit code or recovery code" {...form.field('code')} />}
        {error && <Banner tone="danger">{error}</Banner>}
        <Button disabled={busy} label={busy ? 'Signing in…' : 'Sign in and link Google'} large primary submit />
      </form>
      {choice.choose === 'browser' && (
        <p className="mt-6 text-small text-muted">
          Not yours? <TextLink onClick={() => void attempt(() => auth.createFromGoogle())}>Create a new account with Google</TextLink>
        </p>
      )}
    </Page>
  );
}

export function GoogleCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const show = useSnackbar();
  const [params] = useSearchParams();
  const refused = params.get('error');
  const [error, setError] = useState(refused === 'access_denied' ? 'You cancelled on Google, so nothing changed.' : refused ? 'Google could not finish. Try again.' : '');
  const [challenge, setChallenge] = useState('');
  const [choice, setChoice] = useState<GoogleChoice>();
  const started = useRef(false);

  useEffect(() => {
    if (!auth.ready || started.current || refused) return;
    started.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setError('This Google link is incomplete. Start again.');
      return;
    }
    auth.finishGoogle(code, state).then(
      (result) => {
        if ('challenge' in result) {
          setChallenge(result.challenge);
        } else if ('choose' in result) {
          setChoice(result);
        } else if ('connected' in result) {
          show({ message: googleConnectedMessages[result.connected] });
          navigate(result.returnTo, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      },
      (reason: unknown) => setError(errorMessage(reason, 'Google could not finish. Try again.')),
    );
  }, [auth, navigate, params, refused, show]);

  if ((challenge || choice) && auth.user) return <Navigate replace to="/" />;
  if (challenge) return <TwoStepForm challenge={challenge} onRestart={() => navigate('/login', { replace: true })} />;
  if (choice) return <ChooseAccount choice={choice} />;
  if (error) {
    return (
      <Page description={error} title="Google didn’t finish" variant="panel">
        <p className="mt-6 text-small text-muted">
          <TextLink href={auth.user ? '/settings/security' : '/login'}>{auth.user ? 'Back to settings' : 'Back to sign in'}</TextLink>
        </p>
      </Page>
    );
  }
  return <FormPanelSkeleton label="Finishing with Google" />;
}
