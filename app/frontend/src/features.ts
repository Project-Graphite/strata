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
];

export const enabledFeatures = (keys: string[] | undefined) => featureCatalogue.filter((feature) => keys?.includes(feature.key));
