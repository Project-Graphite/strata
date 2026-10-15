import { Avatar, FormSkeleton, ListSkeleton, TextField, timeAgo, Toggle } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { NotFoundPage } from './NotFoundPage';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { fileSize } from '../files';

interface SiteSettings {
  inviteOnly: boolean;
  fileQuotaMb: number;
}

interface Account {
  id: string;
  displayName: string;
  email: string;
  handle: string;
  role: 'member' | 'admin' | 'system_manager';
  verified: boolean;
  isActive: boolean;
  createdAt: string;
  usedBytes: number;
}

const roleNames = { member: '', admin: 'Admin', system_manager: 'System manager' };

export function AdminPage() {
  const auth = useAuth();
  const admin = auth.user?.role === 'admin' || auth.user?.role === 'system_manager';
  const site = useResource<SiteSettings>('/site');
  const accounts = useResource<Account[]>(admin ? '/admin/users' : null, true);
  const saving = useAction();
  const quota = useAction();

  if (!admin) return <NotFoundPage />;
  if (site.error) return <LoadError error={site.error} onRetry={site.reload} />;
  if (!site.data) return <FormSkeleton fields={1} />;

  return (
    <Page title="Admin">
      <Section title="Site settings">
        <Toggle
          checked={site.data.inviteOnly}
          description="New accounts need an invite while this is on. People who already have an account are not affected."
          disabled={saving.busy}
          label="Invite-only sign-up"
          onChange={(inviteOnly) =>
            void saving.run(async () => {
              const saved = await auth.request<SiteSettings>('/admin/site', {
                method: 'PATCH',
                body: JSON.stringify({ inviteOnly }),
              });
              site.mutate(() => saved);
              return saved.inviteOnly ? 'Sign-up now needs an invite.' : 'Anyone can sign up again.';
            }, 'Could not save the setting')
          }
        />
        <form
          className="grid max-w-sm gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const fileQuotaMb = Number(new FormData(event.currentTarget).get('fileQuotaMb'));
            void quota.run(async () => {
              const saved = await auth.request<SiteSettings>('/admin/site', {
                method: 'PATCH',
                body: JSON.stringify({ fileQuotaMb }),
              });
              site.mutate(() => saved);
              return `Everyone can now store up to ${saved.fileQuotaMb} MB.`;
            }, 'Could not save the storage limit');
          }}
        >
          <TextField
            defaultValue={site.data.fileQuotaMb}
            hint="Counted from the files each person uploads. Files can be at most 25 MB each."
            inputMode="numeric"
            label="File storage per person (MB)"
            max={10240}
            min={1}
            name="fileQuotaMb"
            type="number"
          />
          <button className="primary-button inline-flex w-fit" disabled={quota.busy} type="submit">
            {quota.busy ? 'Saving…' : 'Save limit'}
          </button>
        </form>
      </Section>
      <Section description={accounts.data && (accounts.data.length === 1 ? '1 account' : `${accounts.data.length} accounts`)} title="People">
        {accounts.error ? (
          <LoadError error={accounts.error} onRetry={accounts.reload} />
        ) : !accounts.data ? (
          <ListSkeleton label="Loading the accounts" rows={4} />
        ) : (
          <ul className="panel-rows">
            {accounts.data.map((account) => (
              <li className="panel-row flex items-center gap-3" key={account.id}>
                <Avatar name={account.displayName} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-ink">{[account.displayName, roleNames[account.role]].filter(Boolean).join(' · ')}</span>
                  <span className="truncate text-sm text-muted">
                    {[
                      account.email,
                      `@${account.handle}`,
                      `joined ${timeAgo(account.createdAt)}`,
                      `${fileSize(account.usedBytes)} stored`,
                      !account.verified && 'not verified',
                      !account.isActive && 'deactivated',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
