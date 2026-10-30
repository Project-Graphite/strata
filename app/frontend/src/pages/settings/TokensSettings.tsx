import { useState } from 'react';
import { Banner, Checkbox, ConfirmDialog, Fieldset, Select, TextField } from '@project-graphite/ui';
import { dayKey } from '../../agenda';
import { useAuth } from '../../auth';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { formatDate, formatMoment } from '../../time';
import { useAction } from '../../useAction';
import type { Resource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { SettingsRow, SettingsRows, type TwoStepStatus } from './SettingsLayout';
import { Button } from '../../components/Button';
import { SecretDialog } from '../../components/Copyable';

export interface AccessToken {
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

export const emptyTokens = { title: 'No tokens yet', hint: 'A token lets your own scripts use Strata as you, with only the permissions you give it.' };

export function TokensSettings({ tokens, twoStep }: { tokens: Resource<AccessToken[]>; twoStep: TwoStepStatus }) {
  const auth = useAuth();
  const creating = useAction();
  const form = useFormErrors();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState('');
  const [revoking, setRevoking] = useState<AccessToken>();
  const [noScope, setNoScope] = useState(false);

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
        {tokens.data!.length === 0 ? (
          <Empty title={emptyTokens.title}>{emptyTokens.hint}</Empty>
        ) : (
          <SettingsRows>
            {tokens.data!.map((token) => (
              <SettingsRow
                action={
                  <Button label="Revoke" onClick={() => setRevoking(token)} />
                }
                key={token.id}
                label={token.name}
              >
                {token.scopes.join(', ')} · {token.lastUsedAt ? `used ${formatMoment(token.lastUsedAt)}` : 'never used'} · expires {formatDate(dayKey(new Date(token.expiresAt)))}
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
                ...(twoStep.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
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
          <Fieldset legend="Permissions">
            {scopes.map(([scope, description]) => (
              <Checkbox
                defaultChecked={scope === 'spaces:read' || scope === 'items:read'}
                key={scope}
                label={
                  <span>
                    {description} <span className="mono-sm text-faint">{scope}</span>
                  </span>
                }
                name="scopes"
                value={scope}
              />
            ))}
            {noScope && (
              <Banner tone="danger">Choose at least one permission.</Banner>
            )}
          </Fieldset>
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
          <ProofFields form={form} twoStep={twoStep.enabled} />
        </FormDialog>
      )}

      {revoking && (
        <ConfirmDialog
          busyLabel="Revoking…"
          confirmLabel="Revoke token"
          errorFallback="Could not revoke the token"
          onClose={() => setRevoking(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/tokens/${revoking.id}`, { method: 'DELETE' });
            tokens.mutate((current) => current.filter((token) => token.id !== revoking.id));
            creating.report(`Revoked ${revoking.name}.`);
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
