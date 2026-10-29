import { Link } from 'react-router';
import { useAuth } from '../auth';
import { androidReleasesPageUrl, isNativeAndroid } from '../native-capture';

export function AboutLinks({ className = '', legal = true }: { className?: string; legal?: boolean }) {
  const auth = useAuth();
  const links = !legal
    ? []
    : auth.user
      ? [['/settings/legal', 'Legal']]
      : [
          ['/privacy', 'Privacy'],
          ['/terms', 'Terms'],
        ];
  return (
    <nav aria-label="About" className={`mono-sm flex gap-5 ${className}`}>
      {!isNativeAndroid() && (
        <a className="text-faint no-underline hover:text-ink" href={androidReleasesPageUrl} rel="noreferrer" target="_blank">
          Android app
        </a>
      )}
      {links.map(([to, label]) => (
        <Link className="text-faint no-underline hover:text-ink" key={to} to={to}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
