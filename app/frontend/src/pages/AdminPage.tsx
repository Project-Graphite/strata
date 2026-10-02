import { FormSkeleton, Toggle } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { NotFoundPage } from './NotFoundPage';

interface SiteSettings {
  inviteOnly: boolean;
}

export function AdminPage() {
  const auth = useAuth();
  const site = useResource<SiteSettings>('/site');
  const saving = useAction();

  if (auth.user?.role !== 'system_manager') return <NotFoundPage />;
  if (site.error) return <p className="error-message">{site.error}</p>;
  if (!site.data) return <FormSkeleton fields={1} />;

  return (
    <section className="page-enter grid max-w-3xl gap-8">
      <div>
        <p className="eyebrow">admin</p>
        <h1 className="page-title">Site settings</h1>
      </div>
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
      {saving.status}
    </section>
  );
}
