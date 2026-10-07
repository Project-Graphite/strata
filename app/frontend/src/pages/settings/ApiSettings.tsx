import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog, Dialog, FormSkeleton, Icon, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { useSpaces } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { SettingsRow, SettingsRows, SettingsSection } from './SettingsLayout';

interface ApiReference {
  basePath: string;
  scopes: { scope: string; routes: { method: string; path: string }[] }[];
}

interface Webhook {
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
  return `${last.error ? `failed (${last.error})` : `answered ${last.status}`} ${timeAgo(last.createdAt)}`;
}

export function ApiSettings() {
  const auth = useAuth();
  const spaces = useSpaces();
  const reference = useResource<ApiReference>('/me/api-reference', true);
  const webhooks = useResource<Webhook[]>('/me/webhooks', true);
  const action = useAction();
  const form = useFormErrors();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState('');
  const [removing, setRemoving] = useState<Webhook>();

  if (reference.error) return <LoadError error={reference.error} onRetry={reference.reload} />;
  if (webhooks.error) return <LoadError error={webhooks.error} onRetry={webhooks.reload} />;
  if (!reference.data || !webhooks.data) return <FormSkeleton fields={2} />;
  const replace = (saved: Webhook) => webhooks.mutate((current) => current.map((webhook) => (webhook.id === saved.id ? saved : webhook)));

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      <SettingsSection title="Personal API">
        <div className="grid gap-3 text-sm text-muted">
          <p className="m-0">
            Send requests to <code className="mono-sm text-ink">{`${window.location.origin}${reference.data.basePath}`}</code> with the header{' '}
            <code className="mono-sm text-ink">Authorization: Bearer strata_pat_…</code>. Create a token under <Link to="/settings/tokens">Access tokens</Link>; each
            permission opens these endpoints.
          </p>
          {reference.data.scopes.map(({ scope, routes }) => (
            <details className="rounded-lg border border-line p-3" key={scope}>
              <summary className="cursor-pointer text-ink">
                <span className="mono-sm">{scope}</span> · {routes.length} endpoints
              </summary>
              <ul className="m-0 mt-2 grid list-none gap-0.5 p-0">
                {routes.map((route) => (
                  <li className="mono-sm text-ink" key={`${route.method} ${route.path}`}>
                    <span className="inline-block w-16 text-faint">{route.method}</span>
                    {route.path}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        action={
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => setAdding(true)} type="button">
            <Icon name="plus" size={16} />
            New webhook
          </button>
        }
        title="Webhooks"
      >
        <p className="mt-0 mb-3 text-sm text-muted">
          Strata posts JSON to your address when something happens in your spaces, signed with your webhook’s secret in <code className="mono-sm">X-Strata-Signature</code>{' '}
          (HMAC-SHA256 of the timestamp, a dot and the body). Failed deliveries are retried 5 times.
        </p>
        {webhooks.data.length > 0 && (
          <SettingsRows>
            {webhooks.data.map((webhook) => (
              <SettingsRow
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="secondary-button px-3 py-2 text-sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const sent = await auth.request<{ status: number | null; error: string | null }>(`/me/webhooks/${webhook.id}/ping`, { method: 'POST' });
                          webhooks.reload();
                          return sent.error ? `The test failed: ${sent.error}` : `The test was delivered (${sent.status}).`;
                        }, 'Could not send the test')
                      }
                      type="button"
                    >
                      Send a test
                    </button>
                    <button
                      className="secondary-button px-3 py-2 text-sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          replace(await auth.request<Webhook>(`/me/webhooks/${webhook.id}`, { method: 'PATCH', body: JSON.stringify({ active: !webhook.active }) }));
                          return '';
                        }, 'Could not change the webhook')
                      }
                      type="button"
                    >
                      {webhook.active ? 'Pause' : 'Resume'}
                    </button>
                    <button className="text-button text-sm" onClick={() => setRemoving(webhook)} type="button">
                      Delete
                    </button>
                  </div>
                }
                key={webhook.id}
                label={`${webhook.host}${webhook.active ? '' : ' (paused)'}`}
              >
                <span className="mono-sm">
                  {webhook.spaceId ? (spaces.data?.find((space) => space.id === webhook.spaceId)?.name ?? 'One space') : 'All spaces'} · {webhook.events.join(', ')} ·{' '}
                  {deliveryText(webhook)}
                </span>
              </SettingsRow>
            ))}
          </SettingsRows>
        )}
      </SettingsSection>

      {adding && secret && (
        <Dialog
          onClose={() => {
            setAdding(false);
            setSecret('');
          }}
          title="Copy the signing secret"
        >
          <div className="mt-5 grid gap-4">
            <p className="m-0 text-sm text-muted">It won’t be shown again. Use it to check the X-Strata-Signature header.</p>
            <code className="mono-sm block break-all rounded-lg border border-line p-3 text-ink">{secret}</code>
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(secret)} type="button">
                Copy
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setAdding(false);
                  setSecret('');
                }}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog>
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
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="field-label mb-2">When</legend>
            {webhookEvents.map(([event, description]) => (
              <label className="flex items-start gap-2 text-sm text-ink" key={event}>
                <input defaultChecked={event === 'item.created'} name="events" type="checkbox" value={event} />
                <span>
                  {description} <span className="mono-sm text-faint">{event}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field-label">
            In
            <select defaultValue="" name="spaceId">
              <option value="">All my spaces</option>
              {(spaces.data ?? []).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        </FormDialog>
      )}

      {removing && (
        <ConfirmDialog
          confirmLabel="Delete"
          errorFallback="Could not delete the webhook"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/webhooks/${removing.id}`, { method: 'DELETE' });
            webhooks.mutate((current) => current.filter((webhook) => webhook.id !== removing.id));
            setRemoving(undefined);
          }}
          title={`Delete the webhook to ${removing.host}?`}
        >
          Nothing more is sent there, and its delivery log is deleted.
        </ConfirmDialog>
      )}
    </div>
  );
}
