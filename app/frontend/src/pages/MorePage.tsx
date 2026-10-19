import { Link, useLocation } from 'react-router';
import { Icon, type IconName } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { AboutLinks } from '../components/AboutLinks';
import { Page, Subheading } from '../components/Page';
import { enabledApps } from '../apps';
import { areaOf, moreSections } from '../navigation';

export function MorePage() {
  const auth = useAuth();
  const { pathname } = useLocation();

  return (
    <Page title="More" titleHidden>
      {moreSections(areaOf(pathname), enabledApps(auth.user?.features)).map((section, index) => (
        <nav aria-label={section.label ?? 'Areas'} className="grid gap-2" key={section.label ?? index}>
          {section.label && <Subheading level={2}>{section.label}</Subheading>}
          <ul className="panel-rows">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link className="flex items-center gap-3 panel-row text-ink no-underline hover:bg-line-soft" to={item.href}>
                  <span className="sidebar-icon text-muted">
                    <Icon name={item.icon as IconName} size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="text-faint">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <AboutLinks />
    </Page>
  );
}
