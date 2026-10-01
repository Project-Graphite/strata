import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="page-enter mx-auto max-w-2xl py-10 text-center">
      <p className="eyebrow">404</p>
      <h1 className="page-title">Page not found</h1>
      <p className="mt-5 text-muted">
        There is nothing at this address. The link may be wrong, or the page may have moved.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link className="primary-button inline-flex" to="/">
          Go home
        </Link>
      </div>
    </div>
  );
}
