import { useState } from 'react';
import { Badge, Checkbox, ConfirmDialog, Fieldset, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Empty } from '../../components/Empty';
import { spaceOptions, useAllSpaces } from '../../spaces';
import { formatMoment } from '../../time';
import { useAction } from '../../useAction';
import type { Resource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { SettingsRow, SettingsRows } from './SettingsLayout';
import { AddButton } from '../../components/Button';
import { SecretDialog } from '../../components/Copyable';

export interface ApiReference {
  basePath: string;
  scopes: { scope: string; routes: { method: string; path: string }[] }[];
}

export interface Webhook {
  id: string;
  spaceId: string | null;
  host: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDelivery: { status: number | null; error: string | null; createdAt: string } | null;
}

const webhookEvents = [
  ['item.created', 'Something was added'],
  ['item.updated', 'Something was renamed or changed'],
  ['item.trashed', 'Something was moved to the trash'],
  ['task.completed', 'A task was completed'],
  ['task.reopened', 'A task was reopened'],
  ['subscription.cancelled', 'A subscription was cancelled'],
  ['member.joined', 'Someone joined a space'],
] as const;

function deliveryText(webhook: Webhook) {
  const last = webhook.lastDelivery;
  if (!last) return 'nothing sent yet';
  return `${last.error ? `failed (${last.error})` : `answered ${last.status}`} ${formatMoment(last.createdAt)}`;
}

export const emptyWebhooks = { title: 'No webhooks yet', hint: 'A webhook tells your own server when something changes in your spaces.' };

export function ApiSettings({ reference, webhooks }: { reference: ApiReference; webhooks: Resource<Webhook[]> }) {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const action = useAction();
  const form = useFormErrors();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState('');
  const [removing, setRemoving] = useState<Webhook>();

  const replace = (saved: Webhook) => webhooks.mutate((current) => current.map((webhook) => (webhook.id === saved.id ? saved : webhook)));

  return (
    <>
      <Section
        description={
          <>
            Send requests to <code className="mono-sm text-ink">{`${window.location.origin}${reference.basePath}`}</code> with the header{' '}
            <code className="mono-sm text-ink">Authorization: Bearer strata_pat_…</code>. Create a token above; each permission opens these endpoints.
          </>
        }
        title="Personal API"
      >
        <ul className="panel-rows">
          {reference.scopes.map(({ scope, routes }) => (
            <li key={scope}>
              <details>
                <summary className="list-row">
                  <span className="list-row-text py-2">
                    <span className="list-row-title font-mono">{scope}</span>
                    <span className="list-row-meta">
                      {routes.length} endpoint{routes.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </summary>
                <ul className="m-0 grid list-none gap-0.5 px-4 pb-3">
                  {routes.map((route) => (
                    <li className="mono-sm text-ink" key={`${route.method} ${route.path}`}>
                      <span className="inline-block w-16 text-muted">{route.method}</span>
                      {route.path}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        action={
          <AddButton label="New webhook" onClick={() => setAdding(true)} />
        }
        description={
          <>
            Strata posts JSON to your address when something happens in your spaces, signed with your webhook’s secret in <code className="mono-sm">X-Strata-Signature</code>{' '}
            (HMAC-SHA256 of the timestamp, a dot and the body). Failed deliveries are retried 5 times.
          </>
        }
        title="Webhooks"
      >
        {webhooks.data!.length === 0 ? (
          <Empty title={emptyWebhooks.title}>{emptyWebhooks.hint}</Empty>
        ) : (
          <SettingsRows>
            {webhooks.data!.map((webhook) => (
              <SettingsRow
                action={
                  <>
                    {!webhook.active && <Badge>Paused</Badge>}
                    <ActionsMenu
                      items={[
                        {
                          label: 'Send a test',
                          onSelect: () =>
                            void action.run(async () => {
                              const sent = await auth.request<{ status: number | null; error: string | null }>(`/me/webhooks/${webhook.id}/ping`, { method: 'POST' });
                              webhooks.reload();
                              return sent.error ? `The test failed: ${sent.error}` : `The test was delivered (${sent.status}).`;
                            }, 'Could not send the test'),
                        },
                        {
                          label: webhook.active ? 'Pause' : 'Resume',
                          onSelect: () =>
                            void action.run(async () => {
                              replace(await auth.request<Webhook>(`/me/webhooks/${webhook.id}`, { method: 'PATCH', body: JSON.stringify({ active: !webhook.active }) }));
                              return webhook.active ? `Paused the webhook to ${webhook.host}.` : `Resumed the webhook to ${webhook.host}.`;
                            }, 'Could not change the webhook'),
                        },
                        { label: 'Delete', onSelect: () => setRemoving(webhook), separated: true },
                      ]}
                      name={`the webhook to ${webhook.host}`}
                    />
                  </>
                }
                key={webhook.id}
                label={webhook.host}
              >
                {webhook.spaceId ? (spaces.data?.find((space) => space.id === webhook.spaceId)?.name ?? 'One space') : 'All spaces'} · {webhook.events.join(', ')} · {deliveryText(webhook)}
              </SettingsRow>
            ))}
          </SettingsRows>
        )}
      </Section>

      {adding && secret && (
        <SecretDialog
          hint="It won’t be shown again. Use it to check the X-Strata-Signature header."
          onClose={() => {
            setAdding(false);
            setSecret('');
          }}
          title="Copy the signing secret"
          value={secret}
        />
      )}

      {adding && !secret && (
        <FormDialog
          busy={action.busy}
          busyLabel="Creating…"
          onClose={() => setAdding(false)}
          onSubmit={(target) => {
            const values = new FormData(target);
            const events = values.getAll('events').map(String);
            if (!form.check(target, { url: [required('Enter the address to send to.')] })) return;
            void action.run(async () => {
              if (events.length === 0) throw new Error('Choose at least one event.');
              const spaceId = String(values.get('spaceId'));
              const created = await auth.request<Webhook & { secret: string }>('/me/webhooks', {
                method: 'POST',
                body: JSON.stringify({ url: String(values.get('url')).trim(), events, ...(spaceId ? { spaceId } : {}) }),
              });
              const { secret: shown, ...listed } = created;
              webhooks.mutate((current) => [...current, listed]);
              setSecret(shown);
              return '';
            }, 'Could not create the webhook');
          }}
          submitLabel="Create webhook"
          title="New webhook"
        >
          <TextField autoFocus inputMode="url" label="Send to (https://)" {...form.field('url')} />
          <Fieldset legend="When">
            {webhookEvents.map(([event, description]) => (
              <Checkbox
                defaultChecked={event === 'item.created'}
                key={event}
                label={
                  <span>
                    {description} <span className="mono-sm text-faint">{event}</span>
                  </span>
                }
                name="events"
                value={event}
              />
            ))}
          </Fieldset>
          <Select defaultValue="" label="In" name="spaceId" options={[{ value: '', label: 'All my spaces' }, ...spaceOptions(spaces.data ?? [])]} />
        </FormDialog>
      )}

      {removing && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete webhook"
          errorFallback="Could not delete the webhook"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/webhooks/${removing.id}`, { method: 'DELETE' });
            webhooks.mutate((current) => current.filter((webhook) => webhook.id !== removing.id));
            action.report(`Deleted the webhook to ${removing.host}.`);
          }}
          title={`Delete the webhook to ${removing.host}?`}
          tone="danger"
        >
          Nothing more is sent there, and its delivery log is deleted.
        </ConfirmDialog>
      )}
    </>
  );
}
