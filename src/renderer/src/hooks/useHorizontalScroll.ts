import { useCallback, useRef } from 'react';

/**
 * Converts vertical wheel events into horizontal scroll on the referenced element.
 * - If the user is already scrolling horizontally (trackpad swipe / Shift+wheel),
 *   the native behaviour is preserved and we don't double-apply it.
 * - The returned ref should be attached to the scrollable container.
 * - The returned onWheel handler should be passed to the same element's `onWheel` prop.
 */
export function useHorizontalScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const onWheel = useCallback((e: React.WheelEvent<T>) => {
    // If the event already carries a meaningful horizontal delta
    // (trackpad horizontal swipe or Shift+wheel), let the browser handle it.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.deltaY === 0) return;

    const el = ref.current;
    if (!el) return;

    // Prevent the page from scrolling vertically.
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  return { ref, onWheel } as const;
}
