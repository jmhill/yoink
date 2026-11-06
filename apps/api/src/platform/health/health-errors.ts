export type HealthCheckError = {
  readonly type: 'HEALTH_CHECK_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const healthCheckError = (
  message: string,
  cause?: unknown
): HealthCheckError => ({
  type: 'HEALTH_CHECK_ERROR',
  message,
  cause,
});
