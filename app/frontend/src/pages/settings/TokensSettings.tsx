import { useState } from 'react';
import { ConfirmDialog, formatDay, FormSkeleton, Select, TextField, timeAgo } from '@project-graphite/ui';
import { dayKey } from '../../agenda';
import { useAuth } from '../../auth';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { SettingsRow, SettingsRows, type TwoStepStatus } from './SettingsLayout';
import { Button } from '../../components/Button';
import { SecretDialog } from '../../components/Copyable';

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
  ['spending:capture', 'Send bank text messages to Spending'],
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
  const [noScope, setNoScope] = useState(false);

  if (tokens.error) return <LoadError error={tokens.error} onRetry={tokens.reload} />;
  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!tokens.data || !twoStep.data) return <FormSkeleton fields={2} />;
  const close = () => {
    setOpen(false);
    setCreated('');
    setNoScope(false);
  };

  return (
    <>
      <Section
        action={
          <Button icon="plus" label="New token" onClick={() => setOpen(true)} />
        }
        title="Access tokens"
      >
        {tokens.data.length === 0 ? (
          <Empty level={3} title="No tokens">
            A token lets your own scripts use Strata as you, with only the permissions you give it.
          </Empty>
        ) : (
          <SettingsRows>
            {tokens.data.map((token) => (
              <SettingsRow
                action={
                  <Button label="Revoke" onClick={() => setRevoking(token)} />
                }
                key={token.id}
                label={token.name}
              >
                <span className="mono-sm">
                  {token.scopes.join(', ')} · {token.lastUsedAt ? `used ${timeAgo(token.lastUsedAt)}` : 'never used'} · expires{' '}
                  {formatDay(dayKey(new Date(token.expiresAt)), { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </SettingsRow>
            ))}
          </SettingsRows>
        )}
      </Section>

      {open && created && (
        <SecretDialog hint="It won’t be shown again. Store it like a password." onClose={close} title="Copy your token" value={created} />
      )}

      {open && !created && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Creating…"
          onClose={close}
          onSubmit={(target) => {
            const values = new FormData(target);
            const chosen = values.getAll('scopes').map(String);
            setNoScope(chosen.length === 0);
            if (
              chosen.length === 0 ||
              !form.check(target, {
                name: [required('Name the token.'), atMost(60, 'Use at most 60 characters.')],
                password: [required('Enter your password to confirm.')],
                ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
              })
            ) {
              return;
            }
            void creating.run(async () => {
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
                <input defaultChecked={scope === 'spaces:read' || scope === 'items:read'} name="scopes" type="checkbox" value={scope} />
                <span>
                  {description} <span className="mono-sm text-faint">{scope}</span>
                </span>
              </label>
            ))}
            {noScope && (
              <p className="error-message m-0" role="alert">
                Choose at least one permission.
              </p>
            )}
          </fieldset>
          <Select
            defaultValue="90"
            label="Expires after"
            name="expiresInDays"
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: '365', label: '1 year' },
            ]}
          />
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
          tone="danger"
        >
          Anything using it stops working straight away.
        </ConfirmDialog>
      )}
    </>
  );
}
