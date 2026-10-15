import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FormSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { SettingsRow, SettingsRows, type TwoStepStatus } from './SettingsLayout';
import { Button } from '../../components/Button';

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
    <>
      <Section title="Your data">
        <SettingsRows>
          <SettingsRow
            action={
              <Button
                disabled={exporting.busy}
                label={exporting.busy ? 'Preparing…' : 'Export'}
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
              />
            }
            label="Export"
          >
            Everything Strata holds about you, as a JSON file.
          </SettingsRow>
          <SettingsRow
            action={
              <Button label="Delete" onClick={() => setRemoving(true)} />
            }
            label="Delete account"
          >
            Your account and everything in it, permanently.
          </SettingsRow>
        </SettingsRows>
      </Section>

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
          <Hint>
            This can’t be undone. Backups that still hold your data expire on their normal schedule.
          </Hint>
          <ProofFields form={removalForm} twoStep={enabled} />
        </FormDialog>
      )}
    </>
  );
}
