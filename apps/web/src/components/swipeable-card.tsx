import { useState, useCallback, type ReactNode } from 'react';
import { Card } from '@yoink/ui-base/components/card';
import { useSwipe, type SwipeState } from '@/lib/use-swipe';
import { cn } from '@yoink/ui-base/lib/utils';

export type SwipeActionType = 'archive' | 'snooze' | 'unarchive';

export type SwipeAction = {
  icon: ReactNode;
  label: string;
  type: SwipeActionType;
  onAction: () => void;
};

export type SwipeableCardProps = {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  disabled?: boolean;
  className?: string;
  'data-capture-id'?: string;
};

export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  disabled = false,
  className,
  'data-capture-id': captureId,
}: SwipeableCardProps) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    direction: null,
    deltaX: 0,
    progress: 0,
    isActive: false,
  });

  const handleSwipeUpdate = useCallback((state: SwipeState) => {
    setSwipeState(state);
  }, []);

  const handleSwipeLeft = useCallback(() => {
    if (leftAction) {
      leftAction.onAction();
    }
  }, [leftAction]);

  const handleSwipeRight = useCallback(() => {
    if (rightAction) {
      rightAction.onAction();
    }
  }, [rightAction]);

  const handleSwipeEnd = useCallback(() => {
    setSwipeState({
      direction: null,
      deltaX: 0,
      progress: 0,
      isActive: false,
    });
  }, []);

  const { handlers } = useSwipe({
    threshold: 80,
    onSwipeUpdate: handleSwipeUpdate,
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    onSwipeEnd: handleSwipeEnd,
    disabled: disabled || (!leftAction && !rightAction),
  });

  const { direction, deltaX, progress, isActive } = swipeState;

  // Calculate opacity for the action indicator (fade in as progress increases)
  const actionOpacity = Math.min(progress * 1.5, 1);
  
  // Determine if threshold is met (for visual feedback)
  const thresholdMet = progress >= 1;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action indicator backgrounds */}
      {leftAction && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-opacity',
            direction === 'left' ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            width: Math.abs(deltaX) + 20,
            opacity: direction === 'left' ? actionOpacity : 0,
            backgroundColor: `var(--swipe-${leftAction.type})`,
          }}
        >
          <div
            className={cn(
              'flex flex-col items-center text-white transition-transform',
              thresholdMet && direction === 'left' ? 'scale-110' : 'scale-100'
            )}
          >
            {leftAction.icon}
            <span className="mt-1 text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}
      {rightAction && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center justify-start px-4 transition-opacity',
            direction === 'right' ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            width: Math.abs(deltaX) + 20,
            opacity: direction === 'right' ? actionOpacity : 0,
            backgroundColor: `var(--swipe-${rightAction.type})`,
          }}
        >
          <div
            className={cn(
              'flex flex-col items-center text-white transition-transform',
              thresholdMet && direction === 'right' ? 'scale-110' : 'scale-100'
            )}
          >
            {rightAction.icon}
            <span className="mt-1 text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Card that slides */}
      <Card
        data-capture-id={captureId}
        className={cn(
          'relative transition-transform',
          !isActive && 'transition-all duration-200',
          className
        )}
        style={{
          transform: isActive ? `translateX(${deltaX}px)` : 'translateX(0)',
        }}
        {...handlers}
      >
        {children}
      </Card>
    </div>
  );
}
