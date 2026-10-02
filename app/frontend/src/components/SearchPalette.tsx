import { useEffect, useState } from 'react';
import { CommandPalette, isAbortError, type CommandItem } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useSpaces, type Tag } from '../spaces';

interface SearchResults {
  items: { id: string; spaceId: string; spaceName: string; kind: string; title: string; archived: boolean }[];
  tags: Tag[];
}

const pages = [
  ['/', 'Home'],
  ['/spaces', 'Spaces'],
  ['/inbox', 'Inbox'],
  ['/invitations', 'Invitations'],
  ['/trash', 'Trash'],
  ['/settings', 'Profile settings'],
  ['/settings/security', 'Password and two-step sign-in'],
  ['/settings/sessions', 'Signed-in devices and security log'],
  ['/settings/tokens', 'Access tokens'],
  ['/settings/data', 'Export or delete your data'],
] as const;

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { request, user } = useAuth();
  const spaces = useSpaces();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>();
  const text = query.trim();

  useEffect(() => {
    if (!text) {
      setResults(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request<SearchResults>(`/search?q=${encodeURIComponent(text)}`, { signal: controller.signal }).then(
        setResults,
        (reason: unknown) => {
          if (!isAbortError(reason)) setResults({ items: [], tags: [] });
        },
      );
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request, text]);

  const matches = (label: string) => label.toLowerCase().includes(text.toLowerCase());
  const spaceName = (spaceId: string) => spaces.data?.find((space) => space.id === spaceId)?.name;
  const items: CommandItem[] = [
    ...(results?.items ?? []).map((item) => ({
      group: 'Items',
      hint: `${item.kind} · ${item.spaceName}${item.archived ? ' · archived' : ''}`,
      href: `/spaces/${item.spaceId}${item.archived ? '?archived=true' : ''}`,
      id: `item-${item.id}`,
      label: item.title || 'Untitled',
    })),
    ...(results?.tags ?? []).map((tag) => ({
      group: 'Tags',
      hint: spaceName(tag.spaceId),
      href: `/spaces/${tag.spaceId}?tag=${tag.id}`,
      id: `tag-${tag.id}`,
      label: tag.name,
    })),
    ...(spaces.data ?? [])
      .filter((space) => matches(space.name))
      .map((space) => ({ group: 'Spaces', href: `/spaces/${space.id}`, id: `space-${space.id}`, label: space.name })),
    ...[...pages, ...(user?.role === 'system_manager' ? ([['/admin', 'Site settings']] as const) : [])]
      .filter(([, label]) => matches(label))
      .map(([href, label]) => ({ group: 'Go to', href, id: `page-${href}`, label })),
  ];

  return (
    <CommandPalette
      emptyLabel={text ? 'Nothing matches' : 'Type to search'}
      items={items}
      onClose={onClose}
      onQueryChange={setQuery}
      placeholder="Search items, tags, spaces and settings"
      query={query}
    />
  );
}
