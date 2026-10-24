import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CommandPalette, errorMessage, isAbortError, type CommandItem } from '@project-graphite/ui';
import { isAdmin, useAuth } from '../auth';
import { enabledApps } from '../apps';
import { searchableAreas } from '../navigation';
import { itemHref, itemKindName, useChosenSpace, useSpaces, type Tag } from '../spaces';
import { useAction } from '../useAction';
import { inActiveSpace } from '../active-space';

interface SearchResults {
  items: { id: string; spaceId: string; spaceName: string; kind: string; quick: boolean; title: string; archived: boolean }[];
  tags: Tag[];
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { request, user } = useAuth();
  const spaces = useSpaces();
  const { spaceId } = useChosenSpace();
  const navigate = useNavigate();
  const creating = useAction();
  const personal = spaces.data?.find((space) => space.role !== 'viewer');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults & { error?: string }>();
  const text = query.trim();

  useEffect(() => {
    if (!text || !spaceId) {
      setResults(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request<SearchResults>(inActiveSpace(`/search?q=${encodeURIComponent(text)}`, spaceId), { signal: controller.signal }).then(
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
  }, [request, text, spaceId]);

  const matches = (label: string) => label.toLowerCase().includes(text.toLowerCase());
  const spaceName = (spaceId: string) => spaces.data?.find((space) => space.id === spaceId)?.name;
  const actions: CommandItem[] = personal
    ? [
        {
          group: 'Create',
          id: 'new-page',
          label: 'New page',
          onSelect: () =>
            void creating.run(async () => {
              const created = await request<{ id: string }>(`/spaces/${personal.id}/notes`, { method: 'POST', body: JSON.stringify({}) });
              navigate(`/notes/${created.id}`);
              return '';
            }, 'Could not create the page'),
        },
      ]
    : [];
  const items: CommandItem[] = [
    ...actions.filter((action) => !text || matches(action.label)),
    ...(results?.items ?? []).map((item) => ({
      group: 'Items',
      hint: `${itemKindName(item)} · ${item.spaceName}${item.archived ? ' · archived' : ''}`,
      href: itemHref(item) ?? `/spaces/${item.spaceId}${item.archived ? '?archived=true' : ''}`,
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
    ...searchableAreas(enabledApps(user?.features), isAdmin(user))
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
