export type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
};

export type HealthChecker = {
  check(): Promise<HealthStatus>;
};
