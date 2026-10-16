import { ButtonLink } from '../components/Button';
import { Page } from '../components/Page';

export function NotFoundPage() {
  return (
    <Page description="The link may be wrong, or the page may have moved." title="Page not found">
      <ButtonLink label="Go home" large primary to="/" />
    </Page>
  );
}
