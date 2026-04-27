'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDedicatedExclusiveFromTenantScheduleJson,
  isInstantInDedicatedBlock,
  validateDedicatedExclusivePayload,
  dedicatedExclusiveSchedulesOverlap,
} = require('../dedicatedExclusiveTime');

test('parseDedicatedExclusiveFromTenantScheduleJson: null / inválido', () => {
  assert.equal(parseDedicatedExclusiveFromTenantScheduleJson(null), null);
  assert.equal(parseDedicatedExclusiveFromTenantScheduleJson(''), null);
  assert.equal(parseDedicatedExclusiveFromTenantScheduleJson({}), null);
});

test('validateDedicatedExclusivePayload: ok', () => {
  const r = validateDedicatedExclusivePayload({
    timezone: 'America/Sao_Paulo',
    weeklyWindows: [{ weekday: 'mon', start: '08:00', end: '18:00' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.timezone, 'America/Sao_Paulo');
  assert.equal(r.weeklyWindows.length, 1);
});

test('validateDedicatedExclusivePayload: sobreposição no mesmo dia', () => {
  const r = validateDedicatedExclusivePayload({
    timezone: 'UTC',
    weeklyWindows: [
      { weekday: 'tue', start: '09:00', end: '12:00' },
      { weekday: 'tue', start: '11:00', end: '13:00' },
    ],
  });
  assert.equal(r.ok, false);
});

test('isInstantInDedicatedBlock: dentro da janela (America/Sao_Paulo)', () => {
  const parsed = parseDedicatedExclusiveFromTenantScheduleJson({
    dedicatedExclusive: {
      timezone: 'America/Sao_Paulo',
      weeklyWindows: [{ weekday: 'mon', start: '08:00', end: '18:00' }],
    },
  });
  assert.ok(parsed);
  // 2026-04-27 é segunda-feira (UTC); verificar ponto médio do dia em São Paulo ainda é segunda
  const d = new Date('2026-04-27T14:00:00.000Z');
  assert.equal(isInstantInDedicatedBlock(d, parsed), true);
});

test('dedicatedExclusiveSchedulesOverlap: dois horários que se cruzam', () => {
  const a = parseDedicatedExclusiveFromTenantScheduleJson({
    dedicatedExclusive: {
      timezone: 'America/Sao_Paulo',
      weeklyWindows: [{ weekday: 'wed', start: '10:00', end: '14:00' }],
    },
  });
  const b = parseDedicatedExclusiveFromTenantScheduleJson({
    dedicatedExclusive: {
      timezone: 'Europe/Lisbon',
      weeklyWindows: [{ weekday: 'wed', start: '12:00', end: '16:00' }],
    },
  });
  assert.equal(dedicatedExclusiveSchedulesOverlap(a, b, 21, 10), true);
});
