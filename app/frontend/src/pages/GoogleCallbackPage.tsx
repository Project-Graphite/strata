import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, FormPanelSkeleton, TextLink, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Page } from '../components/Page';
import { googleConnectedMessages } from '../google';
import { TwoStepForm } from './LoginPage';

export function GoogleCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const show = useSnackbar();
  const [params] = useSearchParams();
  const refused = params.get('error');
  const [error, setError] = useState(refused === 'access_denied' ? 'You cancelled on Google, so nothing changed.' : refused ? 'Google could not finish. Try again.' : '');
  const [challenge, setChallenge] = useState('');
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

  if (challenge) {
    return auth.user ? <Navigate replace to="/" /> : <TwoStepForm challenge={challenge} onRestart={() => navigate('/login', { replace: true })} />;
  }
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
