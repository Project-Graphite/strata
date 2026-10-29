import { useVirtualizer, useWindowVirtualizer, type VirtualizerOptions } from '@tanstack/react-virtual';
import { pageScroller } from './page-scroll';

export function usePageVirtualizer<T extends Element>({ enabled = true, ...options }: Pick<VirtualizerOptions<Element, T>, 'count' | 'enabled' | 'estimateSize' | 'getItemKey' | 'overscan' | 'scrollMargin'>) {
  const inShell = pageScroller() !== document.documentElement;
  const onWindow = useWindowVirtualizer<T>({ ...options, enabled: enabled && !inShell });
  const onShell = useVirtualizer<Element, T>({ ...options, enabled: enabled && inShell, getScrollElement: pageScroller });
  return inShell ? onShell : onWindow;
}
