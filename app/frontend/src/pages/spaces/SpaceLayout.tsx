import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router';
import { EmptyState, PageHeader, PageSkeleton, Tabs } from '@project-graphite/ui';
import { SpaceDot, useSpaces, type Space } from '../../spaces';
import { LoadError } from '../../components/LoadError';

export function useSpace() {
  return useOutletContext<Space>();
}

export function SpaceLayout() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const spaces = useSpaces();

  if (spaces.error) return <LoadError error={spaces.error} onRetry={spaces.reload} />;
  if (!spaces.data) return <PageSkeleton label="Loading this space" />;
  const space = spaces.data.find((candidate) => candidate.id === id);
  if (!space) {
    return (
      <EmptyState title="Space not found">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
          It may have been deleted, or you are no longer a member. <Link to="/spaces">See your spaces</Link>
        </p>
      </EmptyState>
    );
  }
  const base = `/spaces/${space.id}`;
  const tabs = [
    [base, 'Items'],
    [`${base}/notes`, 'Notes'],
    [`${base}/tasks`, 'Tasks'],
    [`${base}/recurring`, 'Recurring'],
    [`${base}/habits`, 'Habits'],
    [`${base}/tags`, 'Tags'],
    [`${base}/members`, 'Members'],
    [`${base}/activity`, 'Activity'],
  ] as const;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={space.kind === 'personal' ? 'Personal space' : `Shared space · ${space.role}`}
        title={
          <span className="inline-flex items-center gap-3">
            <SpaceDot color={space.color} />
            {space.name}
          </span>
        }
      />
      <div className="mt-8">
        <Tabs items={tabs.map(([href, label]) => ({ active: pathname === href, href, label }))} label="Space" />
      </div>
      <div className="mt-8">
        <Outlet context={space} />
      </div>
    </div>
  );
}
