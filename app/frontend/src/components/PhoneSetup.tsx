import { useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { TwoStepStatus } from '../pages/settings/SettingsLayout';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';
import { ProofFields, proofFrom } from './ProofFields';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

export const forwarderUrl = 'https://f-droid.org/packages/tech.bogomolov.incomingsmsgateway/';

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-start gap-2">
        <code className="mono-sm block min-w-0 flex-1 break-all rounded-lg border border-line p-3 text-ink">{value}</code>
        <Button label="Copy" onClick={() => void navigator.clipboard.writeText(value)} />
      </div>
    </div>
  );
}

export function PhoneSetup({ onClose, spaceId, spaceName }: { onClose: () => void; spaceId: string; spaceName: string }) {
  const auth = useAuth();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const creating = useAction();
  const form = useFormErrors();
  const [token, setToken] = useState('');

  if (token) {
    return (
      <Dialog onClose={onClose} title="Connect your Android phone">
        <div className="mt-5 grid gap-4 text-sm text-ink">
          <ol className="m-0 grid gap-2 pl-5">
            <li>
              Install{' '}
              <a href={forwarderUrl} rel="noreferrer" target="_blank">
                Incoming SMS to URL forwarder
              </a>{' '}
              from F-Droid and allow it to read SMS.
            </li>
            <li>Add a rule for each bank or wallet. Sender is the name it texts from, such as CIB or VF-Cash.</li>
            <li>Paste the webhook URL and the header below into the rule, and keep its JSON template.</li>
          </ol>
          <Copyable label="Webhook URL" value={`${window.location.origin}/api/v1/spaces/${spaceId}/captures`} />
          <Copyable label="Headers" value={JSON.stringify({ Authorization: `Bearer ${token}` })} />
          <p className="m-0 text-muted">The token is shown once and can only send messages. Revoke it in Settings → Developer.</p>
          <DialogActions>
            <Button label="Done" large onClick={onClose} primary />
          </DialogActions>
        </div>
      </Dialog>
    );
  }

  return (
    <FormDialog
      busy={creating.busy}
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { password: [required('Enter your password to confirm.')], ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}) })) return;
        void creating.run(async () => {
          const created = await auth.request<{ token: string }>('/me/tokens', {
            method: 'POST',
            body: JSON.stringify({ name: `Phone texts for ${spaceName}`.slice(0, 60), scopes: ['spending:capture'], expiresInDays: 365, ...proofFrom(target) }),
          });
          setToken(created.token);
          return '';
        }, 'Could not create the phone token');
      }}
      submitLabel="Create phone token"
      title="Connect your Android phone"
    >
      <ProofFields form={form} twoStep={Boolean(twoStep.data?.enabled)} />
    </FormDialog>
  );
}
