import { spawn } from 'node:child_process';

const TESTS = [
  ['test:authorization-regression', 'Autorização central'],
  ['test:capability-gating-regression', 'Gating por capabilities'],
  ['test:multitenancy-scope', 'Matriz de escopos'],
  ['test:tenant-branding', 'Branding por tenant'],
  ['test:register-personal-client-helper', 'E-mail sintético tenant CLIENT (registo)'],
];

function runScript(name, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n[RUN] ${label} (${name})`);
    const child = spawn('npm', ['run', name], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[OK] ${label}`);
        resolve();
        return;
      }
      reject(new Error(`${label} falhou com exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  for (const [name, label] of TESTS) {
    await runScript(name, label);
  }
  console.log('\n[OK] suíte de regressão multitenancy finalizada com sucesso');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
