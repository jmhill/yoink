import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '@yoink/ui-base/lib/utils';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { tsrReview } from '@/api/client';
import { AppRailPanel } from '@/components/app-rail-panel';
import {
  MOBILE_TABS,
  activeMobileTab,
  reviewBadgeCount,
} from '@/lib/mobile-tabs';
import { reviewAttentionTotal } from '@/lib/review-sections';
import { useProcessCounts } from '@/lib/use-process-counts';
import { viewerTimeZone } from '@/lib/viewer-today';

export function AppNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = activeMobileTab(pathname);
  const { badge: processBadge, proposals } = useProcessCounts();
  const { data: reviewData } = tsrReview.list.useQuery({
    queryKey: ['review'],
    queryData: { query: { limit: PILE_SAFETY_CAP, timeZone: viewerTimeZone() } },
  });
  const reviewProjects = reviewData?.status === 200 ? reviewData.body.projects : [];
  const reviewBadge = reviewBadgeCount(reviewAttentionTotal(reviewProjects, proposals.length));

  return (
    <>
      {/* Phone thumb bar is Capture | Process | Work | Review — not the rail destinations. */}
      <nav
        data-app-mobile-nav=""
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background safe-area-bottom md:hidden"
      >
        <div className="container mx-auto max-w-2xl">
          <div className="flex justify-around">
            {MOBILE_TABS.map((item) => {
              const lit = active === item.key;
              const Icon = item.icon;
              const badge =
                item.key === 'process'
                  ? processBadge
                  : item.key === 'review'
                    ? reviewBadge
                    : null;

              return (
                <Link
                  key={item.key}
                  to={item.to}
                  data-mobile-nav-item={item.label}
                  data-mobile-nav-active={lit ? 'true' : undefined}
                  aria-current={lit ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                    lit
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="relative">
                    <Icon className="h-6 w-6" />
                    {badge !== null ? (
                      <span
                        data-process-badge={item.key === 'process' ? badge : undefined}
                        data-review-badge={item.key === 'review' ? badge : undefined}
                        className="absolute -right-3 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums"
                      >
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <AppRailPanel
        surface="desktop"
        showBrand
        className="fixed left-0 top-0 z-50 hidden h-full w-80 flex-col border-r bg-background p-4 md:flex"
      />
    </>
  );
}
