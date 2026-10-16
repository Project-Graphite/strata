import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router';
import { PageSkeleton, Tabs } from '@project-graphite/ui';
import { roleOptions, SpaceMark, useSpaces, type Space } from '../../spaces';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { Page } from '../../components/Page';

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
      <Empty title="Space not found">
        It may have been deleted, or you are no longer a member. <Link to="/spaces">See your spaces</Link>
      </Empty>
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
    <Page
      description={space.kind === 'shared' && `Shared space · you are ${space.role === 'viewer' ? 'a' : 'an'} ${roleOptions.find((option) => option.value === space.role)?.label.toLowerCase()}`}
      documentTitle={space.name}
      title={
        <span className="inline-flex items-center gap-3">
          <SpaceMark large space={space} />
          {space.name}
        </span>
      }
    >
      <Tabs items={tabs.map(([href, label]) => ({ active: pathname === href, href, label }))} label="Space" />
      <div className="fade-in grid gap-6">
        <Outlet context={space} />
      </div>
    </Page>
  );
}
