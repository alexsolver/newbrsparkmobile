#!/usr/bin/env node
/**
 * Se DATABASE_URL aponta para 127.0.0.1/localhost, verifica se a porta TCP responde
 * (típico com túnel SSH para Postgres em produção).
 */
'use strict';

if (process.env.SKIP_DB_TUNNEL_CHECK === '1') {
  process.exit(0);
}

require('dotenv').config();

const net = require('net');

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith('postgresql')) {
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(url.replace(/^postgresql/, 'http'));
} catch {
  process.exit(0);
}

const host = (parsed.hostname || '').toLowerCase();
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
  process.exit(0);
}

const port = Number(parsed.port) || 5432;

const socket = net.createConnection({ host, port, family: 4 }, () => {
  socket.end();
  process.exit(0);
});

socket.setTimeout(2000);
socket.on('timeout', () => {
  socket.destroy();
  fail();
});
socket.on('error', fail);

function fail() {
  console.error('');
  console.error('  [Aria] DATABASE_URL usa %s:%s mas nada responde aqui.', host, port);
  console.error('  Provável causa: túnel SSH para o Postgres de produção não está ativo.');
  console.error('');
  console.error('  Terminal separado (raiz do repo AriaMobile):');
  console.error('    export ARIA_SSH_KEY="$HOME/Downloads/alex.pem"');
  console.error('    ./scripts/prod-postgres-tunnel.sh');
  console.error('  (porta local 5433 por defeito — tem de coincidir com a porta no DATABASE_URL.)');
  console.error('');
  console.error('  Alternativa: Postgres local — ajuste DATABASE_URL em admin-panel/backend/.env');
  console.error('    (ex.: postgresql://postgres:postgres@127.0.0.1:5432/aria_admin?schema=public)');
  console.error('');
  process.exit(1);
}
