import { usingDrivers, describe, it, expect } from '@yoink/acceptance-testing';

usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`System health [${ctx.driverName}]`, () => {
    it('reports healthy status when system is running', async () => {
      const status = await ctx.health.check();

      expect(status.status).toBe('healthy');
    });

    it('reports database as connected', async () => {
      const status = await ctx.health.check();

      expect(status.database).toBe('connected');
    });
  });
});
