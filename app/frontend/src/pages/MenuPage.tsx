import { Link, useLocation } from 'react-router';
import { Icon, type IconName } from '@project-graphite/ui';
import { Page } from '../components/Page';
import { useInbox } from '../inbox';
import { areaSections } from '../navigation';
import { useSpaces } from '../spaces';

export function MenuPage() {
  const { pathname } = useLocation();
  const spaces = useSpaces();
  const inbox = useInbox();

  return (
    <Page title="Menu">
      {areaSections(pathname, spaces.data, inbox.data?.unread ?? 0).map((section, index) => (
        <nav aria-label={section.label ?? 'Areas'} className="grid gap-2" key={section.label ?? index}>
          {section.label && <h2 className="m-0 text-sm font-medium text-muted">{section.label}</h2>}
          <ul className="panel-rows">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link className="flex items-center gap-3 panel-row text-ink no-underline" to={item.href}>
                  <span className="sidebar-icon text-muted">
                    {typeof item.icon === 'string' ? <Icon name={item.icon as IconName} size={18} /> : item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <span className="mono-sm text-faint">{item.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </Page>
  );
}
