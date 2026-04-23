#!/usr/bin/env node
/**
 * Verifica o que a API devolve em POST /api/login (igual ao app na App Store
 * quando EXPO_PUBLIC_API_BASE aponta para o mesmo host).
 *
 * Uso:
 *   BRSPARK_CHECK_EMAIL='tu@email.com' BRSPARK_CHECK_PASSWORD='***' node scripts/check-production-login-branding.mjs
 *
 * Opcional:
 *   BRSPARK_API_BASE=https://api.brspark.com   (default)
 *   BRSPARK_CHECK_TENANT_ID=...               (obrigatório se a API devolver 409 MULTIPLE_ACCOUNTS)
 */
const base = String(
  process.env.BRSPARK_API_BASE || process.env.EXPO_PUBLIC_API_BASE || 'https://api.brspark.com',
)
  .trim()
  .replace(/\/+$/, '');
const email = String(process.env.BRSPARK_CHECK_EMAIL || '').trim();
const password = String(process.env.BRSPARK_CHECK_PASSWORD || '');
const tenantIdPick = String(process.env.BRSPARK_CHECK_TENANT_ID || '').trim();

if (!email || !password) {
  console.error(
    'Defina BRSPARK_CHECK_EMAIL e BRSPARK_CHECK_PASSWORD (e opcionalmente BRSPARK_API_BASE).\n' +
      'Exemplo:\n' +
      "  BRSPARK_CHECK_EMAIL='tu@email.com' BRSPARK_CHECK_PASSWORD='***' node scripts/check-production-login-branding.mjs",
  );
  process.exit(1);
}

const url = `${base}/api/login`;
const body = {
  email: email.toLowerCase(),
  password,
  deviceId: 'cli-branding-check',
  ...(tenantIdPick ? { tenantId: tenantIdPick } : {}),
};
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error('Resposta não-JSON', res.status, text.slice(0, 500));
  process.exit(1);
}

console.log('URL:', url);
console.log('HTTP:', res.status);
if (!res.ok) {
  console.log('Corpo:', JSON.stringify(json, null, 2));
  if (res.status === 409 && json?.code === 'MULTIPLE_ACCOUNTS') {
    console.error(
      '\nRepete com BRSPARK_CHECK_TENANT_ID=<id> (um dos "id" em tenants acima).\n' +
        'Ex.: BRSPARK_CHECK_TENANT_ID=cmo584eut00owk5uvpoa12djc ... node scripts/check-production-login-branding.mjs',
    );
  }
  process.exit(res.status === 401 || res.status === 403 ? 2 : 1);
}

const branding = json.user?.tenant?.branding;
console.log('\n--- user.tenant (resumo) ---');
console.log(
  JSON.stringify(
    {
      id: json.user?.tenant?.id,
      name: json.user?.tenant?.name,
      ownerName: json.user?.tenant?.ownerName,
    },
    null,
    2,
  ),
);
console.log('\n--- user.tenant.branding (o app só aplica cores/logo se enabled === true) ---');
console.log(JSON.stringify(branding, null, 2));
