import type { IconName } from '@project-graphite/ui';

export interface AppEntry {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  href: string;
  within?: string[];
  phoneTab?: boolean;
}

export const appCatalogue: AppEntry[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Lists of things to do, with due dates, repeats and habits, on their own or shared in a space.',
    icon: 'check-mark',
    href: '/tasks',
  },
  {
    key: 'agenda',
    label: 'Agenda',
    description: 'Your day, week and month in one place, with events, connected calendars and what is due.',
    icon: 'calendar',
    href: '/agenda',
    within: ['/events'],
    phoneTab: true,
  },
  {
    key: 'pages',
    label: 'Pages',
    description: 'Notes and documents you can nest, link and share, plus quick notes for anything in passing.',
    icon: 'file',
    href: '/pages',
    within: ['/notes'],
  },
  {
    key: 'boards',
    label: 'Boards',
    description: 'Canvases for sketching ideas, arranging cards and laying out plans.',
    icon: 'board',
    href: '/boards',
  },
  {
    key: 'bookmarks',
    label: 'Bookmarks',
    description: 'Links you save from anywhere, with a preview, tags and a place to read later.',
    icon: 'bookmark',
    href: '/bookmarks',
  },
  {
    key: 'journal',
    label: 'Journal',
    description: 'A daily entry and a weekly review of what you did and what comes next.',
    icon: 'pencil',
    href: '/journal',
  },
  {
    key: 'files',
    label: 'Files',
    description: 'Uploads from across your spaces, in one library you can search and sort.',
    icon: 'library',
    href: '/files',
  },
  {
    key: 'spending',
    label: 'Spending',
    description: 'Accounts, transactions, budgets, recurring payments and your net worth over time.',
    icon: 'wallet',
    href: '/spending',
    phoneTab: true,
  },
  {
    key: 'goals',
    label: 'Goals',
    description: 'Goals for the year, quarter or month, with progress from a number or from linked tasks and habits.',
    icon: 'target',
    href: '/goals',
  },
  {
    key: 'people',
    label: 'People',
    description: 'Birthdays on your agenda with a reminder the day before, gift ideas, and the events you shared.',
    icon: 'users',
    href: '/people',
  },
  {
    key: 'recipes',
    label: 'Recipes and meals',
    description: 'Recipes you can paste from a link, a weekly meal plan, and a shopping list made from it.',
    icon: 'utensils',
    href: '/recipes',
  },
  {
    key: 'tidy',
    label: 'Tidy',
    description: 'Suggestions and rules that file, tag and clear out items across your spaces, with an optional weekly summary.',
    icon: 'sparkles',
    href: '/tidy',
  },
  {
    key: 'trips',
    label: 'Trips',
    description: 'A place for each trip: itinerary, packing list, documents, pages and what it costs, shared with whoever comes along.',
    icon: 'plane',
    href: '/trips',
  },
];

export const enabledApps = (keys: string[] | undefined) =>
  (keys ?? []).flatMap((key) => appCatalogue.filter((app) => app.key === key));
