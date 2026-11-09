import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { TokenRouteResult } from '@yoink/acceptance-testing';

const SESSION_REFUSED =
  'API tokens cannot create, reissue, or revoke tokens; sign in to the web app.';

const SURFACES = ['v1', 'alias'] as const;

type CreatedToken = {
  id: string;
  name: string;
  createdAt: string;
  rawToken: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const messageOf = (body: unknown): string =>
  isRecord(body) && typeof body.message === 'string' ? body.message : '';

const createdFrom = (result: TokenRouteResult): CreatedToken => {
  expect(result.statusCode).toBe(201);
  const body = result.body;
  if (!isRecord(body) || !isRecord(body.token) || typeof body.rawToken !== 'string') {
    throw new Error(`Token create body was ${JSON.stringify(body)}`);
  }
  const { id, name, createdAt } = body.token;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string') {
    throw new Error(`Token create metadata was ${JSON.stringify(body.token)}`);
  }
  return { id, name, createdAt, rawToken: body.rawToken };
};

const secretOf = (rawToken: string): string => rawToken.slice(rawToken.indexOf(':') + 1);

const listedFrom = (result: TokenRouteResult): Record<string, unknown>[] => {
  expect(result.statusCode).toBe(200);
  if (!isRecord(result.body) || !Array.isArray(result.body.tokens)) {
    throw new Error(`Token list body was ${JSON.stringify(result.body)}`);
  }
  expect(Object.keys(result.body)).toEqual(['tokens']);
  return result.body.tokens.map((token) => {
    if (!isRecord(token)) throw new Error(`Token row was ${JSON.stringify(token)}`);
    return token;
  });
};

const allowedKeys = (token: Record<string, unknown>): string[] =>
  token.lastUsedAt === undefined
    ? ['createdAt', 'id', 'name']
    : ['createdAt', 'id', 'lastUsedAt', 'name'];

