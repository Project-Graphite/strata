import { Link } from 'react-router';

export function AboutLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="About" className={`mono-sm flex gap-5 ${className}`}>
      <Link className="text-faint no-underline hover:text-ink" to="/privacy">
        Privacy
      </Link>
      <Link className="text-faint no-underline hover:text-ink" to="/terms">
        Terms
      </Link>
    </nav>
  );
}
