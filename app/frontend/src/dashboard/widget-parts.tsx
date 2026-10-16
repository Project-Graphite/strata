import { Link } from 'react-router';
import { timeAgo } from '@project-graphite/ui';
import type { Note } from '../notes';
import { useSpaces } from '../spaces';
import { Subheading } from '../components/Page';

export interface WidgetProps {
  settings: Record<string, unknown>;
}

export interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

export function PageLinks({ heading, pages }: { heading: string; pages: Note[] }) {
  const spaces = useSpaces();
  return (
    <section className="grid gap-1">
      <Subheading>{heading}</Subheading>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {pages.map((page) => (
          <li className="text-sm" key={page.id}>
            <Link className="text-ink no-underline hover:underline" to={`/notes/${page.id}`}>
              {page.icon ? `${page.icon} ` : ''}
              {page.title || 'Untitled'}
            </Link>
            <span className="mono-sm block text-faint">
              {[spaces.data?.find((space) => space.id === page.spaceId)?.name, timeAgo(page.updatedAt)].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
