import { useMemo } from 'react';
import { Icon } from '@project-graphite/ui';
import { fileSize, saveBlob } from '../files';
import { priorityNames } from '../quick-add';
import { taskStatuses, taskTypeLabel } from '../tasks';
import { formatDate } from '../time';
import { useAction } from '../useAction';
import { FileSourceContext, sharedFiles } from './file-source';
import { Page } from './Page';
import { RichTextView, type RichDocument } from './RichText';

export interface SharedTaskDetails {
  id: string;
  status: string;
  column: string | null;
  type: string;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  assignee: string | null;
  description: RichDocument;
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number }[];
}

export function SharedTask({ code, task, title }: { code: string; task: SharedTaskDetails; title: string }) {
  const load = useMemo(() => sharedFiles(code), [code]);
  const download = useAction();
  const properties = [
    ['Status', task.column ?? taskStatuses.find((status) => status.value === task.status)?.label ?? task.status],
    ['Type', taskTypeLabel(task.type)],
    ['Priority', priorityNames[task.priority] ?? 'None'],
    ['Due', task.dueDate ? formatDate(task.dueDate, task.dueTime) : 'No date'],
    ['Assigned to', task.assignee ?? 'Nobody'],
  ] as const;

  return (
    <Page description="Shared task · view only" title={title || 'Untitled'} variant="panel">
      <FileSourceContext.Provider value={load}>
        <div className="mt-6 grid gap-6">
          <dl className="shared-task-properties">
            {properties.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <section className="grid gap-2">
            <h2 className="m-0 text-small font-semibold text-muted">Description</h2>
            {task.description ? <RichTextView value={task.description} /> : <p className="m-0 text-muted">No description</p>}
          </section>
          {task.attachments.length > 0 && (
            <section className="grid gap-2">
              <h2 className="m-0 text-small font-semibold text-muted">Attachments</h2>
              <ul className="panel-rows">
                {task.attachments.map((file) => (
                  <li className="list-row" key={file.id}>
                    <button
                      className="list-row-main"
                      disabled={download.busy}
                      onClick={() =>
                        void download.run(async () => {
                          saveBlob(await load(file.id), file.name);
                          return '';
                        }, 'Could not download the file')
                      }
                      type="button"
                    >
                      <span className="drive-icon">
                        <Icon name="file" size={18} />
                      </span>
                      <span className="list-row-text">
                        <span className="list-row-title">{file.name}</span>
                        <span className="list-row-meta">{fileSize(file.sizeBytes)}</span>
                      </span>
                    </button>
                    <span className="list-row-trail">
                      <Icon name="download" size={16} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </FileSourceContext.Provider>
    </Page>
  );
}
