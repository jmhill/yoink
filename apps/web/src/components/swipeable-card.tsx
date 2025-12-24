import { useState, useCallback, type ReactNode } from 'react';
import { Card } from '@yoink/ui-base/components/card';
import { useSwipe, type SwipeState, type SwipeDirection } from '@/lib/use-swipe';
import { cn } from '@yoink/ui-base/lib/utils';

export type SwipeActionType = 'trash' | 'snooze' | 'restore';

export type SwipeAction = {
  icon: ReactNode;
  label: string;
  type: SwipeActionType;
  onAction: (direction: SwipeDirection) => void;
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
      leftAction.onAction('left');
    }
  }, [leftAction]);

  const handleSwipeRight = useCallback(() => {
    if (rightAction) {
      rightAction.onAction('right');
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

  // Determine if threshold is met (for visual feedback)
  const thresholdMet = progress >= 1;

  // Determine which action background to show based on swipe direction
  const showRightActionBg = rightAction && direction === 'right';
  const showLeftActionBg = leftAction && direction === 'left';

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action indicator backgrounds - only show the one matching swipe direction */}
      {showRightActionBg && (
        <div
          className="absolute inset-0 flex items-center justify-start px-4"
          style={{
            backgroundColor: `var(--swipe-${rightAction.type})`,
          }}
        >
          <div
            className={cn(
              'flex flex-col items-center text-white transition-transform duration-150',
              thresholdMet ? 'scale-110' : 'scale-100'
            )}
          >
            {rightAction.icon}
            <span className="mt-1 text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}
      {showLeftActionBg && (
        <div
          className="absolute inset-0 flex items-center justify-end px-4"
          style={{
            backgroundColor: `var(--swipe-${leftAction.type})`,
          }}
        >
          <div
            className={cn(
              'flex flex-col items-center text-white transition-transform duration-150',
              thresholdMet ? 'scale-110' : 'scale-100'
            )}
          >
            {leftAction.icon}
            <span className="mt-1 text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Card that slides */}
      <Card
        data-capture-id={captureId}
        className={cn(
          'relative',
          !isActive && 'transition-transform duration-200',
          className
        )}
        style={{
          transform: isActive ? `translateX(${deltaX}px)` : 'translateX(0)',
          touchAction: 'pan-y',
        }}
        {...handlers}
      >
        {children}
      </Card>
    </div>
  );
}
