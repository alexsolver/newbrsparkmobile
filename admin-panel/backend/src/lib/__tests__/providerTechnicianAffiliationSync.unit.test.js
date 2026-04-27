'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listProviderIdentityIdsForUserAppAccount,
  downsyncAffiliationsForSingleUserTechnician,
  reconcileAffiliationsToTechnicianProfilesForAppAccount,
  reconcileCrossTenantPartnerAffiliationsForAppAccount,
  reconcileAffiliationRowsByIds,
  ensureAffiliationRowStatusesMatchTechnicianProfiles,
} = require('../providerTechnicianAffiliationSync');

test('listProviderIdentityIdsForUserAppAccount: sem appAccount devolve PI do userId', async () => {
  const calls = [];
  const client = {
    user: {
      findUnique: async ({ where: { id } }) => {
        calls.push(['user.findUnique', id]);
        if (id === 'u1') return { appAccountId: null };
        return null;
      },
    },
    providerIdentity: {
      findUnique: async ({ where: { userId } }) => {
        calls.push(['pi.findUnique', userId]);
        return userId === 'u1' ? { id: 'pi-a' } : null;
      },
      findMany: async () => assert.fail('findMany não esperado'),
    },
  };
  const ids = await listProviderIdentityIdsForUserAppAccount(client, 'u1');
  assert.deepEqual(ids, ['pi-a']);
  assert.equal(calls.length, 2);
});

test('listProviderIdentityIdsForUserAppAccount: appAccountId null + JWT email resolve AppAccount', async () => {
  const calls = [];
  const client = {
    user: {
      findUnique: async () => ({ appAccountId: null, email: 'ignored@x.com' }),
      findMany: async ({ where: { appAccountId } }) => {
        calls.push(['users', appAccountId]);
        return appAccountId === 'acc-res' ? [{ id: 'u-a' }, { id: 'u-b' }] : [];
      },
    },
    appAccount: {
      findUnique: async ({ where: { emailNorm } }) => {
        calls.push(['appAccount', emailNorm]);
        return emailNorm === 'u@corp.com' ? { id: 'acc-res' } : null;
      },
    },
    providerIdentity: {
      findMany: async ({ where: { userId } }) => {
        const ins = userId.in || [];
        return ins.map((id, i) => ({ id: `pi-${i}` }));
      },
      findUnique: async () => assert.fail('single PI não esperado'),
    },
  };
  const ids = await listProviderIdentityIdsForUserAppAccount(client, 'u1', 'u@corp.com');
  assert.deepEqual(ids, ['pi-0', 'pi-1']);
  assert.ok(calls.some((c) => c[0] === 'appAccount'));
});

test('downsyncAffiliationsForSingleUserTechnician: INACTIVE faz updateMany só dessa PI', async () => {
  let updatePayload;
  const client = {
    providerIdentity: {
      findUnique: async ({ where: { userId } }) => {
        return userId === 'u9' ? { id: 'pi-x' } : null;
      },
    },
    providerTenantAffiliation: {
      updateMany: async ({ where, data }) => {
        updatePayload = { where, data };
        return { count: 2 };
      },
    },
  };
  const r = await downsyncAffiliationsForSingleUserTechnician(client, 'u9', 'INACTIVE');
  assert.equal(r.ok, true);
  assert.equal(r.updated, 2);
  assert.equal(updatePayload.where.providerIdentityId, 'pi-x');
  assert.deepEqual(updatePayload.where.status.in, ['ACTIVE', 'SUSPENDED', 'REQUESTED']);
  assert.equal(updatePayload.data.status, 'INACTIVE');
  assert.ok(updatePayload.data.endedAt instanceof Date);
  assert.equal(updatePayload.data.suspendedAt, null);
});

test('downsyncAffiliationsForSingleUserTechnician: SUSPENDED define suspendedAt', async () => {
  let data;
  const client = {
    providerIdentity: { findUnique: async () => ({ id: 'p1' }) },
    providerTenantAffiliation: {
      updateMany: async ({ data: d }) => {
        data = d;
        return { count: 1 };
      },
    },
  };
  await downsyncAffiliationsForSingleUserTechnician(client, 'u1', 'SUSPENDED');
  assert.equal(data.status, 'SUSPENDED');
  assert.ok(data.suspendedAt instanceof Date);
});

test('downsyncAffiliationsForSingleUserTechnician: ACTIVE não altera', async () => {
  const client = {
    providerIdentity: {
      findUnique: async () => assert.fail('não deve consultar PI'),
    },
    providerTenantAffiliation: {
      updateMany: async () => assert.fail('não deve atualizar'),
    },
  };
  const r = await downsyncAffiliationsForSingleUserTechnician(client, 'u1', 'ACTIVE');
  assert.equal(r.skipped, 'technician_active');
});

