import { useState } from 'react';
import { ConfirmDialog, Dialog, EmptyState, FormSkeleton, Icon, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { SettingsRow, SettingsRows, SettingsSection, type TwoStepStatus } from './SettingsLayout';

interface AccessToken {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

const scopes = [
  ['spaces:read', 'See your spaces, their members, tags and activity'],
  ['items:read', 'Read items, links and the trash, and download files'],
  ['items:write', 'Change items and tags, upload files and move things to the trash'],
] as const;

export function TokensSettings() {
  const auth = useAuth();
  const tokens = useResource<AccessToken[]>('/me/tokens', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const creating = useAction();
  const form = useFormErrors();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState('');
  const [revoking, setRevoking] = useState<AccessToken>();

  if (tokens.error) return <LoadError error={tokens.error} onRetry={tokens.reload} />;
  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!tokens.data || !twoStep.data) return <FormSkeleton fields={2} />;
  const close = () => {
    setOpen(false);
    setCreated('');
  };

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      <SettingsSection
        action={
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => setOpen(true)} type="button">
            <Icon name="plus" size={16} />
            New token
          </button>
        }
        title="Access tokens"
      >
        {tokens.data.length === 0 ? (
          <EmptyState title="No tokens">
            <p className="mx-auto mt-2 mb-0 max-w-md text-sm text-muted">
              A token lets your own scripts use Strata as you, with only the permissions you give it.
            </p>
          </EmptyState>
        ) : (
          <SettingsRows>
            {tokens.data.map((token) => (
              <SettingsRow
                action={
                  <button className="secondary-button px-3 py-2 text-sm" onClick={() => setRevoking(token)} type="button">
                    Revoke
                  </button>
                }
                key={token.id}
                label={token.name}
              >
                <span className="mono-sm">
                  {token.scopes.join(', ')} · {token.lastUsedAt ? `used ${timeAgo(token.lastUsedAt)}` : 'never used'} · expires{' '}
                  {new Date(token.expiresAt).toLocaleDateString()}
                </span>
              </SettingsRow>
            ))}
          </SettingsRows>
        )}
      </SettingsSection>

      {open && created && (
        <Dialog onClose={close} title="Copy your token">
          <div className="mt-5 grid gap-4">
            <p className="m-0 text-sm text-muted">It won’t be shown again. Store it like a password.</p>
            <code className="mono-sm block break-all rounded-lg border border-line p-3 text-ink">{created}</code>
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(created)} type="button">
                Copy
              </button>
              <button className="primary-button" onClick={close} type="button">
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {open && !created && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Creating…"
          onClose={close}
          onSubmit={(target) => {
            const values = new FormData(target);
            const chosen = values.getAll('scopes').map(String);
            if (
              !form.check(target, {
                name: [required('Name the token.'), atMost(60, 'Use at most 60 characters.')],
                password: [required('Enter your password to confirm.')],
                ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
              })
            ) {
              return;
            }
            void creating.run(async () => {
              if (chosen.length === 0) throw new Error('Choose at least one permission.');
              const token = await auth.request<AccessToken & { token: string }>('/me/tokens', {
                method: 'POST',
                body: JSON.stringify({
                  name: String(values.get('name')).trim(),
                  scopes: chosen,
                  expiresInDays: Number(values.get('expiresInDays')),
                  ...proofFrom(target),
                }),
              });
              const { token: secret, ...listed } = token;
              tokens.mutate((current) => [listed, ...current]);
              setCreated(secret);
              return '';
            }, 'Could not create the token');
          }}
          submitLabel="Create token"
          title="New access token"
        >
          <TextField autoFocus label="Name" maxLength={60} placeholder="Backup script" {...form.field('name')} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="field-label mb-2">Permissions</legend>
            {scopes.map(([scope, description]) => (
              <label className="flex items-start gap-2 text-sm text-ink" key={scope}>
                <input defaultChecked={scope !== 'items:write'} name="scopes" type="checkbox" value={scope} />
                <span>
                  {description} <span className="mono-sm text-faint">{scope}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field-label">
            Expires after
            <select defaultValue="90" name="expiresInDays">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
          <ProofFields form={form} twoStep={twoStep.data.enabled} />
        </FormDialog>
      )}

      {revoking && (
        <ConfirmDialog
          busyLabel="Revoking…"
          confirmLabel="Revoke"
          errorFallback="Could not revoke the token"
          onClose={() => setRevoking(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/tokens/${revoking.id}`, { method: 'DELETE' });
            tokens.mutate((current) => current.filter((token) => token.id !== revoking.id));
          }}
          title={`Revoke ${revoking.name}?`}
        >
          Anything using it stops working straight away.
        </ConfirmDialog>
      )}
    </div>
  );
}
