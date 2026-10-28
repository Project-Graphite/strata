import { Avatar, ListRow, Placeholder, TextField, timeAgo, Toggle } from '@project-graphite/ui';
import { isAdmin, useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { NotFoundPage } from './NotFoundPage';
import { Button } from '../components/Button';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { fileSize } from '../files';
import { AvatarSkeleton, ButtonSkeleton, FieldSkeleton, RowsSkeleton, SkeletonLine, ToggleSkeleton, useRememberedShape } from '../components/Skeletons';

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
  const admin = isAdmin(auth.user);
  const site = useResource<SiteSettings>('/site');
  const accounts = useResource<Account[]>(admin ? '/admin/users' : null, true);
  const saving = useAction();
  const quota = useAction();
  const [accountRows] = useRememberedShape('admin-accounts', accounts.data && [accounts.data.length], [4]);

  if (!admin) return <NotFoundPage />;
  if (site.error) {
    return (
      <Page title="Admin">
        <LoadError error={site.error} onRetry={site.reload} />
      </Page>
    );
  }

  return (
    <Page title="Admin">
      {site.data ? (
        <Section title="Site settings">
          <div className="panel-rows">
            <Toggle
              checked={site.data.inviteOnly}
              description="New accounts need an invite while this is on. People who already have an account aren’t affected."
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
          </div>
          <form
            className="grid max-w-3xl gap-4"
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
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <Button disabled={quota.busy} label={quota.busy ? 'Saving…' : 'Save'} primary submit />
          </form>
        </Section>
      ) : (
        <Placeholder label="Loading the site settings">
          <Section title="Site settings">
            <div className="panel-rows">
              <ToggleSkeleton description />
            </div>
            <div className="grid max-w-3xl gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSkeleton hint />
              </div>
              <ButtonSkeleton width="w-16" />
            </div>
          </Section>
        </Placeholder>
      )}
      <Section
        description={accounts.data ? (accounts.data.length === 1 ? '1 account' : `${accounts.data.length} accounts`) : !accounts.error && <SkeletonLine width="w-20" />}
        title="People"
      >
        {accounts.error ? (
          <LoadError compact error={accounts.error} onRetry={accounts.reload} />
        ) : !accounts.data ? (
          <Placeholder label="Loading the accounts">
            <RowsSkeleton lead={<AvatarSkeleton />} rows={accountRows} />
          </Placeholder>
        ) : (
          <ul className="panel-rows">
            {accounts.data.map((account) => (
              <ListRow
                key={account.id}
                lead={<Avatar name={account.displayName} />}
                meta={[
                  account.email,
                  `@${account.handle}`,
                  `joined ${timeAgo(account.createdAt)}`,
                  `${fileSize(account.usedBytes)} stored`,
                  !account.verified && 'not verified',
                  !account.isActive && 'deactivated',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                title={[account.displayName, roleNames[account.role]].filter(Boolean).join(' · ')}
              />
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
