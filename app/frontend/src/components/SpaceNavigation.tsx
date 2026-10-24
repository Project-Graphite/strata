import { Icon, Menu, Skeleton } from '@project-graphite/ui';
import { useLocation, useNavigate } from 'react-router';
import { areaOf } from '../navigation';
import { SpaceMark, useAllSpaces, useChosenSpace } from '../spaces';

export function SpaceNavigation() {
  const spaces = useAllSpaces();
  const { space, choose } = useChosenSpace();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!space) return spaces.loading ? <nav aria-label="Current space" className="mb-6 flex min-h-9 items-center"><Skeleton className="h-8 w-36 rounded-field" /></nav> : null;
  return (
    <nav aria-label="Current space" className="mb-6 flex min-h-9 min-w-0 items-center gap-2 text-sm text-muted">
      <Menu
        items={[
          ...(spaces.data ?? []).map((candidate) => ({
            label: candidate.name,
            icon: <SpaceMark space={candidate} />,
            onSelect: () => {
              choose(candidate.id);
              navigate(pathname.startsWith('/spaces') ? `/spaces/${candidate.id}` : areaOf(pathname) ?? '/');
            },
          })),
          { label: 'Manage spaces', separated: true, onSelect: () => navigate('/spaces') },
        ]}
        label="Switch space"
        trigger={<span className="inline-flex max-w-full items-center gap-2"><SpaceMark space={space} /><span className="min-w-0 truncate">{space.name}</span><Icon name="chevron-down" size={14} /></span>}
        triggerClassName="max-w-full min-w-0"
        triggerLabel={`Switch space: ${space.name}`}
      />
    </nav>
  );
}
