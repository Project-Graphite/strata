import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CommandPalette, errorMessage, isAbortError, type CommandItem } from '@project-graphite/ui';
import { isAdmin, useAuth } from '../auth';
import { enabledApps } from '../apps';
import { searchableAreas } from '../navigation';
import { homePath, itemHref, itemKindName, spaceHref, useAllSpaces, useCurrentSpace, type Tag } from '../spaces';
import { useAction } from '../useAction';
import { noteHref, type Note } from '../notes';

interface SearchResults {
  items: { id: string; spaceId: string | null; spaceName: string | null; kind: string; quick: boolean; title: string; archived: boolean }[];
  tags: Tag[];
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { request, user } = useAuth();
  const spaces = useAllSpaces();
  const { space, editable } = useCurrentSpace();
  const spaceId = editable ? space?.id : undefined;
  const navigate = useNavigate();
  const creating = useAction();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults & { error?: string }>();
  const text = query.trim();
  const spaceItems = (id: string, query: string) => {
    const space = spaces.data?.find((candidate) => candidate.id === id);
    return space ? `${spaceHref(space, 'items')}${query}` : '/spaces';
  };

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
          if (!isAbortError(reason)) setResults({ items: [], tags: [], error: errorMessage(reason, 'Search failed') });
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
  const actions: CommandItem[] = user?.features.includes('pages')
    ? [
        {
          group: 'Create',
          hint: space && editable ? space.name : 'Yours',
          id: 'new-page',
          label: 'New page',
          onSelect: () =>
            void creating.run(async () => {
              const created = await request<Note>(homePath(spaceId, 'notes'), { method: 'POST', body: JSON.stringify({}) });
              navigate(noteHref(created));
              return '';
            }, 'Could not create the page'),
        },
      ]
    : [];
  const items: CommandItem[] = [
    ...actions.filter((action) => !text || matches(action.label)),
    ...(results?.items ?? []).map((item) => ({
      group: 'Items',
      hint: `${itemKindName(item)} · ${item.spaceName ?? 'Yours'}${item.archived ? ' · archived' : ''}`,
      href: itemHref(item) ?? (item.spaceId ? spaceItems(item.spaceId, item.archived ? '?archived=true' : '') : '/files'),
      id: `item-${item.id}`,
      label: item.title || 'Untitled',
    })),
    ...(results?.tags ?? []).map((tag) => ({
      group: 'Tags',
      hint: tag.spaceId ? spaceName(tag.spaceId) : 'Yours',
      href: tag.spaceId ? spaceItems(tag.spaceId, `?tag=${tag.id}`) : '/settings/tags',
      id: `tag-${tag.id}`,
      label: tag.name,
    })),
    ...(spaces.data ?? [])
      .filter((space) => matches(space.name))
      .map((space) => ({ group: 'Spaces', href: spaceHref(space), id: `space-${space.id}`, label: space.name })),
    ...searchableAreas(enabledApps(user), isAdmin(user))
      .filter((area) => matches(area.label) || (area.hint && matches(area.hint)))
      .map((area) => ({ group: 'Go to', hint: area.hint, href: area.href, id: `page-${area.href}`, label: area.label })),
  ];

  return (
    <CommandPalette
      emptyLabel={results?.error ?? (text ? 'Nothing matches' : 'Type to search')}
      items={items}
      onClose={onClose}
      onQueryChange={setQuery}
      placeholder="Search items, tags, spaces and settings"
      query={query}
    />
  );
}
