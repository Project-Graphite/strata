import { Link } from 'react-router';
import { androidReleasesPageUrl, isNativeAndroid } from '../native-capture';

export function AboutLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="About" className={`mono-sm flex gap-5 ${className}`}>
      {!isNativeAndroid() && (
        <a className="text-faint no-underline hover:text-ink" href={androidReleasesPageUrl} rel="noreferrer" target="_blank">
          Android app
        </a>
      )}
      <Link className="text-faint no-underline hover:text-ink" to="/privacy">
        Privacy
      </Link>
      <Link className="text-faint no-underline hover:text-ink" to="/terms">
        Terms
      </Link>
    </nav>
  );
}
