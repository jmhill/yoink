import { useRef, useCallback } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

export type SwipeState = {
  direction: SwipeDirection;
  deltaX: number;
  progress: number; // 0 to 1, how far towards threshold
  isActive: boolean;
};

export type UseSwipeOptions = {
  threshold?: number; // Minimum swipe distance to trigger action (default: 80px)
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  onSwipeUpdate?: (state: SwipeState) => void;
  disabled?: boolean;
};

export type UseSwipeReturn = {
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
  state: SwipeState;
  reset: () => void;
};

const INITIAL_STATE: SwipeState = {
  direction: null,
  deltaX: 0,
  progress: 0,
  isActive: false,
};

export function useSwipe(options: UseSwipeOptions = {}): UseSwipeReturn {
  const {
    threshold = 80,
    onSwipeLeft,
    onSwipeRight,
    onSwipeStart,
    onSwipeEnd,
    onSwipeUpdate,
    disabled = false,
  } = options;

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isSwipingRef = useRef<boolean>(false);
  const stateRef = useRef<SwipeState>(INITIAL_STATE);

  const updateState = useCallback((newState: SwipeState) => {
    stateRef.current = newState;
    onSwipeUpdate?.(newState);
  }, [onSwipeUpdate]);

  const reset = useCallback(() => {
    isSwipingRef.current = false;
    updateState(INITIAL_STATE);
  }, [updateState]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    isSwipingRef.current = false;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;

    // If vertical movement is greater than horizontal, don't swipe (allow scroll)
    if (!isSwipingRef.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    // Start swiping if horizontal movement exceeds 10px
    if (!isSwipingRef.current && Math.abs(deltaX) > 10) {
      isSwipingRef.current = true;
      onSwipeStart?.();
    }

    if (isSwipingRef.current) {
      // Prevent page scroll while swiping (only if event is cancelable)
      if (e.cancelable) {
        e.preventDefault();
      }

      const direction: SwipeDirection = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null;
      const progress = Math.min(Math.abs(deltaX) / threshold, 1);

      updateState({
        direction,
        deltaX,
        progress,
        isActive: true,
      });
    }
  }, [disabled, threshold, onSwipeStart, updateState]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;
    
    if (!isSwipingRef.current) {
      return;
    }

    const { deltaX } = stateRef.current;
    
    if (Math.abs(deltaX) >= threshold) {
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    }

    onSwipeEnd?.();
    reset();
  }, [disabled, threshold, onSwipeLeft, onSwipeRight, onSwipeEnd, reset]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    state: stateRef.current,
    reset,
  };
}
