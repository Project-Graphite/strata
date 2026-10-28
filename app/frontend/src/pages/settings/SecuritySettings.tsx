import { useState } from 'react';
import { CodeInput, Dialog, Placeholder, TextField, TextLink } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { DialogActions } from '../../components/DialogActions';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { QrCode } from '../../components/QrCode';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { password as newPasswordChecks, required, useFormErrors } from '../../validation';
import { SessionsSection } from './SessionsSection';
import { Section } from '../../components/Page';
import { ButtonSkeleton, useRememberedShape } from '../../components/Skeletons';
import { SettingsRow, SettingsRowSkeleton, SettingsRows, type TwoStepStatus } from './SettingsLayout';
import { Button } from '../../components/Button';
import { saveBlob } from '../../files';

type Opened = 'password' | 'enable' | 'codes' | 'disable';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const download = () =>
    saveBlob(new Blob([`Strata recovery codes\n\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' }), 'strata-recovery-codes.txt');
  return (
    <div className="mt-5 grid gap-4">
      <Hint>Each code signs you in once if you lose your phone. They won’t be shown again.</Hint>
      <ul className="mono-sm m-0 grid list-none grid-cols-1 gap-2 rounded-field border border-line p-4 text-ink sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <DialogActions>
        <Button label="Download" large onClick={download} />
        <Button label="I’ve saved them" large onClick={onDone} primary />
      </DialogActions>
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
      <Dialog dismissible={false} onClose={onDone} title="Save your recovery codes">
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
          <TextLink className="w-fit text-sm" href={pending.uri}>
            Open in authenticator app
          </TextLink>
          <Hint>Or enter this key:</Hint>
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
      <Dialog dismissible={false} onClose={onClose} title="Your new recovery codes">
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
      <Hint>Your current codes stop working.</Hint>
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
  const [twoStepOn] = useRememberedShape('settings-two-step', twoStep.data && [Number(twoStep.data.enabled)], [0]);

  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!twoStep.data) {
    return (
      <>
        <Section title="Sign-in">
          <Placeholder label="Loading your sign-in settings">
            <SettingsRows>
              <SettingsRowSkeleton action={<ButtonSkeleton width="w-18" />} detail={false} />
              <SettingsRowSkeleton
                action={
                  twoStepOn ? (
                    <>
                      <ButtonSkeleton width="w-36" />
                      <ButtonSkeleton width="w-18" />
                    </>
                  ) : (
                    <ButtonSkeleton width="w-18" />
                  )
                }
                row={1}
              />
            </SettingsRows>
          </Placeholder>
        </Section>
        <SessionsSection />
      </>
    );
  }
  const status = twoStep.data;
  const close = () => setOpened(undefined);
  const button = (label: string, next: Opened) => (
    <Button label={label} onClick={() => setOpened(next)} />
  );

  return (
    <>
      <Section title="Sign-in">
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
      </Section>
      <SessionsSection />

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
                return 'Password changed. Your other devices were signed out, your access tokens and private calendar link were revoked, and your webhooks were turned off.';
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
          danger
          submitLabel="Turn off"
          title="Turn off two-step sign-in?"
        >
          <Hint>Your password alone will be enough to sign in.</Hint>
          <ProofFields form={disableForm} twoStep />
        </FormDialog>
      )}
    </>
  );
}
