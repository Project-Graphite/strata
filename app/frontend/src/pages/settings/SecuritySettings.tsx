import { useState } from 'react';
import { CodeInput, Dialog, FormSkeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { QrCode } from '../../components/QrCode';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { password as newPasswordChecks, required, useFormErrors } from '../../validation';
import { SettingsRow, SettingsRows, SettingsSection, type TwoStepStatus } from './SettingsLayout';

type Opened = 'password' | 'enable' | 'codes' | 'disable';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const download = () => {
    const file = new Blob([`Strata recovery codes\n\nEach code works once.\n\n${codes.join('\n')}\n`], {
      type: 'text/plain',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'strata-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="mt-5 grid gap-4">
      <p className="m-0 text-sm text-muted">Each code signs you in once if you lose your phone. They won’t be shown again.</p>
      <ul className="mono-sm m-0 grid list-none grid-cols-2 gap-2 rounded-lg border border-line p-4 text-ink">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-3">
        <button className="secondary-button" onClick={download} type="button">
          Download
        </button>
        <button className="primary-button" onClick={onDone} type="button">
          I’ve saved them
        </button>
      </div>
    </div>
  );
}

function EnableTwoStep({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const auth = useAuth();
  const start = useAction();
  const confirm = useAction();
  const startForm = useFormErrors();
  const confirmForm = useFormErrors();
  const [pending, setPending] = useState<{ secret: string; uri: string }>();
  const [codes, setCodes] = useState<string[]>();

  if (codes) {
    return (
      <Dialog onClose={onDone} title="Save your recovery codes">
        <RecoveryCodes codes={codes} onDone={onDone} />
      </Dialog>
    );
  }

  if (!pending) {
    return (
      <FormDialog
        busy={start.busy}
        busyLabel="Checking…"
        onClose={onClose}
        onSubmit={(target) => {
          if (!startForm.check(target, { password: [required('Enter your password to continue.')] })) return;
          void start.run(async () => {
            setPending(
              await auth.request<{ secret: string; uri: string }>('/me/two-step/setup', {
                method: 'POST',
                body: JSON.stringify(proofFrom(target)),
              }),
            );
            return '';
          }, 'Could not start setting up two-step sign-in');
        }}
        submitLabel="Continue"
        title="Turn on two-step sign-in"
      >
        <ProofFields form={startForm} twoStep={false} />
      </FormDialog>
    );
  }

  return (
    <FormDialog
      busy={confirm.busy}
      busyLabel="Checking…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!confirmForm.check(target, { code: [required('Enter the six-digit code.')] })) return;
        const code = String(new FormData(target).get('code')).trim();
        void confirm.run(async () => {
          const { recoveryCodes } = await auth.request<{ recoveryCodes: string[] }>('/me/two-step/confirm', {
            method: 'POST',
            body: JSON.stringify({ code }),
          });
          setCodes(recoveryCodes);
          return '';
        }, 'Could not turn on two-step sign-in');
      }}
      submitLabel="Turn on"
      title="Scan with your authenticator app"
    >
      <div className="flex flex-wrap items-center gap-5">
        <QrCode label="QR code to add Strata to your authenticator app" value={pending.uri} />
        <div className="grid min-w-0 flex-1 gap-2">
          <a className="rule-link w-fit text-sm" href={pending.uri}>
            Open in authenticator app
          </a>
          <p className="m-0 text-sm text-muted">Or enter this key:</p>
          <code className="mono-sm break-all text-ink">{pending.secret.match(/.{1,4}/g)?.join(' ')}</code>
        </div>
      </div>
      <CodeInput label="Six-digit code" {...confirmForm.field('code')} />
    </FormDialog>
  );
}

function RecoveryCodesDialog({ enabled, onClose }: { enabled: boolean; onClose: () => void }) {
  const auth = useAuth();
  const action = useAction();
  const form = useFormErrors();
  const [codes, setCodes] = useState<string[]>();

  if (codes) {
    return (
      <Dialog onClose={onClose} title="Your new recovery codes">
        <RecoveryCodes codes={codes} onDone={onClose} />
      </Dialog>
    );
  }
  return (
    <FormDialog
      busy={action.busy}
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { password: [required('Enter your password to confirm.')], code: [required('Enter a code to confirm.')] })) return;
        void action.run(async () => {
          const { recoveryCodes } = await auth.request<{ recoveryCodes: string[] }>('/me/two-step/recovery-codes', {
            method: 'POST',
            body: JSON.stringify(proofFrom(target)),
          });
          setCodes(recoveryCodes);
          return '';
        }, 'Could not create new recovery codes');
      }}
      submitLabel="Create codes"
      title="New recovery codes"
    >
      <p className="m-0 text-sm text-muted">Your current codes stop working.</p>
      <ProofFields form={form} twoStep={enabled} />
    </FormDialog>
  );
}

