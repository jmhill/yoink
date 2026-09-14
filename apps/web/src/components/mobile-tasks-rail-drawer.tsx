import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@yoink/ui-base/components/drawer';
import { Menu } from 'lucide-react';
import { AppRailPanel } from '@/components/app-rail-panel';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import { useSwipe } from '@/lib/use-swipe';

/**
 * Mobile Tasks rail: closed by default so task content owns the screen.
 * Open via the menu control or a left-edge swipe; vaul swipe-to-close.
 * Desktop keeps the always-visible sidebar in AppNav — do not mount this
 * drawer there. Vaul portals overlay + sheet to `document.body`, so a
 * CSS `md:hidden` wrapper cannot keep that layer off the desktop rail.
 */
export function MobileTasksRailDrawer() {
  const isDesktop = useDesktopLayout();
  const [open, setOpen] = useState(false);
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const previousHref = useRef(locationHref);
  const swipe = useSwipe({
    threshold: 48,
    disabled: open,
    onSwipeRight: () => setOpen(true),
  });

  useEffect(() => {
    if (previousHref.current !== locationHref) {
      previousHref.current = locationHref;
      setOpen(false);
    }
  }, [locationHref]);

  if (isDesktop) {
    return null;
  }

  return (
    <div className="md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-mobile-tasks-rail-trigger=""
        aria-label="Open lists and views"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-6" />
      </Button>
      <div
        data-mobile-tasks-rail-edge=""
        className="fixed bottom-20 left-0 top-16 z-40 w-4"
        {...swipe.handlers}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        direction="left"
        shouldScaleBackground={false}
      >
        <DrawerContent
          data-mobile-tasks-rail-drawer=""
          className="h-full max-h-svh w-72 max-w-[85vw] overflow-visible p-4 pb-24 md:hidden"
        >
          <DrawerTitle className="sr-only">Lists and views</DrawerTitle>
          <DrawerDescription className="sr-only">
            Inbox mode, task family, named lists, Unlisted, and New list
          </DrawerDescription>
          <AppRailPanel
            surface="mobile-tasks"
            className="flex h-full min-h-0 flex-col"
            onDestinationChosen={() => setOpen(false)}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
