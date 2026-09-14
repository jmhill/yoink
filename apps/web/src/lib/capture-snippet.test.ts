import { describe, expect, it } from 'vitest';
import {
  captureSourceKind,
  captureSourceLabel,
  captureSourceLine,
  formatCapturedAt,
} from './capture-snippet';

const now = new Date('2026-09-14T19:00:00.000Z');

describe('captureSourceLabel', () => {
  it('maps known sourceApp values to costume labels', () => {
    expect(captureSourceLabel('browser-extension')).toBe('Chrome');
    expect(captureSourceLabel('android-share')).toBe('Android');
    expect(captureSourceLabel('web')).toBe('typed');
    expect(captureSourceLabel('share')).toBe('share');
  });

  it('passes through unknown sourceApp and omits empty', () => {
    expect(captureSourceLabel('ios-share')).toBe('ios-share');
    expect(captureSourceLabel(undefined)).toBeUndefined();
    expect(captureSourceLabel(null)).toBeUndefined();
    expect(captureSourceLabel('')).toBeUndefined();
  });
});

describe('captureSourceKind', () => {
  it('picks an icon kind for known apps', () => {
    expect(captureSourceKind('browser-extension')).toBe('chrome');
    expect(captureSourceKind('android-share')).toBe('android');
    expect(captureSourceKind('web')).toBe('typed');
    expect(captureSourceKind('share')).toBe('share');
    expect(captureSourceKind('mystery')).toBe('unknown');
    expect(captureSourceKind(undefined)).toBe('unknown');
  });
});

describe('formatCapturedAt', () => {
  it('uses costume relative time, including lowercase just now', () => {
    expect(formatCapturedAt('2026-09-14T18:59:30.000Z', now)).toBe('just now');
    expect(formatCapturedAt('2026-09-14T18:58:00.000Z', now)).toBe('2m ago');
    expect(formatCapturedAt('2026-09-14T18:00:00.000Z', now)).toBe('1h ago');
    expect(formatCapturedAt('2026-09-13T19:00:00.000Z', now)).toBe('1d ago');
  });
});

describe('captureSourceLine', () => {
  it('joins source and time the way the costume reads', () => {
    expect(
      captureSourceLine({
        sourceApp: 'browser-extension',
        capturedAt: '2026-09-14T18:59:50.000Z',
        now,
      })
    ).toBe('Chrome · just now');
    expect(
      captureSourceLine({
        sourceApp: 'android-share',
        capturedAt: '2026-09-14T18:58:00.000Z',
        now,
      })
    ).toBe('Android · 2m ago');
    expect(
      captureSourceLine({
        sourceApp: 'web',
        capturedAt: '2026-09-14T18:50:00.000Z',
        now,
      })
    ).toBe('typed · 10m ago');
  });

  it('shows time only when sourceApp is missing', () => {
    expect(
      captureSourceLine({
        capturedAt: '2026-09-14T18:59:50.000Z',
        now,
      })
    ).toBe('just now');
  });
});
