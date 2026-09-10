import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@yoink/ui-base/components/drawer';
import { cn } from '@yoink/ui-base/lib/utils';
import { Menu } from 'lucide-react';
import { AppRailPanel } from '@/components/app-rail-panel';
import { useSwipe } from '@/lib/use-swipe';

/**
 * Mobile Tasks rail: closed by default so task content owns the screen.
 * Open via the menu control or a left-edge swipe; vaul swipe-to-close.
 * Desktop keeps the always-visible sidebar in AppNav.
 */
export function MobileTasksRailDrawer() {
  const [open, setOpen] = useState(false);
  const swipe = useSwipe({
    threshold: 48,
    disabled: open,
    onSwipeRight: () => setOpen(true),
  });

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
          forceMount
          aria-hidden={!open}
          className={cn(
            'h-full max-h-svh w-72 max-w-[85vw] p-4 pb-24 md:hidden',
            !open && 'invisible pointer-events-none'
          )}
        >
          <DrawerTitle className="sr-only">Lists and views</DrawerTitle>
          <DrawerDescription className="sr-only">
            Smart views, named lists, Unlisted, and New list
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
