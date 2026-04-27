'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dedupeAffiliationsByTenantId } = require('../providerIdentityMerge');

test('dedupeAffiliationsByTenantId: INACTIVE prevalece sobre ACTIVE (mesmo tenant)', () => {
  const t1 = new Date('2026-04-26T12:00:00Z');
  const t2 = new Date('2026-04-26T18:00:00Z');
  const rows = dedupeAffiliationsByTenantId([
    {
      id: 'a-active',
      tenantId: 'tenant-x',
      tenant: { id: 'tenant-x', name: 'Co' },
      status: 'ACTIVE',
      relationshipType: 'PARTNER',
      updatedAt: t2,
    },
    {
      id: 'b-inactive',
      tenantId: 'tenant-x',
      tenant: { id: 'tenant-x', name: 'Co' },
      status: 'INACTIVE',
      relationshipType: 'PARTNER',
      updatedAt: t1,
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'b-inactive');
  assert.equal(rows[0].status, 'INACTIVE');
});

test('dedupeAffiliationsByTenantId: tenants distintos mantém ambos', () => {
  const now = new Date();
  const rows = dedupeAffiliationsByTenantId([
    { id: '1', tenantId: 't-a', tenant: { id: 't-a' }, status: 'ACTIVE', relationshipType: 'PARTNER', updatedAt: now },
    { id: '2', tenantId: 't-b', tenant: { id: 't-b' }, status: 'ACTIVE', relationshipType: 'DEDICATED', updatedAt: now },
  ]);
  assert.equal(rows.length, 2);
});
