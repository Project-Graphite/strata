import type { IconName } from '@project-graphite/ui';

export interface Feature {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  href: string;
}

export const featureCatalogue: Feature[] = [
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

export const enabledFeatures = (keys: string[] | undefined) => featureCatalogue.filter((feature) => keys?.includes(feature.key));
