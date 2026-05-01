'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasActiveDedicatedAffiliation, hasActiveDedicatedAffiliationForAppUser } = require(
  '../providerOnboardingGuards',
);

test('hasActiveDedicatedAffiliation: false sem id', async () => {
  const prisma = {
    providerTenantAffiliation: {
      findMany: async () => {
        throw new Error('should not query');
      },
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, ''), false);
});

test('hasActiveDedicatedAffiliation: true com DEDICATED noutra empresa', async () => {
  const sharedId = 'pool-tenant-1';
  const prisma = {
    tenant: {
      findUnique: async ({ where }) => {
        if (where.id === 'company-99') return { slug: 'acme', kind: 'COMPANY' };
        return null;
      },
      findFirst: async () => ({ id: sharedId, kind: 'COMPANY', slug: 'master', name: 'App' }),
    },
    providerTenantAffiliation: {
      findMany: async ({ where }) => {
        assert.equal(where.providerIdentityId, 'pi1');
        assert.equal(where.relationshipType, 'DEDICATED');
        assert.equal(where.status, 'ACTIVE');
        return [{ tenantId: 'company-99' }];
      },
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, 'pi1'), true);
});

test('hasActiveDedicatedAffiliation: false quando só DEDICATED na piscina de registo', async () => {
  const sharedId = 'pool-tenant-1';
  const prisma = {
    tenant: {
      findUnique: async () => null,
      findFirst: async () => ({ id: sharedId, kind: 'COMPANY', slug: 'master', name: 'App' }),
    },
    providerTenantAffiliation: {
      findMany: async () => [{ tenantId: sharedId }],
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, 'pi1'), false);
});

test('hasActiveDedicatedAffiliation: false quando lista vazia', async () => {
  const prisma = {
    tenant: {
      findUnique: async () => null,
      findFirst: async () => ({ id: 'pool-1', kind: 'COMPANY', slug: 'master', name: 'App' }),
    },
    providerTenantAffiliation: {
      findMany: async () => [],
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, 'pi2'), false);
});

test('hasActiveDedicatedAffiliationForAppUser: true com DEDICATED noutra empresa', async () => {
  const sharedId = 'pool-tenant-1';
  const prisma = {
    tenant: {
      findUnique: async ({ where }) => {
        if (where.id === 'company-99') return { slug: 'acme', kind: 'COMPANY' };
        return null;
      },
      findFirst: async () => ({ id: sharedId, kind: 'COMPANY', slug: 'master', name: 'App' }),
    },
    providerTenantAffiliation: {
      findMany: async ({ where }) => {
        assert.equal(where.providerIdentity.userId, 'u9');
        return [{ tenantId: 'company-99' }];
      },
    },
  };
  assert.equal(await hasActiveDedicatedAffiliationForAppUser(prisma, 'u9'), true);
});

test('hasActiveDedicatedAffiliationForAppUser: false quando só DEDICATED na piscina de registo', async () => {
  const sharedId = 'pool-tenant-1';
  const prisma = {
    tenant: {
      findUnique: async () => null,
      findFirst: async () => ({ id: sharedId, kind: 'COMPANY', slug: 'master', name: 'App' }),
    },
    providerTenantAffiliation: {
      findMany: async () => [{ tenantId: sharedId }],
    },
  };
  assert.equal(await hasActiveDedicatedAffiliationForAppUser(prisma, 'u1'), false);
});
