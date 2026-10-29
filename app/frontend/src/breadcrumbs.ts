export interface Crumb {
  href?: string;
  label: string;
}

export function collapseCrumbs(crumbs: Crumb[]) {
  return crumbs.length > 3 ? { shown: [crumbs[0]!, ...crumbs.slice(-2)], hidden: crumbs.slice(1, -2) } : { shown: crumbs, hidden: [] };
}
