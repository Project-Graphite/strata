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
import { ActionsMenu } from '../../components/ActionsMenu';
import { AddButton } from '../../components/Button';
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
  ['account:read', 'See your profile, Home, inbox, dashboards and widgets'],
  ['account:write', 'Change your profile, inbox and dashboards'],
  ['spaces:read', 'See your spaces, their members, invitations, tags and activity'],
  ['spaces:write', 'Create and change spaces, members and invitations'],
  ['items:read', 'Read items, links, share links and the trash, and download files'],
  ['items:write', 'Change items, tags, guests and share links, upload files and move things to the trash'],
  ['spending:capture', 'Send bank text messages to Spending'],
] as const;

function ScopeFields({ chosen, missing }: { chosen: string[]; missing: boolean }) {
  return (
    <Fieldset legend="Permissions">
      {scopes.map(([scope, description]) => (
        <Checkbox
          defaultChecked={chosen.includes(scope)}
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
      {missing && <Banner tone="danger">Choose at least one permission.</Banner>}
    </Fieldset>
  );
}

export const emptyTokens = { title: 'No tokens yet', hint: 'A token lets your own scripts use Strata as you, with only the permissions you give it.' };

export function TokensSettings({ tokens, twoStep }: { tokens: Resource<AccessToken[]>; twoStep: TwoStepStatus }) {
  const auth = useAuth();
  const creating = useAction();
  const form = useFormErrors();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState('');
  const [revoking, setRevoking] = useState<AccessToken>();
  const [editing, setEditing] = useState<AccessToken>();
  const [noScope, setNoScope] = useState(false);

  const close = () => {
    setOpen(false);
    setEditing(undefined);
    setCreated('');
    setNoScope(false);
  };
  const proofChecks = {
    password: [required('Enter your password to confirm.')],
    ...(twoStep.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
  };

  return (
    <>
      <Section
        action={
          <AddButton label="New token" onClick={() => setOpen(true)} />
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
                  <ActionsMenu
                    items={[
                      { label: 'Edit permissions', onSelect: () => setEditing(token) },
                      { label: 'Revoke', onSelect: () => setRevoking(token), separated: true },
                    ]}
                    name={token.name}
                  />
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
                ...proofChecks,
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
          <TextField autoFocus label="Name" maxLength={60} {...form.field('name')} />
          <ScopeFields chosen={['spaces:read', 'items:read']} missing={noScope} />
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

      {editing && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Saving…"
          onClose={close}
          onSubmit={(target) => {
            const values = new FormData(target);
            const chosen = values.getAll('scopes').map(String);
            setNoScope(chosen.length === 0);
            if (chosen.length === 0 || !form.check(target, { name: [required('Name the token.'), atMost(60, 'Use at most 60 characters.')], ...proofChecks })) return;
            void creating
              .run(async () => {
                const saved = await auth.request<AccessToken>(`/me/tokens/${editing.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ name: String(values.get('name')).trim(), scopes: chosen, ...proofFrom(target) }),
                });
                tokens.mutate((current) => current.map((token) => (token.id === saved.id ? saved : token)));
                return `Saved ${saved.name}.`;
              }, 'Could not change the token')
              .then((saved) => saved && close());
          }}
          submitLabel="Save permissions"
          title={`Edit ${editing.name}`}
        >
          <TextField autoFocus defaultValue={editing.name} label="Name" maxLength={60} {...form.field('name')} />
          <ScopeFields chosen={editing.scopes} missing={noScope} />
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
