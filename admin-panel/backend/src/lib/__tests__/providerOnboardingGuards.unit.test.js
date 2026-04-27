'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasActiveDedicatedAffiliation, hasActiveDedicatedAffiliationForAppUser } = require(
  '../providerOnboardingGuards',
);

test('hasActiveDedicatedAffiliation: false sem id', async () => {
  const prisma = {
    providerTenantAffiliation: { count: async () => {
      throw new Error('should not query');
    } },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, ''), false);
});

test('hasActiveDedicatedAffiliation: reflecte count > 0', async () => {
  const prisma = {
    providerTenantAffiliation: {
      count: async ({ where }) => {
        assert.equal(where.providerIdentityId, 'pi1');
        assert.equal(where.relationshipType, 'DEDICATED');
        assert.equal(where.status, 'ACTIVE');
        return 1;
      },
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, 'pi1'), true);
});

test('hasActiveDedicatedAffiliation: false quando count 0', async () => {
  const prisma = {
    providerTenantAffiliation: {
      count: async () => 0,
    },
  };
  assert.equal(await hasActiveDedicatedAffiliation(prisma, 'pi2'), false);
});

test('hasActiveDedicatedAffiliationForAppUser: filtra por userId', async () => {
  const prisma = {
    providerTenantAffiliation: {
      count: async ({ where }) => {
        assert.equal(where.providerIdentity.userId, 'u9');
        return 1;
      },
    },
  };
  assert.equal(await hasActiveDedicatedAffiliationForAppUser(prisma, 'u9'), true);
});
