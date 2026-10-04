import { Link } from 'react-router';
import { Icon, PageSkeleton, type IconName } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { DashboardHome } from '../dashboard/Dashboard';

const areas: [IconName, string, string][] = [
  ['home', 'Home', 'A dashboard of widgets you arrange.'],
  ['calendar', 'Agenda', 'Events, RSVPs, due tasks and renewals together.'],
  ['check', 'Tasks', 'Lists, repeats, reminders and a Today view.'],
  ['repeat', 'Recurring', 'What each subscription costs and when it renews.'],
  ['sparkles', 'Tidy', 'Duplicate files and subscriptions you no longer use.'],
  ['folder', 'Spaces', 'Share any of it with the people you choose.'],
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
      <h1 className="page-heading max-w-3xl">Tasks, events, subscriptions and files in one place.</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">Free and open source, from Project Graphite.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="primary-button inline-flex" to="/register">
          Create an account
        </Link>
        <Link className="secondary-button inline-flex" to="/login">
          Sign in
        </Link>
      </div>
      <ul className="mt-14 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(([icon, name, description]) => (
          <li className="rounded-xl border border-line bg-surface p-5" key={name}>
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
