import { useEffect, useState } from 'react';

/** Tailwind `md` — desktop sidebar vs phone Tasks drawer. */
export const MD_BREAKPOINT_PX = 768;

const desktopQuery = `(min-width: ${MD_BREAKPOINT_PX}px)`;

/**
 * True on the always-visible sidebar layout. The mobile Tasks drawer
 * portals to `document.body`, so a CSS `md:hidden` wrapper cannot keep
 * its overlay off the desktop rail.
 */
export function useDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(desktopQuery).matches : false
  );

  useEffect(() => {
    const media = window.matchMedia(desktopQuery);
    const update = (event?: MediaQueryListEvent) => {
      setIsDesktop(event?.matches ?? media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, []);

  return isDesktop;
}
