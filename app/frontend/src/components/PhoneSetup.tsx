import { useState } from 'react';
import { Banner, Checkbox, Dialog, Fieldset, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import {
  androidReleaseUrl,
  combinedAllowedSources,
  digitalAppOptions,
  isNativeAndroid,
  loadCapturePreferences,
  parseChatList,
  phoneCaptureAttention,
  saveCapturePreferences,
  serverOrigin,
  StrataCapture,
  useNativeCaptureStatus,
  type DigitalAppId,
  type FinanceApp,
} from '../native-capture';
import type { TwoStepStatus } from '../pages/settings/SettingsLayout';
import type { MoneyAccount } from '../spending';
import { formatMoment } from '../time';
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

interface PhoneSetupProps {
  accounts?: MoneyAccount[];
  onChanged?: () => void;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
}

const appGroups: FinanceApp['group'][] = ['Banks', 'Wallets', 'Apps'];
const squash = (value: string) => value.toLowerCase().replace(/[\s\-_.]+/g, '');
const messages = (count: number) => `${count} message${count === 1 ? '' : 's'}`;
const proofRules = (twoStep: boolean) => ({ password: [required('Enter your password to confirm.')], ...(twoStep ? { code: [required('Enter a code to confirm.')] } : {}) });

export function PhoneSetup(props: PhoneSetupProps) {
  return isNativeAndroid() ? <PhoneCaptureSettings {...props} /> : <PhoneTokenSetup {...props} />;
}

function PhoneCaptureSettings({ accounts = [], onChanged, onClose, spaceId }: PhoneSetupProps) {
  const auth = useAuth();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const saving = useAction();
  const nativeAction = useAction();
  const form = useFormErrors();
  const { status, setStatus, refresh } = useNativeCaptureStatus();
  const [chatsText, setChatsText] = useState<string>();
  const [enabledPackages, setEnabledPackages] = useState<string[]>();
  if (!status) return null;

  const endpointUrl = `${serverOrigin()}/api/v1/spaces/${spaceId}/captures`;
  const accountWords = accounts.flatMap((account) => [account.name, account.institution ?? '', ...account.senders]).map(squash).filter(Boolean);
  const seededChats = [...new Set(accounts.flatMap((account) => [...account.senders, account.institution ?? '']).map((sender) => sender.trim()).filter(Boolean))];
  const chats = chatsText ?? (status.allowedChats.length > 0 ? status.allowedChats : seededChats).join(', ');
  const packages =
    enabledPackages ??
    (status.configured ? status.enabledPackages : status.installedApps.filter((app) => accountWords.some((word) => word.includes(squash(app.label)))).map((app) => app.packageName));
  const attention = phoneCaptureAttention(status);
  const needsToken = !status.configured || status.endpointUrl !== endpointUrl || attention === 'reconnect' || attention === 'renew';
  const twoStepOn = Boolean(twoStep.data?.enabled);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (needsToken && !form.check(target, proofRules(twoStepOn))) return;
        void saving.run(async () => {
          const minted = needsToken
            ? await auth.request<{ token: string; expiresAt: string }>(`/spaces/${spaceId}/captures/device`, { method: 'POST', body: JSON.stringify(proofFrom(target)) })
            : null;
          const next = await StrataCapture.configure({
            endpointUrl,
            ...(minted ? { token: minted.token, tokenExpiresAt: minted.expiresAt } : {}),
            allowedChats: parseChatList(chats),
            enabledPackages: packages,
          });
          setStatus(next);
          if (next.notificationsGranted) await StrataCapture.scanNotifications();
          await StrataCapture.flushOutbox();
          onChanged?.();
          onClose();
          return next.notificationsGranted ? 'Phone capture saved and active.' : 'Phone capture saved. Allow notification access to start reading messages.';
        }, 'Could not save phone capture settings');
      }}
      submitLabel={needsToken && status.configured ? 'Reconnect' : 'Save changes'}
      title="Connect your phone"
    >
      {attention === 'reconnect' && (
        <Banner title="Reconnect your phone" tone="warning">
          Strata stopped accepting messages from this phone. Confirm your password to reconnect; {messages(status.queuedCount)} waiting on the phone will be sent.
        </Banner>
      )}
      {attention === 'renew' && (
        <Banner title="Renew this phone's connection" tone="warning">
          The connection ends {formatMoment(status.tokenExpiresAt)}. Confirm your password to renew it for 90 days.
        </Banner>
      )}
      <Banner
        action={
          <Button
            label={status.notificationsGranted ? 'Notification settings' : 'Allow notification access'}
            onClick={() =>
              void nativeAction.run(async () => {
                await StrataCapture.openNotificationSettings();
                return '';
              }, 'Could not open notification settings')
            }
            primary={!status.notificationsGranted}
          />
        }
        title={status.notificationsGranted ? 'Notification access is on' : 'Allow Strata to read transaction notifications'}
        tone={status.notificationsGranted ? 'info' : 'warning'}
      >
        {status.notificationsGranted
          ? 'Strata reads only texts from the senders below and notifications from the apps you switch on.'
          : 'Required once in Android Settings. If the switch is greyed out, open Settings → Apps → Strata → ⋮ → Allow restricted settings.'}
        {status.notificationsGranted && status.configured && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              label="Read current notifications now"
              onClick={() =>
                void nativeAction.run(async () => {
                  const scanned = await StrataCapture.scanNotifications();
                  refresh();
                  onChanged?.();
                  return `Checked ${scanned.scanned} notifications and queued ${scanned.forwarded}.`;
                }, 'Could not read notifications')
              }
            />
          </div>
        )}
      </Banner>
      <TextField
        autoComplete="off"
        label="SMS senders to read"
        name="allowedChats"
        onChange={(event) => setChatsText(event.target.value)}
        value={chats}
      />
      {status.installedApps.length === 0 ? (
        <p className="m-0 text-small text-muted">No supported bank, wallet or payment app is installed on this phone.</p>
      ) : (
        appGroups.map((group) => {
          const apps = status.installedApps.filter((app) => app.group === group);
          return (
            apps.length > 0 && (
              <Fieldset key={group} legend={group}>
                {apps.map((app) => (
                  <Checkbox
                    checked={packages.includes(app.packageName)}
                    key={app.packageName}
                    label={app.label}
                    onChange={(event) => setEnabledPackages(event.target.checked ? [...packages, app.packageName] : packages.filter((name) => name !== app.packageName))}
                  />
                ))}
              </Fieldset>
            )
          );
        })
      )}
      {status.smsBackfillAvailable && status.configured && (
        <div className="grid gap-1">
          <Button
            label={status.smsGranted ? 'Read texts from the last 90 days' : 'Allow reading past texts'}
            onClick={() =>
              void nativeAction.run(async () => {
                if (!status.smsGranted) {
                  await StrataCapture.requestSmsAccess();
                  return '';
                }
                const read = await StrataCapture.backfillInbox();
                refresh();
                return `Checked ${read.scanned} texts and queued ${messages(read.queued)} from your saved senders.`;
              }, 'Could not read past texts')
            }
          />
          <span className="text-small text-muted">Only texts from the saved senders above are sent. Strata skips messages it already has.</span>
        </div>
      )}
      {status.queuedCount > 0 && <p className="m-0 text-small text-muted">{messages(status.queuedCount)} waiting to send. They go out when the phone is online.</p>}
      {status.evictedCount > 0 && <p className="m-0 text-small text-muted">{messages(status.evictedCount)} were dropped because too many were waiting.</p>}
      {status.rejectedCount > 0 && (
        <Banner
          action={
            <Button
              label="Try again"
              onClick={() =>
                void nativeAction.run(async () => {
                  setStatus(await StrataCapture.retryRejected());
                  return '';
                }, 'Could not retry the refused messages')
              }
            />
          }
          title={`Strata refused ${messages(status.rejectedCount)}`}
          tone="warning"
        >
          {status.lastError}
        </Banner>
      )}
      {needsToken && <ProofFields form={form} twoStep={twoStepOn} />}
    </FormDialog>
  );
}

