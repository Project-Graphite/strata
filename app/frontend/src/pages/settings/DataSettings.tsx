import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FormSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { SettingsRow, SettingsRows, SettingsSection, type TwoStepStatus } from './SettingsLayout';

export function DataSettings() {
  const auth = useAuth();
  const navigate = useNavigate();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const exporting = useAction();
  const removal = useAction();
  const removalForm = useFormErrors();
  const [removing, setRemoving] = useState(false);

  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!twoStep.data) return <FormSkeleton fields={1} />;
  const enabled = twoStep.data.enabled;

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      <SettingsSection title="Your data">
        <SettingsRows>
          <SettingsRow
            action={
              <button
                className="secondary-button px-3 py-2 text-sm"
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
                {exporting.busy ? 'Preparing…' : 'Export'}
              </button>
            }
            label="Export"
          >
            Everything Strata holds about you, as a JSON file.
          </SettingsRow>
          <SettingsRow
            action={
              <button className="secondary-button px-3 py-2 text-sm" onClick={() => setRemoving(true)} type="button">
                Delete
              </button>
            }
            label="Delete account"
          >
            Your account and everything in it, permanently.
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      {removing && (
        <FormDialog
          busy={removal.busy}
          busyLabel="Deleting…"
          onClose={() => setRemoving(false)}
          onSubmit={(target) => {
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
          submitLabel="Delete account"
          title="Delete your account?"
        >
          <p className="m-0 text-sm text-muted">
            This can’t be undone. Backups that still hold your data expire on their normal schedule.
          </p>
          <ProofFields form={removalForm} twoStep={enabled} />
        </FormDialog>
      )}
    </div>
  );
}
