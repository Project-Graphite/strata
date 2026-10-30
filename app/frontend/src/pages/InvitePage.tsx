import { useLocation, useNavigate, useParams } from 'react-router';
import { Placeholder } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { invitedLine, type InviteDetails } from '../invitations';
import { addJoinedSpace, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, ButtonLink } from '../components/Button';
import { Empty } from '../components/Empty';
import { Page } from '../components/Page';
import { LoadError } from '../components/LoadError';
import { ButtonSkeleton, SkeletonLine } from '../components/Skeletons';

export function InvitePage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const invite = useResource<InviteDetails>(`/invitations/lookup/${encodeURIComponent(code)}`);
  const joining = useAction();

  if (!auth.ready || invite.loading) {
    return (
      <Page
        description={<SkeletonLine width="w-full" />}
        documentTitle="Invitation"
        title={<SkeletonLine width="w-4/5" />}
        variant="panel"
      >
        <Placeholder label="Loading this invite">
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonSkeleton large width="w-36" />
            <ButtonSkeleton large width="w-24" />
          </div>
        </Placeholder>
      </Page>
    );
  }
  if (invite.status === 404) {
    return (
      <Page title="Invitation" titleHidden>
        <Empty title="This invite can’t be used" variant="page">
          {invite.error} Ask the person who invited you for a new link.
        </Empty>
      </Page>
    );
  }
  if (!invite.data) {
    return (
      <Page title="Your invite" variant="panel">
        <div className="mt-8">
          <LoadError error={invite.error} onRetry={invite.reload} />
        </div>
      </Page>
    );
  }

  return (
    <Page
      description={
        !auth.user
          ? invite.data.kind === 'space'
            ? 'Create an account to join, or sign in if you already have one.'
            : 'Create your account to start your own workspace.'
          : invite.data.kind === 'app' && 'You already have a Strata account, so there’s nothing more to do.'
      }
      title={invitedLine(invite.data)}
      variant="panel"
    >
      {!auth.user ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink label="Create account" large primary to={`/register?invite=${encodeURIComponent(code)}`} />
          <ButtonLink label="Sign in" large state={{ from: location }} to="/login" />
        </div>
      ) : invite.data.kind === 'app' ? (
        <div className="mt-8">
          <ButtonLink label="Go home" large primary to="/" />
        </div>
      ) : (
        <div className="mt-8">
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
            large
            primary
          />
        </div>
      )}
    </Page>
  );
}
