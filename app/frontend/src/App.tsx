import { Link, Navigate, Outlet, Route, Routes, useLocation, type Location } from 'react-router';
import { FormPanelSkeleton, PageSkeleton, UiProvider, type UiLinkProps } from '@project-graphite/ui';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { AdminPage } from './pages/AdminPage';
import { AgendaPage } from './pages/AgendaPage';
import { BookmarkPage } from './pages/BookmarkPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { CalendarsPage } from './pages/CalendarsPage';
import { EventPage } from './pages/EventPage';
import { FilesPage } from './pages/FilesPage';
import { GoalPage } from './pages/GoalPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { InvitePage } from './pages/InvitePage';
import { JournalPage } from './pages/JournalPage';
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
import { MorePage } from './pages/MorePage';
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
import { TasksPage } from './pages/TasksPage';
import { TidyPage } from './pages/TidyPage';
import { TrashPage } from './pages/TrashPage';
import { VerifyPage } from './pages/VerifyPage';

function Protected() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) {
    return <PageSkeleton label="Loading your session" />;
  }
  return auth.user ? <Outlet /> : <Navigate replace state={{ from: location }} to="/login" />;
}

function FeatureRoute({ feature }: { feature: string }) {
  const auth = useAuth();
  const location = useLocation();
  return auth.user?.features.includes(feature) ? <Outlet /> : <Navigate replace state={{ feature, from: location }} to="/settings/features" />;
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

function Moved({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate replace to={`${to}${search}`} />;
}

const legacyRoutes = [
  ['todo', '/tasks'],
  ['today', '/agenda'],
  ['storage', '/files'],
  ['recurring', '/spending/recurring'],
  ['review', '/journal'],
  ['invitations', '/spaces/invitations'],
  ['menu', '/more'],
] as const;

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
          <Route path="invite/:code" element={<InvitePage />} />
          <Route path="rsvp/:code" element={<RsvpPage />} />
          <Route path="share/:code" element={<SharePage />} />
          {legacyRoutes.map(([path, to]) => (
            <Route element={<Moved to={to} />} key={path} path={path} />
          ))}
          <Route element={<Protected />}>
            <Route path="tasks" element={<TasksPage />} />
            <Route path="agenda">
              <Route index element={<AgendaPage key="today" view="today" />} />
              <Route path="list" element={<AgendaPage key="list" view="list" />} />
              <Route path="day" element={<AgendaPage key="day" view="day" />} />
              <Route path="week" element={<AgendaPage key="week" view="week" />} />
              <Route path="month" element={<AgendaPage key="month" view="month" />} />
              <Route path="calendars" element={<CalendarsPage />} />
            </Route>
            <Route path="events/:id" element={<EventPage />} />
            <Route path="pages">
              <Route index element={<PagesIndex key="pages" section="pages" />} />
              <Route path="quick-notes" element={<PagesIndex key="quick-notes" section="quick-notes" />} />
              <Route path="journal" element={<PagesIndex key="journal" section="journal" />} />
            </Route>
            <Route path="boards" element={<PagesIndex key="boards" section="boards" />} />
            <Route path="notes/:id" element={<NotePage />} />
            <Route path="bookmarks" element={<BookmarksPage />} />
            <Route path="bookmarks/:id" element={<BookmarkPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="spending">
              <Route index element={<SpendingPage key="overview" tab="overview" />} />
              <Route path="transactions" element={<SpendingPage key="transactions" tab="transactions" />} />
              <Route path="accounts" element={<SpendingPage key="accounts" tab="accounts" />} />
              <Route path="budgets" element={<SpendingPage key="budgets" tab="budgets" />} />
              <Route path="recurring" element={<RecurringPage />} />
              <Route path="insights" element={<SpendingInsightsPage />} />
              <Route path="net-worth" element={<NetWorthPage />} />
            </Route>
            <Route path="spaces">
              <Route index element={<SpacesPage />} />
              <Route path="invitations" element={<InvitationsPage />} />
              <Route path=":id" element={<SpaceLayout />}>
                <Route index element={<SpaceItems />} />
                <Route path="pages" element={<SpaceNotes />} />
                <Route path="tasks" element={<SpaceTasks />} />
                <Route path="recurring" element={<SpaceSubscriptions />} />
                <Route path="habits" element={<SpaceHabits />} />
                <Route path="tags" element={<SpaceTags />} />
                <Route path="members" element={<SpaceMembers />} />
                <Route path="activity" element={<SpaceActivity />} />
              </Route>
            </Route>
            <Route element={<FeatureRoute feature="goals" />}>
              <Route path="goals" element={<GoalsPage />} />
              <Route path="goals/:id" element={<GoalPage />} />
            </Route>
            <Route element={<FeatureRoute feature="people" />}>
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonPage />} />
            </Route>
            <Route element={<FeatureRoute feature="recipes" />}>
              <Route path="recipes" element={<RecipesPage />} />
              <Route path="recipes/plan" element={<MealPlanPage />} />
              <Route path="recipes/:id" element={<RecipePage />} />
            </Route>
            <Route element={<FeatureRoute feature="tidy" />}>
              <Route path="tidy" element={<TidyPage key="suggestions" section="suggestions" />} />
              <Route path="tidy/folder" element={<TidyPage key="folder" section="folder" />} />
              <Route path="tidy/history" element={<TidyPage key="history" section="history" />} />
            </Route>
            <Route element={<FeatureRoute feature="trips" />}>
              <Route path="trips" element={<TripsPage />} />
              <Route path="trips/:id" element={<TripPage />} />
            </Route>
            <Route path="inbox" element={<InboxPage />} />
            <Route path="trash" element={<TrashPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="save" element={<SavePage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<ProfileSettings />} />
              <Route path="features" element={<FeaturesSettings />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="developer" element={<DeveloperSettings />} />
              <Route path="data" element={<DataSettings />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </UiProvider>
  );
}
