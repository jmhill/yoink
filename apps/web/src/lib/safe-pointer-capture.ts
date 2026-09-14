const SAFE_POINTER_CAPTURE = Symbol.for('yoink.safePointerCapture');

type PointerCaptureTarget = {
  setPointerCapture?: (pointerId: number) => void;
};

type MarkedSetPointerCapture = ((
  this: Element,
  pointerId: number
) => void) & {
  [SAFE_POINTER_CAPTURE]?: boolean;
};

/**
 * Chrome throws NotFoundError (DOMException code 8) when the pointer
 * id is not in the active set — synthetic Playwright pointerdown,
 * a gesture that already ended, or a lost touch. That is expected.
 */
export function isMissingActivePointerError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'NotFoundError';
  }
  return error instanceof Error && error.name === 'NotFoundError';
}

/**
 * Capture the pointer so a one-pile drag keeps receiving moves after
 * the cursor leaves the grip. Returns false when the pointer is already
 * gone; callers still start the drag from the pointerdown coordinates.
 */
export function trySetPointerCapture(params: {
  target: PointerCaptureTarget | null | undefined;
  pointerId: number;
}): boolean {
  const { target, pointerId } = params;
  if (!target || typeof target.setPointerCapture !== 'function') {
    return false;
  }
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch (error) {
    if (isMissingActivePointerError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Vaul (mobile Tasks rail) and other kit primitives call
 * `setPointerCapture` on pointerdown. Wrap the native method so a
 * missing pointer cannot surface as an uncaught exception — one guard
 * for our grip handle and those library call sites.
 */
export function installSafePointerCapture(): void {
  if (typeof Element === 'undefined') {
    return;
  }
  const original = Element.prototype.setPointerCapture as MarkedSetPointerCapture;
  if (typeof original !== 'function' || original[SAFE_POINTER_CAPTURE]) {
    return;
  }
  const wrapped: MarkedSetPointerCapture = function setPointerCapture(
    this: Element,
    pointerId: number
  ): void {
    trySetPointerCapture({
      target: { setPointerCapture: original.bind(this) },
      pointerId,
    });
  };
  wrapped[SAFE_POINTER_CAPTURE] = true;
  Element.prototype.setPointerCapture = wrapped;
}
