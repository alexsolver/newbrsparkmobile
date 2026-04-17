import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const root = process.cwd();
  const file = path.join(root, 'docs/spec/multitenancy-scope-matrix.md');
  const raw = await fs.readFile(file, 'utf8');

  const requiredSnippets = [
    'platform',
    'network',
    'tenant',
    'public',
    'GET /api/tenants',
    'GET /api/users',
    'GET /api/operations/tasks',
    'GET /api/technician-registration',
    'app/provider-services/[tenantId].tsx',
  ];

  const missing = requiredSnippets.filter((snippet) => !raw.includes(snippet));
  if (missing.length) {
    throw new Error(`Matriz de escopos incompleta. Ausentes: ${missing.join(', ')}`);
  }

  console.log('OK: matriz de escopos contém os escopos e endpoints mínimos esperados.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
