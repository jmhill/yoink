import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installSafePointerCapture,
  isMissingActivePointerError,
  trySetPointerCapture,
} from './safe-pointer-capture';

const nativeSetPointerCapture = Element.prototype.setPointerCapture;

afterEach(() => {
  Element.prototype.setPointerCapture = nativeSetPointerCapture;
  vi.restoreAllMocks();
});

const missingPointer = () =>
  new DOMException(
    "Failed to execute 'setPointerCapture' on 'Element': No active pointer with the given id is found.",
    'NotFoundError'
  );

describe('isMissingActivePointerError', () => {
  it('recognizes the Chrome NotFoundError from setPointerCapture', () => {
    expect(isMissingActivePointerError(missingPointer())).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(isMissingActivePointerError(new Error('boom'))).toBe(false);
    expect(isMissingActivePointerError(new TypeError('bad pointer id'))).toBe(
      false
    );
  });
});

describe('trySetPointerCapture', () => {
  it('captures when the pointer is still active', () => {
    const setPointerCapture = vi.fn();
    expect(
      trySetPointerCapture({ target: { setPointerCapture }, pointerId: 1 })
    ).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('returns false when there is no target', () => {
    expect(trySetPointerCapture({ target: null, pointerId: 1 })).toBe(false);
  });

  it('returns false when the element cannot capture (jsdom)', () => {
    expect(trySetPointerCapture({ target: {}, pointerId: 1 })).toBe(false);
  });

  it('swallows NotFoundError so synthetic or already-ended pointers do not throw', () => {
    const setPointerCapture = vi.fn(() => {
      throw missingPointer();
    });
    expect(() =>
      trySetPointerCapture({ target: { setPointerCapture }, pointerId: 7 })
    ).not.toThrow();
    expect(
      trySetPointerCapture({ target: { setPointerCapture }, pointerId: 7 })
    ).toBe(false);
  });

  it('rethrows unexpected errors from capture', () => {
    const setPointerCapture = vi.fn(() => {
      throw new Error('disk full');
    });
    expect(() =>
      trySetPointerCapture({ target: { setPointerCapture }, pointerId: 1 })
    ).toThrow('disk full');
  });
});

describe('installSafePointerCapture', () => {
  it('lets library code call setPointerCapture when the pointer is already gone', () => {
    Element.prototype.setPointerCapture = function () {
      throw missingPointer();
    };
    installSafePointerCapture();
    installSafePointerCapture();

    const node = document.createElement('button');
    document.body.append(node);
    expect(() => node.setPointerCapture(1)).not.toThrow();
    node.remove();
  });

  it('still surfaces unexpected capture errors', () => {
    Element.prototype.setPointerCapture = function () {
      throw new Error('disk full');
    };
    installSafePointerCapture();

    const node = document.createElement('button');
    document.body.append(node);
    expect(() => node.setPointerCapture(1)).toThrow('disk full');
    node.remove();
  });
});
