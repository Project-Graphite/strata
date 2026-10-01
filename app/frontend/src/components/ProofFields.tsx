import { TextField } from '@project-graphite/ui';
import type { useFormErrors } from '../validation';

export function ProofFields({
  form,
  passwordLabel = 'Your password',
  twoStep,
}: {
  form: ReturnType<typeof useFormErrors>;
  passwordLabel?: string;
  twoStep: boolean;
}) {
  return (
    <>
      <TextField autoComplete="current-password" label={passwordLabel} type="password" {...form.field('password')} />
      {twoStep && (
        <TextField
          autoCapitalize="none"
          autoComplete="one-time-code"
          className="code-input"
          hint="From your authenticator app. A recovery code works too."
          label="Two-step code"
          maxLength={20}
          spellCheck={false}
          {...form.field('code')}
        />
      )}
    </>
  );
}

export function proofFrom(form: HTMLFormElement) {
  const values = new FormData(form);
  const code = String(values.get('code') ?? '').trim();
  return { password: String(values.get('password') ?? ''), ...(code ? { code } : {}) };
}
