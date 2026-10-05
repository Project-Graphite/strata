import { Link, useLocation } from 'react-router';
import { Icon, PageHeader, type IconName } from '@project-graphite/ui';
import { useInbox } from '../inbox';
import { areaSections } from '../navigation';
import { useSpaces } from '../spaces';

export function MenuPage() {
  const { pathname } = useLocation();
  const spaces = useSpaces();
  const inbox = useInbox();

  return (
    <section className="page-enter grid max-w-3xl gap-6">
      <PageHeader title="Menu" />
      {areaSections(pathname, spaces.data, inbox.data?.unread ?? 0).map((section, index) => (
        <nav aria-label={section.label ?? 'Areas'} className="grid gap-2" key={section.label ?? index}>
          {section.label && <h2 className="m-0 text-sm font-medium text-muted">{section.label}</h2>}
          <ul className="panel-rows m-0 grid list-none p-0">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link className="flex items-center gap-3 px-4 py-3.5 text-ink no-underline" to={item.href}>
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
    </section>
  );
}
