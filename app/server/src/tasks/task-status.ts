import { TaskStatus } from '@prisma/client';

export const taskStatuses = ['open', 'in_progress', 'done'] as const;

export const statusOf = (name: (typeof taskStatuses)[number]) => name.toUpperCase() as TaskStatus;

export function statusFields(status: TaskStatus, completedAt: Date | null, now = new Date()) {
  return { status, completedAt: status === TaskStatus.DONE ? (completedAt ?? now) : null };
}
