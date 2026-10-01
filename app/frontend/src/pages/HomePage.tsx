import { Link } from 'react-router';
import { EmptyState, PageSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';

const areas = [
  ['Home', 'A dashboard of widgets you arrange yourself: weather, agenda, tasks, feeds and shortcuts.'],
  ['Agenda', 'Your Google Calendar beside your own events, renewals and deadlines.'],
  ['Notes', 'Fast capture that grows into pages, databases and live whiteboards.'],
  ['Recurring', 'Every subscription and bill, what it costs and when it renews.'],
  ['Tidy', 'Find and clear the clutter across your files and subscriptions.'],
];

export function HomePage() {
  const auth = useAuth();
  if (!auth.ready) {
    return <PageSkeleton label="Loading your workspace" />;
  }
  if (auth.user) {
    return (
      <section className="page-enter">
        <p className="eyebrow">home</p>
        <h1 className="page-title">Welcome, {auth.user.displayName}</h1>
        <div className="mt-10">
          <EmptyState title="Your workspace is being built">
            <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
              Notes, tasks and your dashboard arrive here first, then the agenda, subscriptions and
              whiteboards.
            </p>
          </EmptyState>
        </div>
      </section>
    );
  }
  return (
    <section className="page-enter">
      <p className="eyebrow">a personal workspace</p>
      <h1 className="page-title max-w-3xl">Your life, in layers.</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Strata brings your dashboard, agenda, notes, whiteboards, subscriptions and files into one
        calm, private place. Free, open source and built by Project Graphite.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="primary-button inline-flex" to="/register">
          Create your workspace
        </Link>
        <Link className="secondary-button inline-flex" to="/login">
          Sign in
        </Link>
      </div>
      <ul className="mt-14 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(([name, description]) => (
          <li className="rounded-xl border border-line bg-surface p-5" key={name}>
            <h2 className="m-0 text-lg font-medium">{name}</h2>
            <p className="mt-2 mb-0 text-sm text-muted">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
