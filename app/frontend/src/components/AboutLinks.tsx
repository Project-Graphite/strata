import { Link } from 'react-router';
import { androidReleasesPageUrl, isNativeAndroid } from '../native-capture';

export function AboutLinks() {
  return (
    <nav aria-label="About" className="flex justify-end gap-5 text-small">
      {!isNativeAndroid() && (
        <a className="inline-flex items-center text-muted no-underline hover:text-ink pointer-coarse:min-h-11" href={androidReleasesPageUrl} rel="noreferrer" target="_blank">
          Android app
        </a>
      )}
      {[
        ['/privacy', 'Privacy'],
        ['/terms', 'Terms'],
      ].map(([to, label]) => (
        <Link className="inline-flex items-center text-muted no-underline hover:text-ink pointer-coarse:min-h-11" key={to} to={to}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
