import { useState } from 'react';
import { CodeInput, FormSkeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { QrCode } from '../../components/QrCode';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { password as newPasswordChecks, required, useFormErrors } from '../../validation';
import { SettingsSection, type TwoStepStatus } from './SettingsLayout';

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
    <div className="mt-5 grid gap-4 rounded-xl border border-line bg-surface p-5">
      <p className="m-0 text-sm text-ink">
        Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They are not
        shown again.
      </p>
      <ul className="mono-sm m-0 grid list-none grid-cols-2 gap-2 p-0 text-ink">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button className="secondary-button inline-flex" onClick={download} type="button">
          Download as text
        </button>
        <button className="primary-button inline-flex" onClick={onDone} type="button">
          I have saved them
        </button>
      </div>
    </div>
  );
}

function TwoStepSetup({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const auth = useAuth();
  const start = useAction();
  const confirm = useAction();
  const startForm = useFormErrors();
  const confirmForm = useFormErrors();
  const [pending, setPending] = useState<{ secret: string; uri: string }>();

  if (!pending) {
    return (
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
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
      >
        <ProofFields form={startForm} twoStep={false} />
        {start.status}
        <button className="primary-button inline-flex w-fit" disabled={start.busy} type="submit">
          {start.busy ? 'Starting…' : 'Set up two-step sign-in'}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-5 grid gap-5">
      <ol className="m-0 grid gap-2 pl-5 text-sm text-muted">
        <li>Open an authenticator app, such as 2FAS, Aegis, Google Authenticator or 1Password.</li>
        <li>Scan this code, or on this phone, open the link below.</li>
        <li>Type the six-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-6">
        <QrCode label="QR code to add Strata to your authenticator app" value={pending.uri} />
        <div className="grid gap-2">
          <a className="rule-link w-fit text-sm" href={pending.uri}>
            Open in authenticator app
          </a>
          <p className="m-0 text-sm text-muted">Or type this key:</p>
          <code className="mono-sm break-all text-ink">{pending.secret.match(/.{1,4}/g)?.join(' ')}</code>
        </div>
      </div>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (!confirmForm.check(target, { code: [required('Enter the six-digit code.')] })) return;
          const code = String(new FormData(target).get('code')).trim();
          void confirm.run(async () => {
            const { recoveryCodes } = await auth.request<{ recoveryCodes: string[] }>('/me/two-step/confirm', {
              method: 'POST',
              body: JSON.stringify({ code }),
            });
            onEnabled(recoveryCodes);
            return '';
          }, 'Could not turn on two-step sign-in');
        }}
      >
        <CodeInput label="Six-digit code" {...confirmForm.field('code')} />
        {confirm.status}
        <button className="primary-button inline-flex w-fit" disabled={confirm.busy} type="submit">
          {confirm.busy ? 'Checking…' : 'Turn on two-step sign-in'}
        </button>
      </form>
    </div>
  );
}

function TwoStepManage({
  onCodes,
  onDisabled,
  status,
}: {
  onCodes: (codes: string[]) => void;
  onDisabled: () => void;
  status: TwoStepStatus;
}) {
  const auth = useAuth();
  const action = useAction();
  const form = useFormErrors();

  function submit(target: HTMLFormElement, intent: string) {
    if (
      !form.check(target, {
        password: [required('Enter your password to confirm.')],
        code: [required('Enter a code to confirm.')],
      })
    ) {
      return;
    }
    const proof = proofFrom(target);
    if (intent === 'disable') {
      void action.run(async () => {
        await auth.request('/me/two-step', { method: 'DELETE', body: JSON.stringify(proof) });
        onDisabled();
        return 'Two-step sign-in is off.';
      }, 'Could not turn off two-step sign-in');
    } else {
      void action.run(async () => {
        const { recoveryCodes } = await auth.request<{ recoveryCodes: string[] }>('/me/two-step/recovery-codes', {
          method: 'POST',
          body: JSON.stringify(proof),
        });
        onCodes(recoveryCodes);
        return '';
      }, 'Could not create new recovery codes');
    }
  }

  return (
    <form
      className="mt-5 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        submit(event.currentTarget, submitter?.value ?? 'codes');
      }}
    >
      <p className="m-0 text-sm text-ink">
        On. {status.recoveryCodesLeft} of 10 recovery codes left.
      </p>
      <ProofFields form={form} twoStep />
      {action.status}
      <div className="flex flex-wrap gap-3">
        <button className="secondary-button inline-flex" disabled={action.busy} type="submit" value="codes">
          New recovery codes
        </button>
        <button className="secondary-button inline-flex" disabled={action.busy} type="submit" value="disable">
          Turn off two-step sign-in
        </button>
      </div>
    </form>
  );
}

export function SecuritySettings() {
  const auth = useAuth();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const password = useAction();
  const passwordForm = useFormErrors();
  const [codes, setCodes] = useState<string[]>();

  if (twoStep.error) return <p className="error-message">{twoStep.error}</p>;
  if (!twoStep.data) return <FormSkeleton fields={3} />;
  const status = twoStep.data;

  return (
    <div className="fade-in grid max-w-3xl gap-12">
      <SettingsSection
        description="Changing your password signs out every other device and emails you a notice."
        title="Password"
      >
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
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
                return 'Password changed. Your other devices were signed out.';
              }, 'Could not change your password')
              .then((changed) => changed && target.reset());
          }}
        >
          <ProofFields form={passwordForm} passwordLabel="Current password" twoStep={status.enabled} />
          <TextField
            autoComplete="new-password"
            hint="At least 12 characters. Passwords found in data breaches are refused."
            label="New password"
            type="password"
            {...passwordForm.field('newPassword')}
          />
          {password.status}
          <button className="primary-button inline-flex w-fit" disabled={password.busy} type="submit">
            {password.busy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        description="Asks for a code from an authenticator app on your phone whenever you sign in, so a stolen password is not enough."
        title="Two-step sign-in"
      >
        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(undefined);
              twoStep.reload();
            }}
          />
        ) : status.enabled ? (
          <TwoStepManage onCodes={setCodes} onDisabled={twoStep.reload} status={status} />
        ) : (
          <TwoStepSetup onEnabled={setCodes} />
        )}
      </SettingsSection>
    </div>
  );
}
