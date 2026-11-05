import { parseQuickTask } from './quick-add';
import type { SpaceDefaults, Tag } from './spaces';
import type { Task } from './tasks';

export type TaskComposer = 'condensed' | 'modal' | 'panel';

export interface TaskDraft {
  title: string;
  status: Task['status'];
  type: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
  listId: string | null;
  assigneeId: string | null;
  repeatRule: string | null;
  description: Record<string, unknown> | null;
  labels: Tag[];
}

type TextNode = { type?: string; text?: string; content?: TextNode[] };

export const paragraphOf = (text: string) => ({ type: 'doc', content: text.split('\n').map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) });

export const plainDescription = (text: string) => (text.trim() ? paragraphOf(text.trimEnd()) : null);

function textOf(node: TextNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join(node.type === 'doc' || node.type?.endsWith('List') ? '\n' : '');
}

export const descriptionText = (description: Record<string, unknown> | null) => (description ? textOf(description as TextNode) : '');

export function newTaskDraft({ defaults, listId, status, userId }: { defaults?: SpaceDefaults['task']; listId?: string | null; status?: Task['status']; userId?: string }): TaskDraft {
  return {
    title: '',
    status: status ?? defaults?.status ?? 'open',
    type: defaults?.type ?? 'task',
    dueDate: null,
    dueTime: null,
    priority: defaults?.priority ?? 0,
    listId: listId ?? defaults?.listId ?? null,
    assigneeId: defaults?.assignee === 'none' ? null : (userId ?? null),
    repeatRule: null,
    description: null,
    labels: [],
  };
}

export const hasInput = (draft: TaskDraft) => Boolean(draft.title.trim() || descriptionText(draft.description).trim());

export function withQuickTitle(draft: TaskDraft, tags: Tag[]): TaskDraft {
  const quick = parseQuickTask(draft.title, tags.map((tag) => tag.name));
  const found = tags.filter((tag) => quick.tagNames.includes(tag.name) && !draft.labels.some((label) => label.id === tag.id));
  return {
    ...draft,
    title: quick.title,
    dueDate: quick.dueDate ?? draft.dueDate,
    dueTime: quick.dueTime ?? draft.dueTime,
    priority: quick.priority ?? draft.priority,
    labels: [...draft.labels, ...found],
  };
}
