import { useLocation } from 'react-router';
import { Icon, ListRow, SectionHeading, type IconName } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { AboutLinks } from '../components/AboutLinks';
import { Page } from '../components/Page';
import { enabledApps } from '../apps';
import { areaOf, moreSections } from '../navigation';
import { useChosenSpace } from '../spaces';

export function MorePage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const { space } = useChosenSpace();

  return (
    <Page title="More" titleHidden>
      {moreSections(areaOf(pathname), enabledApps(auth.user?.features), space).map((section, index) => (
        <nav aria-label={section.label ?? 'Areas'} className="grid gap-3" key={section.label ?? index}>
          {section.label && <SectionHeading title={section.label} />}
          <ul className="panel-rows">
            {section.items.map((item) => (
              <ListRow
                href={item.href}
                key={item.href}
                lead={<Icon name={item.icon as IconName} size={18} />}
                title={item.label}
                trail={<Icon name="chevron-right" size={16} />}
              />
            ))}
          </ul>
        </nav>
      ))}
      <AboutLinks />
    </Page>
  );
}
