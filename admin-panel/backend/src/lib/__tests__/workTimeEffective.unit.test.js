'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { getWorkTimeEffectiveForUser } = require('../workTime');
const { invalidateAppEffectiveTenantIdCache } = require('../appLoginEffectiveTenant');

const homeT = 'cm_tenant_platform';
const corpT = 'cm_tenant_corp_dedicated';

const fullUserSelect = {
  id: 'u1',
  tenantId: homeT,
  role: 'PROVIDER',
  workTimeTrackingEnabled: true,
  workTimeEnrolledAt: new Date(),
  workTimeBrazilRegime: 'CLT',
  faceEnrollmentPhotos: [{ id: '1', url: 'https://x/p.jpg' }],
  comprefaceRecognitionSync: { status: 'synced' },
  tenant: { locale: { countryCode: 'US' } },
  technicianProfile: {
    faceReenrollmentUntil: null,
    faceReenrollmentNote: null,
  },
};

function buildMockDb(opts) {
  const { withDedicated = true, homeModuleOn = false, corpModuleOn = true } = opts;
  const settingsRow = (tid) => ({
    tenantId: tid,
    moduleEnabled: tid === corpT ? corpModuleOn : homeModuleOn,
    requireFaceOnEveryPunch: true,
    requireGpsOnEveryPunch: true,
    requireResolvedAddress: true,
    maxClockDriftSeconds: 300,
    minGpsAccuracyMeters: null,
    employeeNoticeMarkdown: null,
    consentVersion: null,
  });
  return {
    user: {
      findUnique: async ({ where: { id: _id }, select }) => {
        if (select && select.tenantId && !Object.prototype.hasOwnProperty.call(select, 'role')) {
          return { tenantId: homeT, appAccountId: null };
        }
        return { ...fullUserSelect };
      },
    },
    providerTenantAffiliation: {
      findFirst: async () => (withDedicated ? { tenantId: corpT } : null),
    },
    tenant: {
      findUnique: async ({ where: { id }, select }) => {
        if (id === corpT) {
          if (select && select.locale) {
            return { locale: { countryCode: 'BR' } };
          }
          return { id: corpT, kind: 'COMPANY', status: 'TRIAL' };
        }
        return null;
      },
      /** Usado por `resolveSharedRegistrationTenant` → `isSharedAppRegistrationTenantId` em `getWorkTimeEffectiveForUser`. */
      findFirst: async () => null,
    },
    featureFlag: {
      findFirst: async () => null,
    },
    workTimeSettings: {
      findUnique: async ({ where: { tenantId } }) => settingsRow(tenantId),
      create: async () => assert.fail('create não esperado com findUnique preenchido'),
    },
  };
}

beforeEach(() => {
  invalidateAppEffectiveTenantIdCache('u1');
  process.env.APP_EFFECTIVE_TENANT_CACHE_MS = '0';
});

test('getWorkTimeEffectiveForUser: DEDICATED usa WorkTimeSettings e tenantId da tenant empresa (não da casa)', async () => {
  const db = buildMockDb({ withDedicated: true, homeModuleOn: false, corpModuleOn: true });
  const out = await getWorkTimeEffectiveForUser('u1', db);
  assert.equal(out.ok, true);
  assert.equal(out.tenantId, corpT);
  assert.equal(out.settings.moduleEnabled, true);
  assert.equal(out.showWorkTimeInApp, true);
  assert.equal(out.workTimeBrazilRegime, 'CLT');
});

test('getWorkTimeEffectiveForUser: sem DEDICATED fica na tenant casa', async () => {
  const db = buildMockDb({ withDedicated: false, homeModuleOn: true, corpModuleOn: true });
  const out = await getWorkTimeEffectiveForUser('u1', db);
  assert.equal(out.ok, true);
  assert.equal(out.tenantId, homeT);
  assert.equal(out.settings.moduleEnabled, true);
});

test('getWorkTimeEffectiveForUser: DEDICATED — módulo só na tenant casa ainda permite tab+batidas', async () => {
  const db = buildMockDb({ withDedicated: true, homeModuleOn: true, corpModuleOn: false });
  const out = await getWorkTimeEffectiveForUser('u1', db);
  assert.equal(out.ok, true);
  assert.equal(out.tenantId, corpT);
  assert.equal(out.settings.moduleEnabled, false);
  assert.equal(out.showWorkTimeInApp, true);
  assert.equal(out.canRegisterPunch, true);
});
