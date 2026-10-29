import { lazy } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, type Location } from 'react-router';
import { FormPanelSkeleton, PageSkeleton, UiProvider, type UiLinkProps } from '@project-graphite/ui';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AgendaPage = lazy(() => import('./pages/AgendaPage').then((module) => ({ default: module.AgendaPage })));
const BoardPage = lazy(() => import('./pages/BoardPage').then((module) => ({ default: module.BoardPage })));
const BoardsIndex = lazy(() => import('./pages/BoardsIndex').then((module) => ({ default: module.BoardsIndex })));
const BookmarkPage = lazy(() => import('./pages/BookmarkPage').then((module) => ({ default: module.BookmarkPage })));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage').then((module) => ({ default: module.BookmarksPage })));
const CalendarsPage = lazy(() => import('./pages/CalendarsPage').then((module) => ({ default: module.CalendarsPage })));
const EventPage = lazy(() => import('./pages/EventPage').then((module) => ({ default: module.EventPage })));
const FilesPage = lazy(() => import('./pages/FilesPage').then((module) => ({ default: module.FilesPage })));
const GoalPage = lazy(() => import('./pages/GoalPage').then((module) => ({ default: module.GoalPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((module) => ({ default: module.GoalsPage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then((module) => ({ default: module.InboxPage })));
const InvitationsPage = lazy(() => import('./pages/InvitationsPage').then((module) => ({ default: module.InvitationsPage })));
const InvitePage = lazy(() => import('./pages/InvitePage').then((module) => ({ default: module.InvitePage })));
const JournalPage = lazy(() => import('./pages/JournalPage').then((module) => ({ default: module.JournalPage })));
const PagesIndex = lazy(() => import('./pages/PagesIndex').then((module) => ({ default: module.PagesIndex })));
const PeoplePage = lazy(() => import('./pages/PeoplePage').then((module) => ({ default: module.PeoplePage })));
const PersonPage = lazy(() => import('./pages/PersonPage').then((module) => ({ default: module.PersonPage })));
const MealPlanPage = lazy(() => import('./pages/MealPlanPage').then((module) => ({ default: module.MealPlanPage })));
const RecipePage = lazy(() => import('./pages/RecipePage').then((module) => ({ default: module.RecipePage })));
const RecipesPage = lazy(() => import('./pages/RecipesPage').then((module) => ({ default: module.RecipesPage })));
const NetWorthPage = lazy(() => import('./pages/NetWorthPage').then((module) => ({ default: module.NetWorthPage })));
const SpendingInsightsPage = lazy(() => import('./pages/SpendingInsightsPage').then((module) => ({ default: module.SpendingInsightsPage })));
const SpendingPage = lazy(() => import('./pages/SpendingPage').then((module) => ({ default: module.SpendingPage })));
const TripPage = lazy(() => import('./pages/TripPage').then((module) => ({ default: module.TripPage })));
const TripsPage = lazy(() => import('./pages/TripsPage').then((module) => ({ default: module.TripsPage })));
const RecurringPage = lazy(() => import('./pages/RecurringPage').then((module) => ({ default: module.RecurringPage })));
const MorePage = lazy(() => import('./pages/MorePage').then((module) => ({ default: module.MorePage })));
const NotePage = lazy(() => import('./pages/NotePage').then((module) => ({ default: module.NotePage })));
const ForgotPasswordPage = lazy(() => import('./pages/PasswordPages').then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/PasswordPages').then((module) => ({ default: module.ResetPasswordPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const RsvpPage = lazy(() => import('./pages/RsvpPages').then((module) => ({ default: module.RsvpPage })));
const SharePage = lazy(() => import('./pages/RsvpPages').then((module) => ({ default: module.SharePage })));
const SavePage = lazy(() => import('./pages/SavePage').then((module) => ({ default: module.SavePage })));
const DataSettings = lazy(() => import('./pages/settings/DataSettings').then((module) => ({ default: module.DataSettings })));
const DeveloperSettings = lazy(() => import('./pages/settings/DeveloperSettings').then((module) => ({ default: module.DeveloperSettings })));
const AppsSettings = lazy(() => import('./pages/settings/AppsSettings').then((module) => ({ default: module.AppsSettings })));
const ProfileSettings = lazy(() => import('./pages/settings/ProfileSettings').then((module) => ({ default: module.ProfileSettings })));
const SecuritySettings = lazy(() => import('./pages/settings/SecuritySettings').then((module) => ({ default: module.SecuritySettings })));
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout').then((module) => ({ default: module.SettingsLayout })));
const TrashSettings = lazy(() => import('./pages/settings/TrashSettings').then((module) => ({ default: module.TrashSettings })));
const SpaceActivity = lazy(() => import('./pages/spaces/SpaceActivity').then((module) => ({ default: module.SpaceActivity })));
const SpaceItems = lazy(() => import('./pages/spaces/SpaceItems').then((module) => ({ default: module.SpaceItems })));
const SpaceLayout = lazy(() => import('./pages/spaces/SpaceLayout').then((module) => ({ default: module.SpaceLayout })));
const SpaceMembers = lazy(() => import('./pages/spaces/SpaceMembers').then((module) => ({ default: module.SpaceMembers })));
const SpaceHabits = lazy(() => import('./pages/spaces/SpaceHabits').then((module) => ({ default: module.SpaceHabits })));
const SpaceOverview = lazy(() => import('./pages/spaces/SpaceOverview').then((module) => ({ default: module.SpaceOverview })));
const SpaceNotes = lazy(() => import('./pages/spaces/SpaceNotes').then((module) => ({ default: module.SpaceNotes })));
const SpacesPage = lazy(() => import('./pages/spaces/SpacesPage').then((module) => ({ default: module.SpacesPage })));
const SpaceSubscriptions = lazy(() => import('./pages/spaces/SpaceSubscriptions').then((module) => ({ default: module.SpaceSubscriptions })));
const SpaceTags = lazy(() => import('./pages/spaces/SpaceTags').then((module) => ({ default: module.SpaceTags })));
const SpaceTasks = lazy(() => import('./pages/spaces/SpaceTasks').then((module) => ({ default: module.SpaceTasks })));
const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })));
const TidyPage = lazy(() => import('./pages/TidyPage').then((module) => ({ default: module.TidyPage })));
const VerifyPage = lazy(() => import('./pages/VerifyPage').then((module) => ({ default: module.VerifyPage })));
const WallPage = lazy(() => import('./dashboard/Dashboard').then((module) => ({ default: module.WallPage })));

function Protected() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) {
    return <PageSkeleton label="Loading your session" />;
  }
  return auth.user ? <Outlet /> : <Navigate replace state={{ from: location }} to="/login" />;
}

function AppRoute({ app }: { app: string }) {
  const auth = useAuth();
  const location = useLocation();
  return auth.user?.features.includes(app) ? <Outlet /> : <Navigate replace state={{ app, from: location }} to="/settings/apps" />;
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
  ['today', '/agenda/day'],
  ['storage', '/files'],
  ['recurring', '/spending/recurring'],
  ['review', '/journal'],
  ['invitations', '/spaces/invitations'],
  ['menu', '/more'],
  ['trash', '/settings/trash'],
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
            <Route path="wall" element={<WallPage />} />
            <Route element={<AppRoute app="tasks" />}>
              <Route path="tasks" element={<TasksPage />} />
            </Route>
            <Route element={<AppRoute app="agenda" />}>
              <Route path="agenda">
                <Route index element={<AgendaPage key="start" />} />
                <Route path="today" element={<Moved to="/agenda/day" />} />
                <Route path="list" element={<AgendaPage key="list" view="list" />} />
                <Route path="day" element={<AgendaPage key="day" view="day" />} />
                <Route path="week" element={<AgendaPage key="week" view="week" />} />
                <Route path="month" element={<AgendaPage key="month" view="month" />} />
                <Route path="calendars" element={<CalendarsPage />} />
              </Route>
            </Route>
            <Route path="events/:id" element={<EventPage />} />
            <Route element={<AppRoute app="pages" />}>
              <Route path="pages">
                <Route index element={<PagesIndex key="pages" section="pages" />} />
                <Route path="quick-notes" element={<PagesIndex key="quick-notes" section="quick-notes" />} />
                <Route path="journal" element={<PagesIndex key="journal" section="journal" />} />
              </Route>
            </Route>
            <Route element={<AppRoute app="boards" />}>
              <Route path="boards" element={<BoardsIndex />} />
            </Route>
            <Route path="notes/:id" element={<NotePage />} />
            <Route path="boards/:id" element={<BoardPage />} />
            <Route element={<AppRoute app="bookmarks" />}>
              <Route path="bookmarks" element={<BookmarksPage />} />
              <Route path="bookmarks/:id" element={<BookmarkPage />} />
            </Route>
            <Route element={<AppRoute app="journal" />}>
              <Route path="journal" element={<JournalPage />} />
            </Route>
            <Route element={<AppRoute app="files" />}>
              <Route path="files" element={<FilesPage />} />
            </Route>
            <Route element={<AppRoute app="spending" />}>
              <Route path="spending">
                <Route index element={<SpendingPage key="overview" tab="overview" />} />
                <Route path="transactions" element={<SpendingPage key="transactions" tab="transactions" />} />
                <Route path="accounts" element={<SpendingPage key="accounts" tab="accounts" />} />
                <Route path="budgets" element={<SpendingPage key="budgets" tab="budgets" />} />
                <Route path="recurring" element={<RecurringPage />} />
                <Route path="insights" element={<SpendingInsightsPage />} />
                <Route path="net-worth" element={<NetWorthPage />} />
              </Route>
            </Route>
            <Route path="spaces">
              <Route index element={<SpacesPage />} />
              <Route path="invitations" element={<InvitationsPage />} />
              <Route path=":id" element={<SpaceLayout />}>
                <Route index element={<SpaceOverview />} />
                <Route path="items" element={<SpaceItems />} />
                <Route path="pages" element={<SpaceNotes />} />
                <Route path="tasks" element={<SpaceTasks />} />
                <Route path="recurring" element={<SpaceSubscriptions />} />
                <Route path="habits" element={<SpaceHabits />} />
                <Route path="tags" element={<SpaceTags />} />
                <Route path="members" element={<SpaceMembers />} />
                <Route path="activity" element={<SpaceActivity />} />
              </Route>
            </Route>
            <Route element={<AppRoute app="goals" />}>
              <Route path="goals" element={<GoalsPage />} />
              <Route path="goals/:id" element={<GoalPage />} />
            </Route>
            <Route element={<AppRoute app="people" />}>
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonPage />} />
            </Route>
            <Route element={<AppRoute app="recipes" />}>
              <Route path="recipes" element={<RecipesPage />} />
              <Route path="recipes/plan" element={<MealPlanPage />} />
              <Route path="recipes/:id" element={<RecipePage />} />
            </Route>
            <Route element={<AppRoute app="tidy" />}>
              <Route path="tidy" element={<TidyPage key="suggestions" section="suggestions" />} />
              <Route path="tidy/folder" element={<TidyPage key="folder" section="folder" />} />
              <Route path="tidy/history" element={<TidyPage key="history" section="history" />} />
            </Route>
            <Route element={<AppRoute app="trips" />}>
              <Route path="trips" element={<TripsPage />} />
              <Route path="trips/:id" element={<TripPage />} />
            </Route>
            <Route path="inbox" element={<InboxPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="save" element={<SavePage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<ProfileSettings />} />
              <Route path="apps" element={<AppsSettings />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="developer" element={<DeveloperSettings />} />
              <Route path="data" element={<DataSettings />} />
              <Route path="trash" element={<TrashSettings />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </UiProvider>
  );
}
