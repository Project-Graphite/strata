import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { FormPanelSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { invitedLine, type InviteDetails } from '../invitations';
import { addJoinedSpace, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, ButtonLink } from '../components/Button';
import { Empty } from '../components/Empty';
import { useDocumentTitle } from '../components/Page';
import { LoadError } from '../components/LoadError';

export function InvitePage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const invite = useResource<InviteDetails>(`/invitations/lookup/${encodeURIComponent(code)}`);
  const joining = useAction();
  useDocumentTitle('Invitation');

  if (!auth.ready || invite.loading) return <FormPanelSkeleton label="Loading this invite" />;
  if (invite.status === 404) {
    return (
      <Empty title="This invite cannot be used">
        {invite.error} Ask the person who invited you for a new link.
      </Empty>
    );
  }
  if (!invite.data) {
    return (
      <section className="form-panel page-enter">
        <h1 className="page-heading">Your invite</h1>
        <div className="mt-8">
          <LoadError error={invite.error} onRetry={invite.reload} />
        </div>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">{invitedLine(invite.data)}</h1>
      {!auth.user ? (
        <>
          <p className="mt-5 text-muted">
            {invite.data.kind === 'space'
              ? 'Create an account to join, or sign in if you already have one.'
              : 'Create your account to start your own workspace.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink label="Create account" large primary to={`/register?invite=${encodeURIComponent(code)}`} />
            <ButtonLink label="Sign in" large state={{ from: location }} to="/login" />
          </div>
        </>
      ) : invite.data.kind === 'app' ? (
        <p className="mt-5 text-muted">
          You already have a Strata account, so there is nothing more to do. <Link to="/">Go home</Link>
        </p>
      ) : (
        <div className="mt-8 grid gap-4">
          <Button
            disabled={joining.busy}
            label={joining.busy ? 'Joining…' : `Join ${invite.data.space}`}
            onClick={() =>
              void joining.run(async () => {
                const { spaceId } = await auth.request<{ spaceId: string }>('/invitations/redeem', {
                  method: 'POST',
                  body: JSON.stringify({ code }),
                });
                await addJoinedSpace(auth.request, spaces, spaceId);
                navigate(`/spaces/${spaceId}`);
                return '';
              }, 'Could not join the space')
            }
            primary
          />
        </div>
      )}
    </section>
  );
}
