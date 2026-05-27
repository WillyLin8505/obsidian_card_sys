import { RefObject, useEffect, useMemo, useState } from 'react';

interface VirtualGridOptions {
  itemHeight: number;
  gap?: number;
  maxColumns?: number;
  overscanRows?: number;
}

export function useVirtualGrid<T>(
  items: T[],
  containerRef: RefObject<HTMLElement>,
  { itemHeight, gap = 16, maxColumns = 4, overscanRows = 2 }: VirtualGridOptions,
) {
  const [viewport, setViewport] = useState({ scrollY: 0, height: 900, width: 1200, top: 0 });

  useEffect(() => {
    const scrollEl = containerRef.current?.closest('main') ?? window as unknown as Element;

    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (scrollEl === window) {
        setViewport({
          scrollY: window.scrollY,
          height: window.innerHeight,
          width: rect?.width ?? window.innerWidth,
          top: (rect?.top ?? 0) + window.scrollY,
        });
      } else {
        const el = scrollEl as Element;
        const elRect = el.getBoundingClientRect();
        // container's position within the scroll space
        const top = (rect?.top ?? 0) - elRect.top + el.scrollTop;
        setViewport({
          scrollY: el.scrollTop,
          height: el.clientHeight,
          width: rect?.width ?? window.innerWidth,
          top,
        });
      }
    };

    update();
    scrollEl.addEventListener('scroll', update, { passive: true } as EventListenerOptions);
    window.addEventListener('resize', update);
    const ro = containerRef.current && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    if (containerRef.current) ro?.observe(containerRef.current);

    return () => {
      scrollEl.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [containerRef]);

  return useMemo(() => {
    const columns = viewport.width >= 1280
      ? maxColumns
      : viewport.width >= 1024
        ? Math.min(maxColumns, 3)
        : viewport.width >= 768
          ? Math.min(maxColumns, 2)
          : 1;
    const rowHeight = itemHeight + gap;
    const totalRows = Math.ceil(items.length / columns);
    const firstVisibleRow = Math.max(0, Math.floor((viewport.scrollY - viewport.top) / rowHeight) - overscanRows);
    const lastVisibleRow = Math.min(
      totalRows,
      Math.ceil((viewport.scrollY + viewport.height - viewport.top) / rowHeight) + overscanRows,
    );
    const startIndex = firstVisibleRow * columns;
    const endIndex = Math.min(items.length, lastVisibleRow * columns);

    return {
      items: items.slice(startIndex, endIndex),
      startIndex,
      columns,
      paddingTop: firstVisibleRow * rowHeight,
      paddingBottom: Math.max(0, (totalRows - lastVisibleRow) * rowHeight),
    };
  }, [gap, itemHeight, items, maxColumns, overscanRows, viewport]);
}
