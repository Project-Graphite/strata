import { useState } from 'react';
import { ConfirmDialog, FormSkeleton, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { SettingsSection, type TwoStepStatus } from './SettingsLayout';

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
  ['items:read', 'Read items, links, the trash and download files'],
  ['items:write', 'Change items and tags, upload files and move things to the trash'],
] as const;

export function TokensSettings() {
  const auth = useAuth();
  const tokens = useResource<AccessToken[]>('/me/tokens', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const creating = useAction();
  const form = useFormErrors();
  const [created, setCreated] = useState('');
  const [revoking, setRevoking] = useState<AccessToken>();

  if (tokens.error) return <p className="error-message">{tokens.error}</p>;
  if (!tokens.data || !twoStep.data) return <FormSkeleton fields={3} />;

  return (
    <div className="fade-in grid max-w-3xl gap-12">
      <SettingsSection
        description="Tokens let your own scripts and apps use Strata as you, limited to the permissions you choose. They can never change your account, password or security settings."
        title="Access tokens"
      >
        {tokens.data.length === 0 ? (
          <p className="mt-5 mb-0 text-sm text-muted">You have no tokens.</p>
        ) : (
          <ul className="mt-5 grid list-none gap-0 p-0">
            {tokens.data.map((token) => (
              <li className="flex items-center justify-between gap-4 border-b border-line-soft py-4" key={token.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">{token.name}</p>
                  <p className="mono-sm m-0 mt-1 text-faint">
                    {token.scopes.join(', ')} · {token.lastUsedAt ? `used ${timeAgo(token.lastUsedAt)}` : 'never used'} ·
                    expires {new Date(token.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button className="secondary-button shrink-0 px-3 py-2 text-sm" onClick={() => setRevoking(token)} type="button">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection description="The token is shown once. Store it like a password." title="New token">
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
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
            void creating
              .run(async () => {
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
                return 'Copy the token now. It will not be shown again.';
              }, 'Could not create the token')
              .then((made) => made && target.reset());
          }}
        >
          <TextField label="Name" maxLength={60} placeholder="Backup script" {...form.field('name')} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="field-label mb-2">Permissions</legend>
            {scopes.map(([scope, description]) => (
              <label className="flex items-start gap-2 text-sm text-ink" key={scope}>
                <input defaultChecked={scope !== 'items:write'} name="scopes" type="checkbox" value={scope} />
                <span>
                  <span className="mono-sm">{scope}</span> <span className="text-muted">— {description}</span>
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
          {creating.status}
          {created && (
            <div className="flex flex-wrap items-center gap-3">
              <code className="mono-sm break-all text-ink">{created}</code>
              <button
                className="secondary-button px-3 py-2 text-sm"
                onClick={() => void navigator.clipboard.writeText(created)}
                type="button"
              >
                Copy token
              </button>
            </div>
          )}
          <button className="primary-button inline-flex w-fit" disabled={creating.busy} type="submit">
            {creating.busy ? 'Creating…' : 'Create token'}
          </button>
        </form>
      </SettingsSection>

      {revoking && (
        <ConfirmDialog
          busyLabel="Revoking…"
          confirmLabel="Revoke token"
          errorFallback="Could not revoke the token"
          eyebrow="revoke token"
          onClose={() => setRevoking(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/tokens/${revoking.id}`, { method: 'DELETE' });
            tokens.mutate((current) => current.filter((token) => token.id !== revoking.id));
          }}
          title={`Revoke ${revoking.name}?`}
        >
          Anything using this token stops working straight away.
        </ConfirmDialog>
      )}
    </div>
  );
}