export function SecuritySettings() {
  const auth = useAuth();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const password = useAction();
  const disabling = useAction();
  const passwordForm = useFormErrors();
  const disableForm = useFormErrors();
  const [opened, setOpened] = useState<Opened>();

  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!twoStep.data) return <FormSkeleton fields={2} />;
  const status = twoStep.data;
  const close = () => setOpened(undefined);
  const button = (label: string, next: Opened) => (
    <button className="secondary-button px-3 py-2 text-sm" onClick={() => setOpened(next)} type="button">
      {label}
    </button>
  );

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      <SettingsSection title="Sign-in">
        <SettingsRows>
          <SettingsRow action={button('Change', 'password')} label="Password" />
          <SettingsRow
            action={
              status.enabled ? (
                <>
                  {button('New recovery codes', 'codes')}
                  {button('Turn off', 'disable')}
                </>
              ) : (
                button('Turn on', 'enable')
              )
            }
            label="Two-step sign-in"
          >
            {status.enabled ? `On · ${status.recoveryCodesLeft} of 10 recovery codes left` : 'Off'}
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      {opened === 'password' && (
        <FormDialog
          busy={password.busy}
          busyLabel="Changing…"
          onClose={close}
          onSubmit={(target) => {
            if (
              !passwordForm.check(target, {
                password: [required('Enter your current password.')],
                ...(status.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
                newPassword: newPasswordChecks,
              })
            ) {
              return;
            }
            const next = String(new FormData(target).get('newPassword'));
            void password
              .run(async () => {
                await auth.changePassword(proofFrom(target), next);
                return 'Password changed. Your other devices were signed out and your access tokens were revoked.';
              }, 'Could not change your password')
              .then((changed) => changed && close());
          }}
          submitLabel="Change password"
          title="Change password"
        >
          <ProofFields form={passwordForm} passwordLabel="Current password" twoStep={status.enabled} />
          <TextField
            autoComplete="new-password"
            hint="At least 12 characters. Passwords found in known breaches are refused."
            label="New password"
            type="password"
            {...passwordForm.field('newPassword')}
          />
        </FormDialog>
      )}

      {opened === 'enable' && (
        <EnableTwoStep
          onClose={close}
          onDone={() => {
            close();
            twoStep.reload();
          }}
        />
      )}

      {opened === 'codes' && (
        <RecoveryCodesDialog
          enabled={status.enabled}
          onClose={() => {
            close();
            twoStep.reload();
          }}
        />
      )}

      {opened === 'disable' && (
        <FormDialog
          busy={disabling.busy}
          busyLabel="Turning off…"
          onClose={close}
          onSubmit={(target) => {
            if (!disableForm.check(target, { password: [required('Enter your password to confirm.')], code: [required('Enter a code to confirm.')] })) return;
            void disabling
              .run(async () => {
                await auth.request('/me/two-step', { method: 'DELETE', body: JSON.stringify(proofFrom(target)) });
                twoStep.reload();
                return 'Two-step sign-in is off.';
              }, 'Could not turn off two-step sign-in')
              .then((done) => done && close());
          }}
          submitLabel="Turn off"
          title="Turn off two-step sign-in?"
        >
          <p className="m-0 text-sm text-muted">Your password alone will be enough to sign in.</p>
          <ProofFields form={disableForm} twoStep />
        </FormDialog>
      )}
    </div>
  );
}
