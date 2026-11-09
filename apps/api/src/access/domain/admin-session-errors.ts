export type InvalidAdminPasswordError = {
  readonly type: 'INVALID_ADMIN_PASSWORD';
};

export type InvalidAdminSessionError = {
  readonly type: 'INVALID_ADMIN_SESSION';
};

export type ExpiredAdminSessionError = {
  readonly type: 'EXPIRED_ADMIN_SESSION';
};

export type AdminSessionDecisionError =
  | InvalidAdminPasswordError
  | InvalidAdminSessionError
  | ExpiredAdminSessionError;

export const invalidAdminPasswordError = (): InvalidAdminPasswordError => ({
  type: 'INVALID_ADMIN_PASSWORD',
});

export const invalidAdminSessionError = (): InvalidAdminSessionError => ({
  type: 'INVALID_ADMIN_SESSION',
});

export const expiredAdminSessionError = (): ExpiredAdminSessionError => ({
  type: 'EXPIRED_ADMIN_SESSION',
});
