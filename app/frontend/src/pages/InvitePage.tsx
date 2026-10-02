import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { EmptyState, FormPanelSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { invitedLine, type InviteDetails } from '../invitations';
import { addJoinedSpace, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

export function InvitePage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const invite = useResource<InviteDetails>(`/invitations/lookup/${encodeURIComponent(code)}`);
  const joining = useAction();

  if (!auth.ready || invite.loading) return <FormPanelSkeleton label="Loading this invite" />;
  if (!invite.data) {
    return (
      <EmptyState title="This invite cannot be used">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
          {invite.error} Ask the person who invited you for a new link.
        </p>
      </EmptyState>
    );
  }

  return (
    <section className="form-panel page-enter">
      <p className="eyebrow">invitation</p>
      <h1 className="page-title">{invitedLine(invite.data)}</h1>
      {!auth.user ? (
        <>
          <p className="mt-5 text-muted">
            {invite.data.kind === 'space'
              ? 'Create an account to join, or sign in if you already have one.'
              : 'Create your account to start your own workspace.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="primary-button inline-flex" to={`/register?invite=${encodeURIComponent(code)}`}>
              Create account
            </Link>
            <Link className="secondary-button inline-flex" state={{ from: location }} to="/login">
              Sign in
            </Link>
          </div>
        </>
      ) : invite.data.kind === 'app' ? (
        <p className="mt-5 text-muted">
          You already have a Strata account, so there is nothing more to do. <Link to="/">Go home</Link>
        </p>
      ) : (
        <div className="mt-8 grid gap-4">
          {joining.status}
          <button
            className="primary-button inline-flex w-fit"
            disabled={joining.busy}
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
            type="button"
          >
            {joining.busy ? 'Joining…' : `Join ${invite.data.space}`}
          </button>
        </div>
      )}
    </section>
  );
}
