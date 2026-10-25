import { useCallback, useEffect, useState } from 'react';
import { Checkbox, Dialog, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import {
  androidReleaseUrl,
  combinedAllowedSources,
  digitalAppOptions,
  isNativeAndroid,
  loadCapturePreferences,
  packagesForApps,
  parseChatList,
  saveCapturePreferences,
  serverOrigin,
  StrataCapture,
  type DigitalAppId,
  type NativeCaptureStatus,
} from '../native-capture';
import type { TwoStepStatus } from '../pages/settings/SettingsLayout';
import type { MoneyAccount } from '../spending';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors } from '../validation';
import { Button } from './Button';
import { Copyable } from './Copyable';
import { DialogActions } from './DialogActions';
import { FormDialog } from './FormDialog';
import { ProofFields, proofFrom } from './ProofFields';

export const forwarderUrl = 'https://f-droid.org/packages/tech.bogomolov.incomingsmsgateway/';
export const notificationForwarderUrl = 'https://f-droid.org/packages/life.andre.message487/';

export function PhoneSetup({
  accounts = [],
  onChanged,
  onClose,
  spaceId,
  spaceName,
}: {
  accounts?: MoneyAccount[];
  onChanged?: () => void;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
}) {
  const auth = useAuth();
  const nativeAndroid = isNativeAndroid();
  const twoStep = useResource<TwoStepStatus>(nativeAndroid ? null : '/me/two-step', true);
  const saving = useAction();
  const nativeAction = useAction();
  const form = useFormErrors();
  const accountSenders = accounts.flatMap((account) => account.senders);
  const initialPrefs = loadCapturePreferences(spaceId, accountSenders);
  const [chatsText, setChatsText] = useState(() => initialPrefs.allowedChats.join(', '));
  const [enabledApps, setEnabledApps] = useState<DigitalAppId[]>(initialPrefs.enabledApps);
  const [token, setToken] = useState('');
  const [nativeStatus, setNativeStatus] = useState<NativeCaptureStatus | null>(null);
  const endpointUrl = `${serverOrigin()}/api/v1/spaces/${spaceId}/captures`;
  const allowedChats = parseChatList(chatsText);
  const allowedSources = combinedAllowedSources(allowedChats, enabledApps);

  const refreshNativeStatus = useCallback(() => {
    if (!nativeAndroid) return;
    void StrataCapture.getStatus()
      .then(setNativeStatus)
      .catch(() => null);
  }, [nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid) return;
    refreshNativeStatus();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNativeStatus();
    };
    window.addEventListener('focus', refreshNativeStatus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refreshNativeStatus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [nativeAndroid, refreshNativeStatus]);

  const toggleApp = (appId: DigitalAppId, checked: boolean) => {
    setEnabledApps((current) => (checked ? [...new Set([...current, appId])] : current.filter((item) => item !== appId)));
  };

  if (nativeAndroid) {
    const notificationsEnabled = Boolean(nativeStatus?.notificationsGranted);
    return (
      <FormDialog
        busy={saving.busy}
        busyLabel="Saving…"
        onClose={onClose}
        onSubmit={() => {
          const nextChats = parseChatList(chatsText);
          saveCapturePreferences(spaceId, { allowedChats: nextChats, enabledApps });
          void saving.run(async () => {
            const reuseExistingToken = Boolean(nativeStatus?.configured && nativeStatus.endpointUrl === endpointUrl);
            const deviceToken = reuseExistingToken
              ? undefined
              : (await auth.request<{ token: string }>(`/spaces/${spaceId}/captures/device`, { method: 'POST' })).token;
            const status = await StrataCapture.configure({
              endpointUrl,
              token: deviceToken,
              allowedChats: nextChats,
              enabledApps,
              enabledPackages: packagesForApps(enabledApps),
            });
            setNativeStatus(status);
            if (status.notificationsGranted) {
              await StrataCapture.syncInboxSms({ allowedChats: nextChats, limit: 100 }).catch(() => null);
              await StrataCapture.flushOutbox().catch(() => null);
            }
            onChanged?.();
            onClose();
            return status.notificationsGranted ? 'Phone capture saved and active.' : 'Phone capture preferences saved. Enable notification access to start reading messages.';
          }, 'Could not save phone capture settings');
        }}
        submitLabel="Save"
        title="Connect this phone"
      >
        <div className="grid gap-2 rounded-field border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium text-ink">
                {notificationsEnabled ? 'Notification access is enabled' : 'Allow Strata to read transaction notifications'}
              </span>
              <span className="text-xs text-muted">
                {notificationsEnabled
                  ? 'Strata is listening for matching bank SMS and payment app notifications.'
                  : 'Required once in Android Settings. If the toggle is greyed out, open Settings → Apps → Strata → ⋮ → Allow restricted settings.'}
              </span>
            </div>
            <Button
              label={notificationsEnabled ? 'Notification settings' : 'Grant notification access'}
              onClick={() =>
                void nativeAction.run(async () => {
                  await StrataCapture.openNotificationSettings();
                  return '';
                }, 'Could not open notification settings')
              }
              primary={!notificationsEnabled}
            />
          </div>
          {notificationsEnabled && nativeStatus?.configured && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                label="Scan active notifications now"
                onClick={() =>
                  void nativeAction.run(async () => {
                    const nextChats = parseChatList(chatsText);
                    saveCapturePreferences(spaceId, { allowedChats: nextChats, enabledApps });
                    const synced = await StrataCapture.syncInboxSms({ allowedChats: nextChats, limit: 100 });
                    onChanged?.();
                    return `Scanned ${synced.scanned} notifications and captured ${synced.forwarded}.`;
                  }, 'Could not scan notifications')
                }
              />
            </div>
          )}
        </div>
        <TextField
          autoComplete="off"
          hint="Comma-separated SMS sender IDs or chat names to read. Personal chats outside this list are skipped."
          label="Specific SMS chats (optional)"
          name="allowedChats"
          onChange={(event) => setChatsText(event.target.value)}
          placeholder="BanK-AlAhly, CIB, VF-Cash"
          value={chatsText}
        />
        <div className="grid gap-2">
          <span className="text-sm font-medium text-ink">Digital transaction apps (non-SMS notifications)</span>
          {digitalAppOptions.map((app) => (
            <Checkbox
              checked={enabledApps.includes(app.id)}
              key={app.id}
              label={`${app.label} — ${app.hint}`}
              onChange={(event) => toggleApp(app.id, event.target.checked)}
            />
          ))}
        </div>
      </FormDialog>
    );
  }

  if (token) {
    return (
      <Dialog dismissible={false} onClose={onClose} title="Connect your Android phone">
        <div className="mt-5 grid gap-4 text-sm text-ink">
          <ol className="m-0 grid gap-2 pl-5">
            <li>
              Install{' '}
              <a href={androidReleaseUrl} rel="noreferrer" target="_blank">
                Strata for Android
              </a>
              , or use{' '}
              <a href={forwarderUrl} rel="noreferrer" target="_blank">
                Incoming SMS to URL forwarder
              </a>{' '}
              and{' '}
              <a href={notificationForwarderUrl} rel="noreferrer" target="_blank">
                Message487
              </a>{' '}
              from F-Droid to forward SMS chats and app notifications from InstaPay, nSave and PayPal.
            </li>
            <li>Filter SMS by your specific bank or wallet chat names, and enable notifications for InstaPay, nSave and PayPal.</li>
            <li>Paste the webhook URL and header below into the forwarder rule.</li>
          </ol>
          <Copyable label="Webhook URL" value={endpointUrl} />
          <Copyable label="Headers" value={JSON.stringify({ Authorization: `Bearer ${token}` })} />
          {allowedSources.length > 0 && <Copyable label="Allowed chats & apps" value={allowedSources.join(', ')} />}
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
      busy={saving.busy}
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { password: [required('Enter your password to confirm.')], ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}) })) return;
        const nextChats = parseChatList(chatsText);
        saveCapturePreferences(spaceId, { allowedChats: nextChats, enabledApps });
        void saving.run(async () => {
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
      <TextField
        autoComplete="off"
        hint="Comma-separated SMS sender IDs or chat names to read. Personal chats outside this list are skipped."
        label="Specific SMS chats (optional)"
        name="allowedChats"
        onChange={(event) => setChatsText(event.target.value)}
        placeholder="BanK-AlAhly, CIB, VF-Cash"
        value={chatsText}
      />
      <div className="grid gap-2">
        <span className="text-sm font-medium text-ink">Digital transaction apps (non-SMS notifications)</span>
        {digitalAppOptions.map((app) => (
          <Checkbox
            checked={enabledApps.includes(app.id)}
            key={app.id}
            label={`${app.label} — ${app.hint}`}
            onChange={(event) => toggleApp(app.id, event.target.checked)}
          />
        ))}
      </div>
      <ProofFields form={form} twoStep={Boolean(twoStep.data?.enabled)} />
    </FormDialog>
  );
}
