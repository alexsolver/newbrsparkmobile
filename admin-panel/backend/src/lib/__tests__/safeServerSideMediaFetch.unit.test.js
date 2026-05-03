'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  readFileUnderPublicRoot,
  assertHostnameSafeForOutboundFetch,
} = require('../safeServerSideMediaFetch');

test('readFileUnderPublicRoot: lê ficheiro dentro da raiz', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brspark-public-'));
  const rel = 'uploads/demo.txt';
  const sub = path.join(dir, 'uploads');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'demo.txt'), 'ok', 'utf8');
  const buf = await readFileUnderPublicRoot(dir, `/${rel}`);
  assert.equal(String(buf), 'ok');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFileUnderPublicRoot: rejeita .. no path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brspark-public-'));
  await assert.rejects(
    () => readFileUnderPublicRoot(dir, '/../etc/passwd'),
    /Caminho inválido|traversal/i,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFileUnderPublicRoot: ficheiro inexistente — erro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brspark-public-'));
  await assert.rejects(() => readFileUnderPublicRoot(dir, '/nao-existe-12345.txt'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assertHostnameSafeForOutboundFetch: localhost bloqueado', async () => {
  await assert.rejects(() => assertHostnameSafeForOutboundFetch('localhost'), /bloqueado/i);
});

test('assertHostnameSafeForOutboundFetch: 127.0.0.1 bloqueado', async () => {
  await assert.rejects(() => assertHostnameSafeForOutboundFetch('127.0.0.1'), /privado|bloqueado/i);
});

test('assertHostnameSafeForOutboundFetch: metadata bloqueado', async () => {
  await assert.rejects(() => assertHostnameSafeForOutboundFetch('169.254.169.254'), /privado|bloqueado/i);
});
