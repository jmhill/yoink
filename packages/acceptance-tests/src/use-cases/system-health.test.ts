import { describeFeature, it, expect } from './harness.js';

describeFeature('System health', ['http', 'playwright'], ({ health }) => {
  it('reports healthy status when system is running', async () => {
    const status = await health.check();

    expect(status.status).toBe('healthy');
  });

  it('reports database as connected', async () => {
    const status = await health.check();

    expect(status.database).toBe('connected');
  });
});
