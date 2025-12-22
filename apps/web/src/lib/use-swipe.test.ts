import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipe } from './use-swipe';

const createTouchEvent = (clientX: number, clientY: number = 0) => ({
  touches: [{ clientX, clientY }],
  preventDefault: vi.fn(),
}) as unknown as React.TouchEvent;

describe('useSwipe', () => {
  describe('touch event handling', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useSwipe());
      
      expect(result.current.state).toEqual({
        direction: null,
        deltaX: 0,
        progress: 0,
        isActive: false,
      });
    });

    it('should detect horizontal swipe right', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeUpdate }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      expect(onSwipeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'right',
          deltaX: 50,
          isActive: true,
        })
      );
    });

    it('should detect horizontal swipe left', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeUpdate }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      expect(onSwipeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'left',
          deltaX: -50,
          isActive: true,
        })
      );
    });

    it('should not trigger swipe when vertical movement is greater', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeUpdate }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0, 0));
      });

      // Vertical movement greater than horizontal
      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(10, 50));
      });

      // onSwipeUpdate should not be called since we're scrolling vertically
      expect(onSwipeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('swipe callbacks', () => {
    it('should call onSwipeRight when threshold is met', () => {
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeRight, threshold: 80 }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(100));
      });

      act(() => {
        result.current.handlers.onTouchEnd(createTouchEvent(100));
      });

      expect(onSwipeRight).toHaveBeenCalled();
    });

    it('should call onSwipeLeft when threshold is met', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeLeft, threshold: 80 }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchEnd(createTouchEvent(0));
      });

      expect(onSwipeLeft).toHaveBeenCalled();
    });

    it('should not call swipe callbacks when threshold is not met', () => {
      const onSwipeRight = vi.fn();
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() => 
        useSwipe({ onSwipeRight, onSwipeLeft, threshold: 80 })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      act(() => {
        result.current.handlers.onTouchEnd(createTouchEvent(50));
      });

      expect(onSwipeRight).not.toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('should call onSwipeStart when swiping begins', () => {
      const onSwipeStart = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeStart }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(20));
      });

      expect(onSwipeStart).toHaveBeenCalled();
    });

    it('should call onSwipeEnd when touch ends', () => {
      const onSwipeEnd = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeEnd }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      act(() => {
        result.current.handlers.onTouchEnd(createTouchEvent(50));
      });

      expect(onSwipeEnd).toHaveBeenCalled();
    });
  });

  describe('progress calculation', () => {
    it('should calculate progress based on threshold', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => 
        useSwipe({ onSwipeUpdate, threshold: 100 })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      expect(onSwipeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 0.5,
        })
      );
    });

    it('should cap progress at 1', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => 
        useSwipe({ onSwipeUpdate, threshold: 50 })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(100));
      });

      expect(onSwipeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 1,
        })
      );
    });
  });

  describe('disabled state', () => {
    it('should not respond to touch events when disabled', () => {
      const onSwipeUpdate = vi.fn();
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() => 
        useSwipe({ onSwipeUpdate, onSwipeRight, disabled: true })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(100));
      });

      act(() => {
        result.current.handlers.onTouchEnd(createTouchEvent(100));
      });

      expect(onSwipeUpdate).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset state when reset is called', () => {
      const onSwipeUpdate = vi.fn();
      const { result } = renderHook(() => useSwipe({ onSwipeUpdate }));

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent(0));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent(50));
      });

      act(() => {
        result.current.reset();
      });

      expect(onSwipeUpdate).toHaveBeenLastCalledWith({
        direction: null,
        deltaX: 0,
        progress: 0,
        isActive: false,
      });
    });
  });
});