function PhoneTokenSetup({ accounts = [], onClose, spaceId, spaceName }: PhoneSetupProps) {
  const auth = useAuth();
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const saving = useAction();
  const form = useFormErrors();
  const accountSenders = accounts.flatMap((account) => account.senders);
  const initialPrefs = loadCapturePreferences(spaceId, accountSenders);
  const [chatsText, setChatsText] = useState(() => initialPrefs.allowedChats.join(', '));
  const [enabledApps, setEnabledApps] = useState<DigitalAppId[]>(initialPrefs.enabledApps);
  const [token, setToken] = useState('');
  const endpointUrl = `${serverOrigin()}/api/v1/spaces/${spaceId}/captures`;
  const allowedSources = combinedAllowedSources(parseChatList(chatsText), enabledApps);

  const toggleApp = (appId: DigitalAppId, checked: boolean) => {
    setEnabledApps((current) => (checked ? [...new Set([...current, appId])] : current.filter((item) => item !== appId)));
  };

  if (token) {
    return (
      <Dialog dismissible={false} onClose={onClose} title="Connect your phone">
        <div className="mt-5 grid gap-4 text-body text-ink">
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
        if (!form.check(target, proofRules(Boolean(twoStep.data?.enabled)))) return;
        const nextChats = parseChatList(chatsText);
        saveCapturePreferences(spaceId, { allowedChats: nextChats, enabledApps });
        void saving.run(async () => {
          const created = await auth.request<{ token: string }>('/me/tokens', {
            method: 'POST',
            body: JSON.stringify({ name: `Phone texts for ${spaceName}`.slice(0, 60), scopes: ['spending:capture'], expiresInDays: 90, ...proofFrom(target) }),
          });
          setToken(created.token);
          return '';
        }, 'Could not create the phone token');
      }}
      submitLabel="Create phone token"
      title="Connect your phone"
    >
      <TextField
        autoComplete="off"
        label="Specific SMS chats (optional)"
        name="allowedChats"
        onChange={(event) => setChatsText(event.target.value)}
        value={chatsText}
      />
      <Fieldset legend="Digital transaction apps (non-SMS notifications)">
        {digitalAppOptions.map((app) => (
          <Checkbox
            checked={enabledApps.includes(app.id)}
            key={app.id}
            label={
              <span className="grid">
                <span>{app.label}</span>
                <span className="text-small text-muted">{app.hint}</span>
              </span>
            }
            onChange={(event) => toggleApp(app.id, event.target.checked)}
          />
        ))}
      </Fieldset>
      <ProofFields form={form} twoStep={Boolean(twoStep.data?.enabled)} />
    </FormDialog>
  );
}
