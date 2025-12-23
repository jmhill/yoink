import { describe, it, expect } from 'vitest';
import { CaptureSchema, CreateCaptureSchema, UpdateCaptureSchema } from './capture.js';

describe('CaptureSchema', () => {
  const validCapture = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    organizationId: '550e8400-e29b-41d4-a716-446655440001',
    createdById: '550e8400-e29b-41d4-a716-446655440002',
    content: 'My captured text',
    status: 'inbox' as const,
    capturedAt: '2025-01-15T10:00:00.000Z',
  };

  it('validates a complete capture', () => {
    const result = CaptureSchema.safeParse(validCapture);

    expect(result.success).toBe(true);
  });

  it('validates capture with optional fields', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      title: 'A title',
      sourceUrl: 'https://example.com/article',
      sourceApp: 'android-share',
      trashedAt: '2025-01-16T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      content: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects content over 10000 characters', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      content: 'a'.repeat(10001),
    });

    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 10000 characters', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      content: 'a'.repeat(10000),
    });

    expect(result.success).toBe(true);
  });

  it('rejects title over 200 characters', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      title: 'a'.repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      status: 'deleted',
    });

    expect(result.success).toBe(false);
  });

  it('validates trashed status', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      status: 'trashed',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for id', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      id: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid URL for sourceUrl', () => {
    const result = CaptureSchema.safeParse({
      ...validCapture,
      sourceUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });
});

describe('CreateCaptureSchema', () => {
  it('validates minimal create request', () => {
    const result = CreateCaptureSchema.safeParse({
      content: 'My captured text',
    });

    expect(result.success).toBe(true);
  });

  it('validates with all optional fields', () => {
    const result = CreateCaptureSchema.safeParse({
      content: 'My captured text',
      title: 'A title',
      sourceUrl: 'https://example.com',
      sourceApp: 'browser-extension',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = CreateCaptureSchema.safeParse({
      content: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const result = CreateCaptureSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('UpdateCaptureSchema', () => {
  it('validates update with title only', () => {
    const result = UpdateCaptureSchema.safeParse({
      title: 'New title',
    });

    expect(result.success).toBe(true);
  });

  it('validates update with content only', () => {
    const result = UpdateCaptureSchema.safeParse({
      content: 'Updated content',
    });

    expect(result.success).toBe(true);
  });

  it('validates update with all content fields', () => {
    const result = UpdateCaptureSchema.safeParse({
      title: 'New title',
      content: 'Updated content',
    });

    expect(result.success).toBe(true);
  });

  it('validates empty update (no changes)', () => {
    const result = UpdateCaptureSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = UpdateCaptureSchema.safeParse({
      content: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects title over 200 characters', () => {
    const result = UpdateCaptureSchema.safeParse({
      title: 'a'.repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it('ignores extra fields (status/pinned now handled by explicit endpoints)', () => {
    // UpdateCaptureSchema only accepts content/title, extra fields are stripped
    const result = UpdateCaptureSchema.safeParse({
      content: 'Valid content',
      status: 'trashed', // This is now handled by /trash endpoint
      pinned: true, // This is now handled by /pin endpoint
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ content: 'Valid content' });
    }
  });
});
