export type InvalidCursorError = {
  readonly type: 'INVALID_CURSOR';
  readonly message: string;
};

export const invalidCursorError = (): InvalidCursorError => ({
  type: 'INVALID_CURSOR',
  message: 'Cursor is invalid',
});
