import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, FormSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { SettingsSection, type TwoStepStatus } from './SettingsLayout';

export function DataSettings() {
  const auth = useAuth();
  const navigate = useNavigate();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const exporting = useAction();
  const removal = useAction();
  const removalForm = useFormErrors();
  const [removing, setRemoving] = useState(false);

  if (twoStep.error) return <p className="error-message">{twoStep.error}</p>;
  if (!twoStep.data) return <FormSkeleton fields={1} />;
  const enabled = twoStep.data.enabled;

  return (
    <div className="fade-in grid max-w-3xl gap-12">
      <SettingsSection description="Download everything Strata holds about you as a JSON file." title="Export">
        <div className="mt-5 grid gap-4">
          {exporting.status}
          <button
            className="secondary-button inline-flex w-fit"
            disabled={exporting.busy}
            onClick={() =>
              void exporting.run(async () => {
                const data = await auth.request<object>('/me/export');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                link.download = 'strata-export.json';
                link.click();
                URL.revokeObjectURL(link.href);
                return 'Your export is downloading.';
              }, 'Could not export your data')
            }
            type="button"
          >
            {exporting.busy ? 'Preparing…' : 'Export my data'}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        description="Deletes your account and everything in it straight away. Backups that still hold it expire on their normal schedule."
        title="Delete account"
      >
        <button className="secondary-button mt-5 inline-flex" onClick={() => setRemoving(true)} type="button">
          Delete my account
        </button>
      </SettingsSection>

      {removing && (
        <Dialog eyebrow="delete account" onClose={() => setRemoving(false)} title="Delete your Strata account?">
          <form
            className="mt-5 grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              if (
                !removalForm.check(target, {
                  password: [required('Enter your password to confirm.')],
                  ...(enabled ? { code: [required('Enter a code to confirm.')] } : {}),
                })
              ) {
                return;
              }
              void removal
                .run(async () => {
                  await auth.deleteAccount(proofFrom(target));
                  return '';
                }, 'Could not delete your account')
                .then((deleted) => deleted && navigate('/'));
            }}
          >
            <p className="m-0 text-sm text-muted">This cannot be undone.</p>
            <ProofFields form={removalForm} twoStep={enabled} />
            {removal.status}
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={() => setRemoving(false)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={removal.busy} type="submit">
                {removal.busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
