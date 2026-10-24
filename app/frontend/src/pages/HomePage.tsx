import { Icon, PageSkeleton, type IconName } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { DashboardHome } from '../dashboard/Dashboard';
import { ButtonAnchor, ButtonLink } from '../components/Button';
import { androidReleaseUrl, isNativeAndroid } from '../native-capture';

const areas: [IconName, string, string][] = [
  ['check-mark', 'Tasks', 'Lists, due dates, repeats and reminders.'],
  ['calendar', 'Agenda', 'Today at a glance, with events, RSVPs, due tasks and renewals.'],
  ['file', 'Pages', 'Notes, checklists, tables and anything you write.'],
  ['board', 'Boards', 'Whiteboards for sketches, plans and ideas.'],
  ['bookmark', 'Bookmarks', 'Links and articles saved to read later.'],
  ['pencil', 'Journal', 'A mood for each day and a weekly review.'],
  ['library', 'Files', 'Documents, photos and anything else you upload.'],
  ['wallet', 'Spending', 'Expenses, budgets, recurring bills and Android transaction capture.'],
  ['folder', 'Spaces', 'Share tasks, pages and boards with people you choose.'],
];

export function HomePage() {
  const auth = useAuth();
  if (!auth.ready) {
    return <PageSkeleton label="Loading your workspace" />;
  }
  if (auth.user) {
    return <DashboardHome />;
  }
  return (
    <section className="page-enter">
      <h1 className="page-heading max-w-3xl">Tasks, agenda, pages, spending and files in one place</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">Free and open source, from Project Graphite.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink label="Create account" large primary to="/register" />
        <ButtonLink label="Sign in" large to="/login" />
        {!isNativeAndroid() && <ButtonAnchor href={androidReleaseUrl} label="Download for Android" large />}
      </div>
      <ul className="stagger-in mt-14 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(([icon, name, description]) => (
          <li className="rounded-panel border border-line bg-surface p-4 transition-colors hover:border-muted" key={name}>
            <h2 className="m-0 flex items-center gap-2 text-lg font-medium">
              <Icon name={icon} size={18} />
              {name}
            </h2>
            <p className="mt-2 mb-0 text-sm text-muted">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
