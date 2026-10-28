import { Fragment, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconButton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { keepArticle, siteLabel, type ArticleBlock, type BookmarkDetails, type FetchedPage, type Inline } from '../bookmarks';
import { ActionsMenu } from '../components/ActionsMenu';
import { Empty } from '../components/Empty';
import { DetailState, Page } from '../components/Page';
import { rowsOf, SkeletonLine, useRememberedShape } from '../components/Skeletons';
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
    <div className="note-content min-w-0 max-w-3xl">
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

const back = { to: '/bookmarks', label: 'Bookmarks' };

export function BookmarkPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const bookmark = useResource<BookmarkDetails>(`/bookmarks/${id}`, true);
  const { mutate } = bookmark;
  const { run } = useAction();
  const markedRead = useRef('');
  const details = bookmark.data;
  const editable = !!details && !!spaces.data?.some((space) => space.id === details.spaceId && space.role !== 'viewer');
  const [wasEditable, articled] = useRememberedShape(`bookmark-${id}`, details && spaces.data && [Number(editable), Number(Boolean(details.article?.blocks.length))], [1, 1]);

  function setRead(current: BookmarkDetails, read: boolean) {
    void run(async () => {
      const saved = await auth.request<BookmarkDetails>(`/bookmarks/${current.id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
      mutate((shown) => ({ ...shown, readAt: saved.readAt }));
      return {
        message: read ? `Marked ${current.title} as read.` : `Moved ${current.title} back to read later.`,
        undo: async () => {
          const restored = await auth.request<BookmarkDetails>(`/bookmarks/${current.id}`, { method: 'PATCH', body: JSON.stringify({ read: !read }) });
          mutate((shown) => ({ ...shown, readAt: restored.readAt }));
          return '';
        },
      };
    }, 'Could not change the bookmark');
  }

  useEffect(() => {
    if (!details || !editable || details.readAt || markedRead.current === details.id) return;
    markedRead.current = details.id;
    setRead(details, true);
  });

  if (!details) {
    return (
      <DetailState actions={1 + wasEditable} back={back} resource={bookmark} thing="Bookmark">
        {articled ? (
          <div aria-hidden="true" className="note-content min-w-0 max-w-3xl">
            {rowsOf(2).map((paragraph) => (
              <p key={paragraph}>
                <SkeletonLine width="w-full" />
                <SkeletonLine width="w-full" />
                <SkeletonLine width={paragraph ? 'w-1/3' : 'w-2/3'} />
              </p>
            ))}
          </div>
        ) : (
          <Empty loading title="No article saved">
            The page couldn’t be read, or it has no article text. You can open the original, or fetch the page again.
          </Empty>
        )}
      </DetailState>
    );
  }
  const blocks = details.article?.blocks ?? [];

  return (
    <Page
      actions={
        <>
          <IconButton href={details.url} icon="external" label="Open original" LinkComponent="a" rel="noopener noreferrer" target="_blank" />
          {editable && (
            <ActionsMenu
              items={[
                { label: details.readAt ? 'Move back to read later' : 'Mark read', onSelect: () => setRead(details, !details.readAt) },
                {
                  label: 'Fetch again',
                  onSelect: () =>
                    void run(async () => {
                      const page = await auth.request<FetchedPage>(`/bookmarks/${details.id}/fetch`, { method: 'POST' });
                      if (!page.html) throw new Error(`The page couldn’t be read: ${page.fetchError}`);
                      const saved = await keepArticle(auth.request, details, page.html);
                      mutate(() => saved);
                      return `Fetched ${saved.title} again.`;
                    }, 'Could not fetch the page'),
                },
                {
                  label: 'Move to trash',
                  separated: true,
                  onSelect: () =>
                    void run(async () => {
                      await auth.request(`/items/${details.id}/trash`, { method: 'POST' });
                      navigate(back.to);
                      return {
                        message: `Moved ${details.title} to the trash.`,
                        undo: async () => {
                          await auth.request(`/items/${details.id}/restore`, { method: 'POST' });
                          navigate(`/bookmarks/${details.id}`);
                          return '';
                        },
                      };
                    }, 'Could not move the bookmark to the trash'),
                },
              ]}
              name={details.title}
            />
          )}
        </>
      }
      back={back}
      description={[siteLabel(details), details.article?.byline, blocks.length ? `${readingMinutes(blocks)} min read` : ''].filter(Boolean).join(' · ')}
      title={details.title}
    >
      {blocks.length ? (
        <ArticleBody blocks={blocks} />
      ) : (
        <Empty title="No article saved">
          {details.description ?? 'The page couldn’t be read, or it has no article text.'} You can open the original, or fetch the page again.
        </Empty>
      )}
    </Page>
  );
}
