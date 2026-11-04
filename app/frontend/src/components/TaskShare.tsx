import { useState } from 'react';
import { Checkbox, Icon, TextAreaField, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Member } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { FormDialog } from './FormDialog';
import { Hint } from './Hint';
import { NestedMenu } from './NestedMenu';
import { ShareLinks } from './ShareLinks';

function SendDialog({ onClose, spaceId, taskId, title }: { onClose: () => void; spaceId: string; taskId: string; title: string }) {
  const auth = useAuth();
  const action = useAction();
  const members = useResource<Member[]>(`/spaces/${spaceId}/members`, true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const others = (members.data ?? []).filter((member) => member.userId !== auth.user?.id);
  return (
    <FormDialog
      busy={action.busy}
      busyLabel="Sending…"
      onClose={onClose}
      onSubmit={(form) => {
        const message = String(new FormData(form).get('message')).trim();
        void action
          .run(async () => {
            await auth.request(`/tasks/${taskId}/share`, { method: 'POST', body: JSON.stringify({ userIds: [...chosen], ...(message ? { message } : {}) }) });
            return `Shared ${title} with ${chosen.size === 1 ? others.find((member) => chosen.has(member.userId))?.displayName : `${chosen.size} people`}.`;
          }, 'Could not share the task')
          .then((sent) => sent && onClose());
      }}
      submitDisabled={chosen.size === 0}
      submitLabel="Send"
      title={`Share ${title}`}
    >
      <div className="grid gap-4">
        {members.data && others.length === 0 ? (
          <Hint>Nobody else is in this space yet.</Hint>
        ) : (
          <fieldset className="fieldset grid max-h-64 gap-2 overflow-y-auto">
            <legend className="fieldset-legend">People in this space</legend>
            {others.map((member) => (
              <Checkbox
                checked={chosen.has(member.userId)}
                key={member.userId}
                label={member.displayName}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (!next.delete(member.userId)) next.add(member.userId);
                    return next;
                  })
                }
              />
            ))}
          </fieldset>
        )}
        <TextAreaField label="Note (optional)" maxLength={500} name="message" rows={2} />
        <Hint>They get a notification with a link to the task and start watching it.</Hint>
      </div>
    </FormDialog>
  );
}

export function TaskShare({ editable, shared, spaceId, taskId, title }: { editable: boolean; shared: boolean; spaceId: string; taskId: string; title: string }) {
  const show = useSnackbar();
  const [open, setOpen] = useState<'send' | 'links'>();
  return (
    <>
      <NestedMenu
        items={[
          {
            label: 'Copy link',
            onSelect: () =>
              void navigator.clipboard
                .writeText(`${window.location.origin}/tasks?task=${taskId}`)
                .then(() => show({ message: 'Copied the link. People in this space can open it.' }))
                .catch(() => show({ message: 'Could not copy the link', tone: 'error' })),
          },
          ...(shared ? [{ label: 'Send to people…', onSelect: () => setOpen('send') }] : []),
          ...(editable ? [{ label: 'Share by link…', onSelect: () => setOpen('links') }] : []),
        ]}
        label="Share options"
        trigger={<Icon name="link" size={18} />}
        triggerLabel="Share"
      />
      {open === 'send' && <SendDialog onClose={() => setOpen(undefined)} spaceId={spaceId} taskId={taskId} title={title} />}
      {open === 'links' && <ShareLinks editLinks={false} itemId={taskId} noun="task" onClose={() => setOpen(undefined)} />}
    </>
  );
}
