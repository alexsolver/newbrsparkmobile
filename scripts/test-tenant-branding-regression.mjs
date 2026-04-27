import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  sanitizeTenantBranding,
  buildEffectiveTenantBranding,
  brandingValidationIssues,
} = require('../admin-panel/backend/src/lib/tenantBranding.js');

function run() {
  const permissionsEnabledAll = {
    enabled: true,
    allowLogo: true,
    allowColors: true,
    allowLoginScreen: true,
    allowAppDisplayName: true,
  };

  const permissionsDisabled = {
    enabled: false,
    allowLogo: false,
    allowColors: false,
    allowLoginScreen: false,
    allowAppDisplayName: false,
  };

  const planEnabledAll = { branding: { ...permissionsEnabledAll } };
  const planDisabled = { branding: { ...permissionsDisabled } };

  const sanitized = sanitizeTenantBranding(
    {
      enabled: true,
      appDisplayName: 'Acme Field',
      tagline: 'Precisão no campo',
      primaryColor: '#0f766e',
      accentColor: '#14b8a6',
      secondaryColor: '#334155',
      surfaceColor: '#f8fafc',
      logoLightUrl: 'https://cdn.example.com/light.png',
      logoDarkUrl: '/uploads/branding/dark.png',
      loginBackgroundColor: '#0f1722',
      brandingVersion: 7,
    },
    permissionsEnabledAll,
  );

  assert.equal(sanitized.enabled, true);
  assert.equal(sanitized.primaryColor, '#0F766E');
  assert.equal(sanitized.accentColor, '#14B8A6');
  assert.equal(sanitized.logoDarkUrl, '/uploads/branding/dark.png');
  assert.equal(sanitized.loginBackgroundColor, '#0F1722');
  assert.equal(sanitized.brandingVersion, 7);

  const stripped = sanitizeTenantBranding(
    {
      enabled: true,
      appDisplayName: 'Acme Hidden',
      primaryColor: '#123456',
      logoLightUrl: 'https://cdn.example.com/light.png',
    },
    permissionsDisabled,
  );

  assert.equal(stripped.enabled, false, 'plano sem branding deve forçar enabled=false');
  assert.equal(stripped.appDisplayName, '', 'plano sem permissão de nome não deve manter appDisplayName');
  assert.equal(stripped.primaryColor, '', 'plano sem permissão de cores não deve manter cores');
  assert.equal(stripped.logoLightUrl, '', 'plano sem permissão de logo não deve manter logo');

  const resolved = buildEffectiveTenantBranding({
    tenantName: 'Empresa Demo',
    planFeatures: planEnabledAll,
    tenantFeatures: {
      branding: {
        enabled: true,
        appDisplayName: '',
        tagline: '',
        logoLightUrl: 'https://cdn.example.com/light.png',
        logoDarkUrl: '',
      },
    },
  });

  assert.equal(resolved.permissions.enabled, true);
  assert.equal(resolved.effective.enabled, true);
  assert.equal(
    resolved.effective.appDisplayName,
    'Empresa Demo',
    'quando appDisplayName estiver vazio, deve cair para o nome do tenant',
  );
  assert.equal(
    resolved.effective.logoDarkUrl,
    'https://cdn.example.com/light.png',
    'logoDarkUrl deve cair para logoLightUrl quando ausente',
  );

  const resolvedBlocked = buildEffectiveTenantBranding({
    tenantName: 'Empresa Bloqueada',
    planFeatures: planDisabled,
    tenantFeatures: {
      branding: {
        enabled: true,
        appDisplayName: 'Marca Privada',
        primaryColor: '#123456',
      },
    },
  });

  assert.equal(resolvedBlocked.effective.enabled, false);
  assert.equal(
    resolvedBlocked.effective.appDisplayName,
    'Empresa Bloqueada',
    'sem permissão do plano, a marca salva não deve prevalecer',
  );

  const issuesMissingAssets = brandingValidationIssues(
    { enabled: true, primaryColor: '#0F766E', logoLightUrl: '' },
    permissionsEnabledAll,
  );
  assert.ok(
    issuesMissingAssets.some((msg) => msg.includes('logo')),
    'branding ativo deve reclamar quando não houver logo',
  );

  const issuesMissingColor = brandingValidationIssues(
    { enabled: true, logoLightUrl: 'https://cdn.example.com/light.png', primaryColor: '' },
    permissionsEnabledAll,
  );
  assert.ok(
    issuesMissingColor.some((msg) => msg.includes('cor válida')),
    'branding ativo deve reclamar quando não houver cor válida',
  );

  const noIssues = brandingValidationIssues(
    {
      enabled: true,
      logoLightUrl: 'https://cdn.example.com/light.png',
      primaryColor: '#0F766E',
      appDisplayName: 'Acme',
    },
    permissionsEnabledAll,
  );
  assert.equal(noIssues.length, 0);

  const mirrorCleared = buildEffectiveTenantBranding({
    tenantName: 'Acme Mirror',
    planFeatures: planEnabledAll,
    tenantFeatures: {
      cmsBrandingMirror: { tagline: 'Slogan vindo só do CMS' },
      branding: {
        enabled: true,
        appDisplayName: 'Acme Mirror',
        tagline: '',
        logoLightUrl: 'https://cdn.example.com/light.png',
        primaryColor: '#0F766E',
      },
    },
  });
  assert.equal(
    mirrorCleared.effective.tagline,
    '',
    'tagline vazio no tenant deve limpar o slogan do cmsBrandingMirror',
  );
}

run();
console.log('[OK] tenant branding regression checks passed');
