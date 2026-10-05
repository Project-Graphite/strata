import { Link } from 'react-router';
import { Icon } from '@project-graphite/ui';

export function NotFoundPage() {
  return (
    <div className="page-enter mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center">
      <span className="error-state-icon">
        <Icon name="compass" size={22} />
      </span>
      <p className="mono-sm m-0 text-faint">404</p>
      <h1 className="page-heading">Page not found</h1>
      <p className="m-0 text-muted">The link may be wrong, or the page may have moved.</p>
      <Link className="primary-button mt-4 inline-flex" to="/">
        Go home
      </Link>
    </div>
  );
}
