import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, type Location } from 'react-router';
import { FormPanelSkeleton, PageSkeleton, UiProvider, type UiLinkProps } from '@project-graphite/ui';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { InvitePage } from './pages/InvitePage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { RegisterPage } from './pages/RegisterPage';
import { DataSettings } from './pages/settings/DataSettings';
import { ProfileSettings } from './pages/settings/ProfileSettings';
import { SecuritySettings } from './pages/settings/SecuritySettings';
import { SessionsSettings } from './pages/settings/SessionsSettings';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { TokensSettings } from './pages/settings/TokensSettings';
import { SpaceActivity } from './pages/spaces/SpaceActivity';
import { SpaceItems } from './pages/spaces/SpaceItems';
import { SpaceLayout } from './pages/spaces/SpaceLayout';
import { SpaceMembers } from './pages/spaces/SpaceMembers';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { SpaceTags } from './pages/spaces/SpaceTags';
import { SpaceTasks } from './pages/spaces/SpaceTasks';
import { TodayPage } from './pages/TodayPage';
import { TrashPage } from './pages/TrashPage';
import { VerifyPage } from './pages/VerifyPage';

function Protected({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) {
    return <PageSkeleton label="Loading your session" />;
  }
  return auth.user ? children : <Navigate replace state={{ from: location }} to="/login" />;
}

function SignedOutLogin() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) {
    return <FormPanelSkeleton label="Loading your session" />;
  }
  const from = (location.state as { from?: Location } | null)?.from;
  return auth.user ? <Navigate replace to={from ?? '/'} /> : <LoginPage />;
}

function RouterLink({ href, ...props }: UiLinkProps) {
  return <Link to={href} {...props} />;
}

export function App() {
  return (
    <UiProvider link={RouterLink}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="verify" element={<VerifyPage />} />
          <Route path="login" element={<SignedOutLogin />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route
            path="spaces"
            element={
              <Protected>
                <SpacesPage />
              </Protected>
            }
          />
          <Route
            path="spaces/:id"
            element={
              <Protected>
                <SpaceLayout />
              </Protected>
            }
          >
            <Route index element={<SpaceItems />} />
            <Route path="tasks" element={<SpaceTasks />} />
            <Route path="tags" element={<SpaceTags />} />
            <Route path="members" element={<SpaceMembers />} />
            <Route path="activity" element={<SpaceActivity />} />
          </Route>
          <Route path="invite/:code" element={<InvitePage />} />
          <Route
            path="today"
            element={
              <Protected>
                <TodayPage />
              </Protected>
            }
          />
          <Route
            path="inbox"
            element={
              <Protected>
                <InboxPage />
              </Protected>
            }
          />
          <Route
            path="invitations"
            element={
              <Protected>
                <InvitationsPage />
              </Protected>
            }
          />
          <Route
            path="admin"
            element={
              <Protected>
                <AdminPage />
              </Protected>
            }
          />
          <Route
            path="trash"
            element={
              <Protected>
                <TrashPage />
              </Protected>
            }
          />
          <Route
            path="settings"
            element={
              <Protected>
                <SettingsLayout />
              </Protected>
            }
          >
            <Route index element={<ProfileSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route path="sessions" element={<SessionsSettings />} />
            <Route path="tokens" element={<TokensSettings />} />
            <Route path="data" element={<DataSettings />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </UiProvider>
  );
}
