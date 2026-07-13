import { useEffect, useState } from "react";

/** Collapse a toolbar's secondary actions into a `⋯` overflow menu once the row
 *  gets too narrow to seat them beside a min-width-protected URL and the primary
 *  action. A ResizeObserver on the toolbar element drives the boolean; the caller
 *  renders the inline controls when false, the overflow menu when true. The
 *  threshold is the toolbar width below which the extras no longer fit at full
 *  URL width — measured in px, matching the Postman priority (URL + Send never
 *  shrink; Save/Copy/Refresh fold first). */
export function useToolbarOverflow(
  ref: React.RefObject<HTMLElement | null>,
  collapseBelowPx: number,
): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element == null) return;
    // clientWidth is 0 before layout (and always 0 in jsdom): treat unmeasured as
    // "fits" so the inline controls render until a real width proves too narrow.
    const measure = () => {
      const width = element.clientWidth;
      setCollapsed(width > 0 && width < collapseBelowPx);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, collapseBelowPx]);

  return collapsed;
}
