import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, type Location } from 'react-router';
import { FormPanelSkeleton, PageSkeleton, UiProvider, type UiLinkProps } from '@project-graphite/ui';
import { useAuth } from './auth';
import { OpenCreatedPage } from './components/OpenCreatedPage';
import { Shell } from './components/Shell';
import { AdminPage } from './pages/AdminPage';
import { AgendaPage } from './pages/AgendaPage';
import { BookmarkPage } from './pages/BookmarkPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { CalendarsPage } from './pages/CalendarsPage';
import { EventPage } from './pages/EventPage';
import { GoalPage } from './pages/GoalPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { InvitePage } from './pages/InvitePage';
import { JournalDayPage, JournalPage } from './pages/JournalPage';
import { PagesIndex } from './pages/PagesIndex';
import { PeoplePage } from './pages/PeoplePage';
import { PersonPage } from './pages/PersonPage';
import { MealPlanPage } from './pages/MealPlanPage';
import { RecipePage } from './pages/RecipePage';
import { RecipesPage } from './pages/RecipesPage';
import { NetWorthPage } from './pages/NetWorthPage';
import { SpendingInsightsPage } from './pages/SpendingInsightsPage';
import { SpendingPage } from './pages/SpendingPage';
import { TripPage } from './pages/TripPage';
import { TripsPage } from './pages/TripsPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import { RecurringPage } from './pages/RecurringPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotePage } from './pages/NotePage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { RegisterPage } from './pages/RegisterPage';
import { RsvpPage, SharePage } from './pages/RsvpPages';
import { SavePage } from './pages/SavePage';
import { DataSettings } from './pages/settings/DataSettings';
import { DeveloperSettings } from './pages/settings/DeveloperSettings';
import { FeaturesSettings } from './pages/settings/FeaturesSettings';
import { ProfileSettings } from './pages/settings/ProfileSettings';
import { SecuritySettings } from './pages/settings/SecuritySettings';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SpaceActivity } from './pages/spaces/SpaceActivity';
import { SpaceItems } from './pages/spaces/SpaceItems';
import { SpaceLayout } from './pages/spaces/SpaceLayout';
import { SpaceMembers } from './pages/spaces/SpaceMembers';
import { SpaceHabits } from './pages/spaces/SpaceHabits';
import { SpaceNotes } from './pages/spaces/SpaceNotes';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { SpaceSubscriptions } from './pages/spaces/SpaceSubscriptions';
import { SpaceTags } from './pages/spaces/SpaceTags';
import { SpaceTasks } from './pages/spaces/SpaceTasks';
import { TidyPage } from './pages/TidyPage';
import { TodayPage } from './pages/TodayPage';
import { TodoPage } from './pages/TodoPage';
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

function FeatureRoute({ children, feature }: { children: ReactNode; feature: string }) {
  const auth = useAuth();
  return auth.user?.features.includes(feature) ? children : <Navigate replace state={{ feature }} to="/settings/features" />;
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
            <Route path="notes" element={<SpaceNotes />} />
            <Route path="tasks" element={<SpaceTasks />} />
            <Route path="recurring" element={<SpaceSubscriptions />} />
            <Route path="habits" element={<SpaceHabits />} />
            <Route path="tags" element={<SpaceTags />} />
            <Route path="members" element={<SpaceMembers />} />
            <Route path="activity" element={<SpaceActivity />} />
          </Route>
          <Route path="invite/:code" element={<InvitePage />} />
          <Route path="rsvp/:code" element={<RsvpPage />} />
          <Route path="share/:code" element={<SharePage />} />
          <Route
            path="goals"
            element={
              <Protected>
                <FeatureRoute feature="goals">
                  <GoalsPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="goals/:id"
            element={
              <Protected>
                <FeatureRoute feature="goals">
                  <GoalPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="people"
            element={
              <Protected>
                <FeatureRoute feature="people">
                  <PeoplePage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="people/:id"
            element={
              <Protected>
                <FeatureRoute feature="people">
                  <PersonPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="recipes"
            element={
              <Protected>
                <FeatureRoute feature="recipes">
                  <RecipesPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="recipes/plan"
            element={
              <Protected>
                <FeatureRoute feature="recipes">
                  <MealPlanPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="recipes/:id"
            element={
              <Protected>
                <FeatureRoute feature="recipes">
                  <RecipePage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="spending"
            element={
              <Protected>
                <SpendingPage />
              </Protected>
            }
          />
          <Route
            path="spending/insights"
            element={
              <Protected>
                <SpendingInsightsPage />
              </Protected>
            }
          />
          <Route
            path="spending/net-worth"
            element={
              <Protected>
                <NetWorthPage />
              </Protected>
            }
          />
          <Route
            path="trips"
            element={
              <Protected>
                <FeatureRoute feature="trips">
                  <TripsPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="trips/:id"
            element={
              <Protected>
                <FeatureRoute feature="trips">
                  <TripPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="agenda"
            element={
              <Protected>
                <AgendaPage />
              </Protected>
            }
          />
          <Route
            path="agenda/calendars"
            element={
              <Protected>
                <CalendarsPage />
              </Protected>
            }
          />
          <Route
            path="pages"
            element={
              <Protected>
                <PagesIndex kind="note" key="note" />
              </Protected>
            }
          />
          <Route
            path="boards"
            element={
              <Protected>
                <PagesIndex kind="board" key="board" />
              </Protected>
            }
          />
          <Route
            path="bookmarks"
            element={
              <Protected>
                <BookmarksPage />
              </Protected>
            }
          />
          <Route
            path="bookmarks/:id"
            element={
              <Protected>
                <BookmarkPage />
              </Protected>
            }
          />
          <Route
            path="journal"
            element={
              <Protected>
                <JournalPage />
              </Protected>
            }
          />
          <Route
            path="journal/:day"
            element={
              <Protected>
                <JournalDayPage />
              </Protected>
            }
          />
          <Route
            path="review"
            element={
              <Protected>
                <OpenCreatedPage back="/journal" fallback="The weekly review could not be written." label="Writing your weekly review" path="/me/weekly-review" />
              </Protected>
            }
          />
          <Route
            path="notes/:id"
            element={
              <Protected>
                <NotePage />
              </Protected>
            }
          />
          <Route
            path="events/:id"
            element={
              <Protected>
                <EventPage />
              </Protected>
            }
          />
          <Route
            path="recurring"
            element={
              <Protected>
                <RecurringPage />
              </Protected>
            }
          />
          <Route
            path="menu"
            element={
              <Protected>
                <MenuPage />
              </Protected>
            }
          />
          <Route
            path="save"
            element={
              <Protected>
                <SavePage />
              </Protected>
            }
          />
          <Route
            path="tidy"
            element={
              <Protected>
                <FeatureRoute feature="tidy">
                  <TidyPage />
                </FeatureRoute>
              </Protected>
            }
          />
          <Route
            path="today"
            element={
              <Protected>
                <TodayPage />
              </Protected>
            }
          />
          <Route
            path="todo"
            element={
              <Protected>
                <TodoPage />
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
            <Route path="features" element={<FeaturesSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route path="developer" element={<DeveloperSettings />} />
            <Route path="sessions" element={<Navigate replace to="/settings/security" />} />
            <Route path="tokens" element={<Navigate replace to="/settings/developer" />} />
            <Route path="api" element={<Navigate replace to="/settings/developer" />} />
            <Route path="data" element={<DataSettings />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </UiProvider>
  );
}
