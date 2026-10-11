import { Fragment, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, PageSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { keepArticle, siteLabel, type ArticleBlock, type BookmarkDetails, type FetchedPage, type Inline } from '../bookmarks';
import { LoadError } from '../components/LoadError';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

function Inlines({ parts }: { parts: Inline[] }) {
  return parts.map((part, index) =>
    part.href ? (
      <a href={part.href} key={index} rel="noopener noreferrer nofollow" target="_blank">
        {part.text}
      </a>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div className="note-content min-w-0">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Heading = `h${block.level}` as const;
          return (
            <Heading key={index}>
              <Inlines parts={block.content} />
            </Heading>
          );
        }
        if (block.type === 'paragraph' || block.type === 'quote') {
          const Text = block.type === 'quote' ? 'blockquote' : 'p';
          return (
            <Text key={index}>
              <Inlines parts={block.content} />
            </Text>
          );
        }
        if (block.type === 'code') return <pre key={index}>{block.text}</pre>;
        if (block.type === 'image') {
          return (
            <p key={index}>
              <a href={block.src} rel="noopener noreferrer nofollow" target="_blank">
                Image{block.alt ? `: ${block.alt}` : ''}
              </a>
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={index}>
            {block.items.map((item, position) => (
              <li key={position}>
                <Inlines parts={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function readingMinutes(blocks: ArticleBlock[]) {
  const words = blocks
    .flatMap((block) => (block.type === 'list' ? block.items.flat() : block.type === 'code' || block.type === 'image' ? [] : block.content))
    .reduce((total, part) => total + part.text.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 220));
}

export function BookmarkPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const bookmark = useResource<BookmarkDetails>(`/bookmarks/${id}`, true);
  const { mutate } = bookmark;
  const acting = useAction();
  const { run } = useAction();
  const markedRead = useRef('');
  const details = bookmark.data;
  const editable = !!details && !!spaces.data?.some((space) => space.id === details.spaceId && space.role !== 'viewer');

  useEffect(() => {
    if (!details || !editable || details.readAt || markedRead.current === details.id) return;
    markedRead.current = details.id;
    void run(async () => {
      const saved = await auth.request<BookmarkDetails>(`/bookmarks/${details.id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
      mutate((current) => ({ ...current, readAt: saved.readAt }));
      return '';
    }, 'Could not mark the bookmark as read');
  }, [auth, details, editable, mutate, run]);

  if (bookmark.status === 404) {
    return (
      <EmptyState title="Bookmark not found">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">It may have been deleted, or you are not a member of its space.</p>
      </EmptyState>
    );
  }
  if (bookmark.error) return <LoadError error={bookmark.error} onRetry={bookmark.reload} />;
  if (!details) return <PageSkeleton label="Opening the bookmark" />;
  const blocks = details.article?.blocks ?? [];

  function fetchAgain(current: BookmarkDetails) {
    void acting.run(async () => {
      const page = await auth.request<FetchedPage>(`/bookmarks/${current.id}/fetch`, { method: 'POST' });
      if (!page.html) throw new Error(`The page could not be read: ${page.fetchError}`);
      const saved = await keepArticle(auth.request, current, page.html);
      mutate(() => saved);
      return 'Fetched the page again.';
    }, 'Could not fetch the page');
  }

  return (
    <article className="page-enter grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-muted no-underline hover:text-ink" to="/bookmarks">
          Bookmarks
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <a className="text-button text-sm" href={details.url} rel="noopener noreferrer nofollow" target="_blank">
            Open original
          </a>
          {editable && (
            <>
              <button
                className="text-button text-sm"
                disabled={acting.busy}
                onClick={() =>
                  void acting.run(async () => {
                    const saved = await auth.request<BookmarkDetails>(`/bookmarks/${details.id}`, { method: 'PATCH', body: JSON.stringify({ read: !details.readAt }) });
                    mutate(() => saved);
                    return details.readAt ? 'Back on your read-later list.' : 'Marked as read.';
                  }, 'Could not change the bookmark')
                }
                type="button"
              >
                {details.readAt ? 'Read later' : 'Mark read'}
              </button>
              <button className="text-button text-sm" disabled={acting.busy} onClick={() => fetchAgain(details)} type="button">
                Fetch again
              </button>
              <button
                className="text-button text-sm"
                disabled={acting.busy}
                onClick={() =>
                  void acting.run(async () => {
                    await auth.request(`/items/${details.id}/trash`, { method: 'POST' });
                    navigate('/bookmarks');
                    return 'Moved to the trash.';
                  }, 'Could not move the bookmark to the trash')
                }
                type="button"
              >
                Move to trash
              </button>
            </>
          )}
        </div>
      </div>
      <header className="grid gap-2">
        <h1 className="note-title m-0">{details.title}</h1>
        <p className="mono-sm m-0 text-faint">
          {[siteLabel(details), details.article?.byline, blocks.length ? `${readingMinutes(blocks)} min read` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>
      {blocks.length ? (
        <ArticleBody blocks={blocks} />
      ) : (
        <EmptyState title="No article saved">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            {details.description ?? 'The page could not be read, or it has no article text.'} You can open the original, or fetch the page again.
          </p>
        </EmptyState>
      )}
    </article>
  );
}
