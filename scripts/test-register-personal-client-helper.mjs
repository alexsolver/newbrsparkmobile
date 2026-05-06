/**
 * Regressão leve: formato do e-mail sintético da tenant CLIENT em `registerPersonalClientTenant.js`.
 * Não requer base de dados.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { syntheticTenantOwnerEmailForClientSpace } = require('../admin-panel/backend/src/lib/registerPersonalClientTenant.js');

function run() {
  const a = syntheticTenantOwnerEmailForClientSpace('maria.silva@exemplo.com');
  assert.match(a, /^maria\.silva\+aria\.cliente\./, 'deve usar plus-addressing com prefixo cliente');
  assert.match(a, /@exemplo\.com$/i, 'deve preservar o domínio do utilizador');

  const b = syntheticTenantOwnerEmailForClientSpace('invalid-no-at');
  assert.ok(b.includes('@'), 'fallback sem @ no input deve ainda produzir e-mail com @');
  assert.ok(b.endsWith('@aria.internal.invalid'), 'fallback sem @ deve usar domínio interno');

  const two = new Set();
  for (let i = 0; i < 20; i++) {
    two.add(syntheticTenantOwnerEmailForClientSpace('a@b.co'));
  }
  assert.equal(two.size, 20, 'sequências aleatórias devem colidir raramente (20 únicos)');

  console.log('[OK] test-register-personal-client-helper');
}

run();