const expectMetadata = (
  tokens: readonly Record<string, unknown>[],
  included: readonly CreatedToken[],
  excludedIds: readonly string[],
  secrets: readonly string[]
) => {
  const byCreated = [...included].sort((left, right) =>
    left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0
  );
  expect(tokens.map((token) => token.id)).toEqual(byCreated.map((token) => token.id));
  for (const token of tokens) {
    expect(Object.keys(token).sort()).toEqual(allowedKeys(token));
    const source = included.find((item) => item.id === token.id);
    expect(token.name).toBe(source?.name);
    expect(token.createdAt).toBe(source?.createdAt);
    if (token.lastUsedAt !== undefined) {
      expect(token.lastUsedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/));
    }
  }
  const serialized = JSON.stringify(tokens);
  for (const id of excludedIds) expect(serialized).not.toContain(id);
  for (const secret of secrets) {
    expect(secret.length).toBeGreaterThan(0);
    expect(serialized).not.toContain(secret);
  }
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Integration token list on bearer [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('lists only that principal and a sibling on v1 and the alias', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await ctx.admin.createOrganization(`token-list-${suffix}`);
      const owner = await ctx.admin.createUser(org.id, `owner-${suffix}@example.com`, {
        role: 'admin',
        name: 'Owner',
      });
      const primaryCreated = await ctx.admin.createToken(org.id, owner.id, 'Primary');
      const siblingCreated = await ctx.admin.createToken(org.id, owner.id, 'Sibling');
      const doomedCreated = await ctx.admin.createToken(org.id, owner.id, 'Doomed');
      await ctx.admin.revokeToken(doomedCreated.token.id);
      const coworker = await ctx.admin.createUser(org.id, `coworker-${suffix}@example.com`, {
        role: 'member',
        name: 'Coworker',
      });
      const coworkerToken = await ctx.admin.createToken(org.id, coworker.id, 'Coworker');
      const otherOrg = await ctx.admin.createOrganization(`token-list-other-${suffix}`);
      const outsider = await ctx.admin.createUser(otherOrg.id, `outsider-${suffix}@example.com`, {
        role: 'member',
        name: 'Outsider',
      });
      const outsiderToken = await ctx.admin.createToken(otherOrg.id, outsider.id, 'Outsider');

      const primary: CreatedToken = {
        id: primaryCreated.token.id,
        name: 'Primary',
        createdAt: primaryCreated.token.createdAt,
        rawToken: primaryCreated.rawToken,
      };
      const sibling: CreatedToken = {
        id: siblingCreated.token.id,
        name: 'Sibling',
        createdAt: siblingCreated.token.createdAt,
        rawToken: siblingCreated.rawToken,
      };
      const alice = ctx.createActorWithCredentials({
        email: owner.email,
        userId: owner.id,
        organizationId: org.id,
        token: primary.rawToken,
      });
      const secrets = [
        primary.rawToken,
        sibling.rawToken,
        doomedCreated.rawToken,
        coworkerToken.rawToken,
        outsiderToken.rawToken,
        secretOf(primary.rawToken),
        secretOf(sibling.rawToken),
        secretOf(doomedCreated.rawToken),
        secretOf(coworkerToken.rawToken),
        secretOf(outsiderToken.rawToken),
      ];
      const excluded = [doomedCreated.token.id, coworkerToken.token.id, outsiderToken.token.id];

      const warmed = await alice.callTokenRoute({
        action: 'list',
        surface: 'v1',
        authorization: 'bearer',
        rawToken: sibling.rawToken,
      });
      expect(warmed.statusCode).toBe(200);

      for (const surface of SURFACES) {
        const listed = listedFrom(
          await alice.callTokenRoute({ action: 'list', surface, authorization: 'bearer' })
        );
        expectMetadata(listed, [primary, sibling], excluded, secrets);
        expect(listed.find((token) => token.id === sibling.id)?.lastUsedAt).toEqual(
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
        );
      }

      const bearerCreate = await alice.callTokenRoute({
        action: 'create',
        surface: 'alias',
        authorization: 'bearer',
        name: 'Nope',
      });
      expect(bearerCreate.statusCode).toBe(403);
      expect(messageOf(bearerCreate.body)).toBe(SESSION_REFUSED);

      const bearerRevoke = await alice.callTokenRoute({
        action: 'revoke',
        surface: 'alias',
        authorization: 'bearer',
        tokenId: sibling.id,
      });
      expect(bearerRevoke.statusCode).toBe(403);
      expect(messageOf(bearerRevoke.body)).toBe(SESSION_REFUSED);

      for (const surface of SURFACES) {
        if (surface === 'alias') continue;
        const versionedCreate = await alice.callTokenRoute({
          action: 'create',
          surface,
          authorization: 'bearer',
          name: 'Nope',
        });
        expect(versionedCreate.statusCode).toBe(404);
        const versionedRevoke = await alice.callTokenRoute({
          action: 'revoke',
          surface,
          authorization: 'bearer',
          tokenId: sibling.id,
        });
        expect(versionedRevoke.statusCode).toBe(404);
      }

      // HTTP actors authenticate with a bearer token. Minting is session-only,
      // so this driver provisions the agent through the admin API, the same
      // path createActor uses. The bearer reissue below is the pin.
      const agentUser = await ctx.admin.createUser(org.id, `lane-${suffix}@example.com`, {
        role: 'member',
        kind: 'agent',
        name: 'Lane',
      });
      const agentToken = await ctx.admin.createToken(org.id, agentUser.id, 'Lane');
      const bearerReissue = await alice.callTokenRoute({
        action: 'reissue',
        surface: 'alias',
        authorization: 'bearer',
        memberUserId: agentUser.id,
      });
      expect(bearerReissue.statusCode).toBe(403);
      expect(messageOf(bearerReissue.body)).toBe(SESSION_REFUSED);
      const versionedReissue = await alice.callTokenRoute({
        action: 'reissue',
        surface: 'v1',
        authorization: 'bearer',
        memberUserId: agentUser.id,
      });
      expect(versionedReissue.statusCode).toBe(404);

      const agentList = listedFrom(
        await alice.callTokenRoute({
          action: 'list',
          surface: 'alias',
          authorization: 'bearer',
          rawToken: agentToken.rawToken,
        })
      );
      expect(agentList.map((token) => token.id)).toEqual([agentToken.token.id]);
      expect(JSON.stringify(agentList)).not.toContain(primary.id);
      expect(JSON.stringify(agentList)).not.toContain(secretOf(agentToken.rawToken));

      const stillThere = listedFrom(
        await alice.callTokenRoute({ action: 'list', surface: 'v1', authorization: 'bearer' })
      );
      expect(stillThere.map((token) => token.id)).toContain(sibling.id);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Integration token list on a browser session [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('accepts the session on the alias, refuses it on v1, and keeps writes session-only', async () => {
      const alice = await ctx.createActor('alice-token-list-session@example.com');
      // Signup leaves the session on the personal workspace. The invited org is
      // where the coworker and the reissue target live, so switch before writing.
      await alice.switchOrganization(alice.organizationId);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const sessionOnV1 = await alice.callTokenRoute({
        action: 'list',
        surface: 'v1',
        authorization: 'session',
      });
      expect(sessionOnV1.statusCode).toBe(401);
      expect(messageOf(sessionOnV1.body)).toBe('Missing authorization header');

      const doomed = createdFrom(
        await alice.callTokenRoute({
          action: 'create',
          surface: 'alias',
          authorization: 'session',
          name: 'Doomed',
        })
      );
      const revoked = await alice.callTokenRoute({
        action: 'revoke',
        surface: 'alias',
        authorization: 'session',
        tokenId: doomed.id,
      });
      expect(revoked.statusCode).toBe(200);

      const primary = createdFrom(
        await alice.callTokenRoute({
          action: 'create',
          surface: 'alias',
          authorization: 'session',
          name: 'Primary',
        })
      );
      const sibling = createdFrom(
        await alice.callTokenRoute({
          action: 'create',
          surface: 'alias',
          authorization: 'session',
          name: 'Sibling',
        })
      );
      const third = await alice.callTokenRoute({
        action: 'create',
        surface: 'alias',
        authorization: 'session',
        name: 'Third',
      });
      expect(third.statusCode).toBe(409);
      expect(messageOf(third.body)).toContain('at most 2');

      const bearerCreate = await alice.callTokenRoute({
        action: 'create',
        surface: 'alias',
        authorization: 'bearer',
        rawToken: primary.rawToken,
        name: 'Nope',
      });
      expect(bearerCreate.statusCode).toBe(403);
      expect(messageOf(bearerCreate.body)).toBe(SESSION_REFUSED);

      const coworker = await ctx.admin.createUser(alice.organizationId, `coworker-${suffix}@example.com`, {
        role: 'member',
        name: 'Coworker',
      });
      const coworkerToken = await ctx.admin.createToken(alice.organizationId, coworker.id, 'Coworker');
      const otherOrg = await ctx.admin.createOrganization(`token-list-other-${suffix}`);
      const outsider = await ctx.admin.createUser(otherOrg.id, `outsider-${suffix}@example.com`, {
        role: 'member',
        name: 'Outsider',
      });
      const outsiderToken = await ctx.admin.createToken(otherOrg.id, outsider.id, 'Outsider');
      const excluded = [doomed.id, coworkerToken.token.id, outsiderToken.token.id];
      const secrets = [
        primary.rawToken,
        sibling.rawToken,
        doomed.rawToken,
        coworkerToken.rawToken,
        outsiderToken.rawToken,
        secretOf(primary.rawToken),
        secretOf(sibling.rawToken),
        secretOf(doomed.rawToken),
        secretOf(coworkerToken.rawToken),
        secretOf(outsiderToken.rawToken),
      ];

      expect(
        (
          await alice.callTokenRoute({
            action: 'list',
            surface: 'v1',
            authorization: 'bearer',
            rawToken: sibling.rawToken,
          })
        ).statusCode
      ).toBe(200);

      const sessionAlias = listedFrom(
        await alice.callTokenRoute({ action: 'list', surface: 'alias', authorization: 'session' })
      );
      expectMetadata(sessionAlias, [primary, sibling], excluded, secrets);
      expect(sessionAlias.find((token) => token.id === sibling.id)?.lastUsedAt).toEqual(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
      );

      for (const surface of SURFACES) {
        const bearerList = listedFrom(
          await alice.callTokenRoute({
            action: 'list',
            surface,
            authorization: 'bearer',
            rawToken: primary.rawToken,
          })
        );
        expectMetadata(bearerList, [primary, sibling], excluded, secrets);
        expect(bearerList.find((token) => token.id === sibling.id)?.lastUsedAt).toEqual(
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
        );
      }

      const sessionStillRefused = await alice.callTokenRoute({
        action: 'list',
        surface: 'v1',
        authorization: 'session',
      });
      expect(sessionStillRefused.statusCode).toBe(401);
      expect(messageOf(sessionStillRefused.body)).toBe('Missing authorization header');

      const bearerRevoke = await alice.callTokenRoute({
        action: 'revoke',
        surface: 'alias',
        authorization: 'bearer',
        rawToken: primary.rawToken,
        tokenId: sibling.id,
      });
      expect(bearerRevoke.statusCode).toBe(403);
      expect(messageOf(bearerRevoke.body)).toBe(SESSION_REFUSED);

      for (const authorization of ['session', 'bearer'] as const) {
        const versionedCreate = await alice.callTokenRoute({
          action: 'create',
          surface: 'v1',
          authorization,
          rawToken: authorization === 'bearer' ? primary.rawToken : undefined,
          name: 'Nope',
        });
        expect(versionedCreate.statusCode).toBe(404);
        const versionedRevoke = await alice.callTokenRoute({
          action: 'revoke',
          surface: 'v1',
          authorization,
          rawToken: authorization === 'bearer' ? primary.rawToken : undefined,
          tokenId: sibling.id,
        });
        expect(versionedRevoke.statusCode).toBe(404);
      }

      const minted = await alice.mintAgent('Lane');
      const bearerReissue = await alice.callTokenRoute({
        action: 'reissue',
        surface: 'alias',
        authorization: 'bearer',
        rawToken: primary.rawToken,
        memberUserId: minted.agent.userId,
      });
      expect(bearerReissue.statusCode).toBe(403);
      expect(messageOf(bearerReissue.body)).toBe(SESSION_REFUSED);
      for (const authorization of ['session', 'bearer'] as const) {
        const versionedReissue = await alice.callTokenRoute({
          action: 'reissue',
          surface: 'v1',
          authorization,
          rawToken: authorization === 'bearer' ? primary.rawToken : undefined,
          memberUserId: minted.agent.userId,
        });
        expect(versionedReissue.statusCode).toBe(404);
      }

      const reissued = createdFrom(
        await alice.callTokenRoute({
          action: 'reissue',
          surface: 'alias',
          authorization: 'session',
          memberUserId: minted.agent.userId,
        })
      );
      const oldAgent = await alice.callTokenRoute({
        action: 'list',
        surface: 'v1',
        authorization: 'bearer',
        rawToken: minted.rawToken,
      });
      expect(oldAgent.statusCode).toBe(401);
      const newAgent = listedFrom(
        await alice.callTokenRoute({
          action: 'list',
          surface: 'alias',
          authorization: 'bearer',
          rawToken: reissued.rawToken,
        })
      );
      expect(newAgent.map((token) => token.id)).toEqual([reissued.id]);
      expect(JSON.stringify(newAgent)).not.toContain(secretOf(reissued.rawToken));
      expect(JSON.stringify(newAgent)).not.toContain(primary.id);

      const humanAfter = listedFrom(
        await alice.callTokenRoute({ action: 'list', surface: 'alias', authorization: 'session' })
      );
      expect(humanAfter.map((token) => token.id)).toEqual(
        expect.arrayContaining([primary.id, sibling.id])
      );
      expect(humanAfter.map((token) => token.id)).not.toContain(reissued.id);
    }, 120_000);
  });
});
