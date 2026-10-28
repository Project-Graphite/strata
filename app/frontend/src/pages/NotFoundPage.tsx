import { useEffect } from 'react';
import { ButtonLink } from '../components/Button';
import { Page } from '../components/Page';

export function NotFoundPage() {
  useEffect(() => {
    const robots = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' });
    document.head.append(robots);
    return () => robots.remove();
  }, []);
  return (
    <Page description="The link may be wrong, or the page may have moved." title="Page not found">
      <ButtonLink label="Go home" large primary to="/" />
    </Page>
  );
}