test('reconcileAffiliationsToTechnicianProfilesForAppAccount: por PI — só afiliações do User INACTIVE', async () => {
  const updatedPiIds = [];
  const client = {
    user: {
      findUnique: async ({ where: { id } }) => {
        return id === 'sess' ? { appAccountId: null } : null;
      },
    },
    providerIdentity: {
      findUnique: async ({ where }) => {
        if (where.userId === 'sess') return { id: 'pi-sess' };
        if (where.id === 'pi-sess') return { userId: 'sess' };
        return null;
      },
      findMany: async () => assert.fail('findMany não esperado'),
    },
    technicianProfile: {
      findUnique: async ({ where: { userId } }) => {
        return userId === 'sess' ? { status: 'INACTIVE' } : null;
      },
    },
    providerTenantAffiliation: {
      updateMany: async ({ where }) => {
        updatedPiIds.push(where.providerIdentityId);
        return { count: 1 };
      },
    },
  };
  const r = await reconcileAffiliationsToTechnicianProfilesForAppAccount(client, 'sess');
  assert.equal(r.updated, 1);
  assert.deepEqual(updatedPiIds, ['pi-sess']);
});

test('reconcileCrossTenantPartnerAffiliations: PI do Lan + tenant BrSpark usa técnico do User BrSpark', async () => {
  let lastWhereId;
  const client = {
    user: {
      findUnique: async ({ where: { id } }) => {
        return id === 'sess' ? { appAccountId: 'acc1' } : null;
      },
      findMany: async () => [
        { id: 'u-lan', tenantId: 'ten-lan' },
        { id: 'u-brs', tenantId: 'ten-brs' },
      ],
    },
    providerTenantAffiliation: {
      findMany: async () => [
        {
          id: 'aff-cross',
          tenantId: 'ten-brs',
          providerIdentityId: 'pi-lan',
        },
      ],
    },
    providerIdentity: {
      findMany: async () => [{ id: 'pi-lan', userId: 'u-lan' }],
    },
    technicianProfile: {
      findUnique: async ({ where: { userId } }) => {
        if (userId === 'u-brs') return { status: 'INACTIVE' };
        return { status: 'ACTIVE' };
      },
    },
  };
  client.providerTenantAffiliation.updateMany = async ({ where, data }) => {
    lastWhereId = where.id;
    assert.equal(data.status, 'INACTIVE');
    return { count: 1 };
  };

  const n = await reconcileCrossTenantPartnerAffiliationsForAppAccount(client, 'sess', ['pi-lan']);
  assert.equal(n, 1);
  assert.equal(lastWhereId, 'aff-cross');
});

test('reconcileAffiliationRowsByIds: cross-tenant por id', async () => {
  let updatedId;
  const client = {
    appAccount: {
      findUnique: async () => ({ id: 'acc1' }),
    },
    user: {
      findUnique: async ({ where: { id } }) => {
        if (id === 'sess') return { appAccountId: null, email: 'x@test.com' };
        if (id === 'u1') return { isActive: true };
        return null;
      },
      findMany: async () => [
        { id: 'u1', tenantId: 't-brs' },
        { id: 'u2', tenantId: 't-lan' },
      ],
    },
    providerTenantAffiliation: {
      findUnique: async () => ({
        id: 'a1',
        tenantId: 't-brs',
        providerIdentityId: 'pi1',
        status: 'ACTIVE',
        relationshipType: 'PARTNER',
      }),
      updateMany: async ({ where }) => {
        updatedId = where.id;
        return { count: 1 };
      },
    },
    providerIdentity: {
      findUnique: async () => ({ userId: 'u2' }),
    },
    technicianProfile: {
      findUnique: async ({ where: { userId } }) =>
        userId === 'u1' ? { status: 'INACTIVE' } : { status: 'ACTIVE' },
    },
  };
  const r = await reconcileAffiliationRowsByIds(client, ['a1'], 'sess', 'x@test.com');
  assert.equal(r.updated, 1);
  assert.equal(updatedId, 'a1');
});

test('ensureAffiliationRowStatusesMatchTechnicianProfiles: User inativo força INACTIVE com técnico ACTIVE', async () => {
  let persisted;
  const client = {
    user: {
      findUnique: async ({ where: { id } }) =>
        id === 'sess' ? { appAccountId: null, email: 'x@y.com' } : null,
      findMany: async () => [{ id: 'u1', isActive: false }],
    },
    appAccount: { findUnique: async () => null },
    providerIdentity: {
      findMany: async () => [{ id: 'pi1', userId: 'u1' }],
    },
    technicianProfile: {
      findMany: async () => [{ userId: 'u1', status: 'ACTIVE' }],
    },
    providerTenantAffiliation: {
      update: async ({ data }) => {
        persisted = data;
        return {};
      },
    },
    $transaction: async (ops) => {
      for (const op of ops) await op;
    },
  };
  const rows = [
    {
      id: 'aff1',
      providerIdentityId: 'pi1',
      tenantId: 't1',
      status: 'ACTIVE',
      relationshipType: 'PARTNER',
    },
  ];
  const r = await ensureAffiliationRowStatusesMatchTechnicianProfiles(client, rows, 'sess', '');
  assert.equal(r.rows[0].status, 'INACTIVE');
  assert.equal(persisted?.status, 'INACTIVE');
});