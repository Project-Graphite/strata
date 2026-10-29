import { Link } from 'react-router';
import { useAuth } from '../auth';
import { androidReleasesPageUrl, isNativeAndroid } from '../native-capture';

export function AboutLinks({ className = '' }: { className?: string }) {
  const auth = useAuth();
  const links = auth.user
    ? []
    : [
        ['/privacy', 'Privacy'],
        ['/terms', 'Terms'],
      ];
  if (isNativeAndroid() && !links.length) return null;
  return (
    <nav aria-label="About" className={`mono-sm flex gap-5 ${className}`}>
      {!isNativeAndroid() && (
        <a className="inline-flex items-center text-faint no-underline hover:text-ink pointer-coarse:min-h-11" href={androidReleasesPageUrl} rel="noreferrer" target="_blank">
          Android app
        </a>
      )}
      {links.map(([to, label]) => (
        <Link className="inline-flex items-center text-faint no-underline hover:text-ink pointer-coarse:min-h-11" key={to} to={to}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
