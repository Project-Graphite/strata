import { describe, expect, it } from 'vitest';
import { collapseCrumbs } from '../../frontend/src/breadcrumbs';

const pages = { href: '/pages', label: 'Pages' };
const trip = { href: '/notes/trip', label: 'Trip' };
const packing = { href: '/notes/packing', label: 'Packing' };
const shoes = { href: '/notes/shoes', label: 'Shoes' };

describe('breadcrumbs', () => {
  it('shows short trails in full', () => {
    expect(collapseCrumbs([pages])).toEqual({ shown: [pages], hidden: [] });
    expect(collapseCrumbs([pages, trip, { label: 'Day one' }])).toEqual({ shown: [pages, trip, { label: 'Day one' }], hidden: [] });
  });

  it('keeps the area, the parent and the current page and folds the middle away', () => {
    expect(collapseCrumbs([pages, trip, packing, shoes, { label: 'Boots' }])).toEqual({
      shown: [pages, shoes, { label: 'Boots' }],
      hidden: [trip, packing],
    });
    expect(collapseCrumbs([pages, trip, packing, { label: 'Socks' }])).toEqual({ shown: [pages, packing, { label: 'Socks' }], hidden: [trip] });
  });
});
