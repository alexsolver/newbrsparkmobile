import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const TARGET_FILES = [
  'admin-panel/users.html',
  'admin-panel/work-time.html',
  'admin-panel/stock-critical.html',
  'admin-panel/js/admin-chat-page.js',
  'admin-panel/js/evaluations-manager.js',
  'admin-panel/js/routine-tasks-page.js',
  'admin-panel/js/technician-applications-page.js',
  'admin-panel/js/user-edit-page.js',
  'app/profile.tsx',
];

const FORBIDDEN_PATTERNS = [
  /sessionStorage\.getItem\('aria_admin_role'\)/,
  /getStoredPanelRole\(/,
  /myRole === 'SAAS_ADMIN'/,
  /myRole === 'TENANT_ADMIN'/,
  /myRole === 'MANAGER'/,
  /role === 'SAAS_ADMIN'/,
  /role === 'TENANT_ADMIN'/,
  /role === 'MANAGER'/,
  /user\?\.role === 'TENANT_ADMIN'/,
  /user\?\.role === 'MANAGER'/,
];

const ALLOWLIST = new Map([
  [
    'admin-panel/js/user-edit-page.js',
    [
      /getStoredPanelRole\(/,
    ],
  ],
  [
    'admin-panel/users.html',
    [
      /sessionStorage\.getItem\('aria_admin_role'\)/,
      /u\.role === 'TENANT_ADMIN'/,
      /u\.role === 'SAAS_ADMIN'/,
      /u\.role === 'MANAGER'/,
    ],
  ],
]);

function main() {
  const violations = [];

  for (const rel of TARGET_FILES) {
    const abs = path.join(root, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const allowed = ALLOWLIST.get(rel) || [];
    const lines = text.split('\n');

    lines.forEach((line, idx) => {
      FORBIDDEN_PATTERNS.forEach((pattern) => {
        if (!pattern.test(line)) return;
        if (allowed.some((ok) => ok.test(line))) return;
        violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
      });
    });
  }

  if (violations.length) {
    console.error('Encontrados usos proibidos de role hardcoded em UX/capability gating:\n');
    violations.forEach((v) => console.error(`- ${v}`));
    process.exit(1);
  }

  console.log('[OK] capability gating regression checks passed');
}

main();
