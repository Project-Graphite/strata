import { useState } from 'react';
import { Placeholder, TextField } from '@project-graphite/ui';
import { IconButton } from '../../components/IconButton';
import { useAuth } from '../../auth';
import { FileButton } from '../../components/FileButton';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { forgetAvatar, UserAvatar } from '../../components/UserAvatar';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { emailAddress, required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { ButtonSkeleton, FieldSkeleton } from '../../components/Skeletons';
import { SavedForm } from '../../components/SavedForm';
import { SettingsRow, SettingsRowSkeleton, SettingsRows, type Me, type TwoStepStatus } from './SettingsLayout';

const pictureSide = 256;

async function squared(file: File) {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = pictureSide;
  canvas.height = pictureSide;
  canvas.getContext('2d')!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, pictureSide, pictureSide);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/png'));
}

export function ProfileSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const picture = useAction();
  const email = useAction();
  const emailForm = useFormErrors();
  const [changingEmail, setChangingEmail] = useState(false);
  const [displayName, setDisplayName] = useState<string>();

  if (me.error) return <LoadError error={me.error} onRetry={me.reload} />;
  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!me.data || !twoStep.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading your profile">
        <Section title="Profile">
          <div className="grid gap-4">
            <FieldSkeleton />
            <ButtonSkeleton large width="w-32" />
          </div>
        </Section>
        <Section title="Account">
          <SettingsRows>
            <SettingsRowSkeleton action={<ButtonSkeleton width="w-18" />} />
            <SettingsRowSkeleton row={1} />
          </SettingsRows>
        </Section>
      </Placeholder>
    );
  }
  const current = me.data;
  const shownName = displayName ?? current.displayName;
  const nameProblem = shownName.trim() ? undefined : 'Enter a display name.';
  const changePicture = (avatarId: string | null) => {
    forgetAvatar(current.id);
    me.mutate((shown) => ({ ...shown, avatarId }));
    auth.updateUser({ avatarId });
  };

  return (
    <>
      <Section title="Profile">
        <div className="profile-identity">
          <div className="profile-picture">
            <UserAvatar name={current.displayName} size="lg" userId={current.avatarId ? current.id : undefined} />
            <div className="profile-picture-actions">
              <FileButton
                accept="image/png,image/jpeg,image/webp,image/gif"
                busy={picture.busy}
                iconOnly
                label={current.avatarId ? 'Change your profile picture' : 'Upload a profile picture'}
                onFiles={([file]) =>
                  void picture.run(async () => {
                    const { avatarId } = await auth.request<{ avatarId: string }>('/me/avatar', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'profile.png' },
                      body: await squared(file!),
                    });
                    changePicture(avatarId);
                    return 'Updated your profile picture.';
                  }, 'Could not update your profile picture')
                }
              />
              {current.avatarId && (
                <IconButton
                  disabled={picture.busy}
                  icon="trash"
                  label="Remove your profile picture"
                  onClick={() =>
                    void picture.run(async () => {
                      await auth.request('/me/avatar', { method: 'DELETE' });
                      changePicture(null);
                      return 'Removed your profile picture.';
                    }, 'Could not remove your profile picture')
                  }
                  size="small"
                />
              )}
            </div>
          </div>
          <SavedForm
            className="grid gap-2"
            initial={current.displayName}
            invalid={Boolean(nameProblem)}
            label="Profile"
            onSave={async () => {
              const next = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ displayName: shownName.trim() }) });
              me.mutate(() => next);
              auth.updateUser({ displayName: next.displayName });
              setDisplayName(undefined);
            }}
            values={shownName}
          >
            <TextField autoComplete="name" error={nameProblem} label="Display name" maxLength={80} onChange={(event) => setDisplayName(event.currentTarget.value)} value={shownName} />
          </SavedForm>
        </div>
      </Section>

      <Section title="Account">
        <SettingsRows>
          <SettingsRow action={<IconButton icon="pencil" label="Change your email" onClick={() => setChangingEmail(true)} size="small" />} label="Email">
            {current.email}
          </SettingsRow>
          <SettingsRow label="Handle">@{current.handle}</SettingsRow>
        </SettingsRows>
      </Section>
      {changingEmail && (
        <FormDialog
          busy={email.busy}
          busyLabel="Sending…"
          onClose={() => setChangingEmail(false)}
          onSubmit={(target) => {
            if (
              !emailForm.check(target, {
                email: [required('Enter the new email address.'), emailAddress],
                password: [required('Enter your password to confirm.')],
                ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
              })
            ) {
              return;
            }
            const values = new FormData(target);
            void email
              .run(async () => {
                await auth.request('/me/email', {
                  method: 'POST',
                  body: JSON.stringify({ email: String(values.get('email')).trim(), ...proofFrom(target) }),
                });
                return 'Check the new inbox for a confirmation link.';
              }, 'Could not start the email change')
              .then((sent) => sent && setChangingEmail(false));
          }}
          submitLabel="Send link"
          title="Change email"
        >
          <Hint>The new address takes over once you open the link we send to it.</Hint>
          <TextField autoComplete="email" autoFocus inputMode="email" label="New email" type="email" {...emailForm.field('email')} />
          <ProofFields form={emailForm} twoStep={twoStep.data.enabled} />
        </FormDialog>
      )}
    </>
  );
}
