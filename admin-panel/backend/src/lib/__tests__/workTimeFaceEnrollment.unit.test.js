'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { faceEnrollmentOk, parseComprefaceGallerySyncStatus } = require('../workTime');

const baseUser = {
  faceEnrollmentPhotos: [
    { id: 'fe_reg_primary', url: '/uploads/x.jpg' },
    { id: 'a2', url: '/uploads/y.jpg' },
  ],
};

test('faceEnrollmentOk: com fotos válidas — true mesmo sem comprefaceRecognitionSync', () => {
  assert.equal(faceEnrollmentOk({ ...baseUser, comprefaceRecognitionSync: null }), true);
});

test('faceEnrollmentOk: com fotos e status vazio no JSON de sync — true (antes falhava)', () => {
  assert.equal(faceEnrollmentOk({ ...baseUser, comprefaceRecognitionSync: { at: '2026-01-01' } }), true);
});

test('faceEnrollmentOk: com fotos e status synced — true', () => {
  assert.equal(
    faceEnrollmentOk({ ...baseUser, comprefaceRecognitionSync: { status: 'synced' } }),
    true,
  );
});

test('faceEnrollmentOk: com fotos e última sync em erro — true (fotos existem; admin deve rever FaceMatch)', () => {
  assert.equal(
    faceEnrollmentOk({ ...baseUser, comprefaceRecognitionSync: { status: 'error', message: 'timeout' } }),
    true,
  );
});

test('faceEnrollmentOk: sem fotos com id+url — false', () => {
  assert.equal(faceEnrollmentOk({ faceEnrollmentPhotos: [], comprefaceRecognitionSync: { status: 'synced' } }), false);
  assert.equal(faceEnrollmentOk({ faceEnrollmentPhotos: [{ id: 'x' }] }, null), false);
});

test('parseComprefaceGallerySyncStatus', () => {
  assert.equal(parseComprefaceGallerySyncStatus({ comprefaceRecognitionSync: null }), 'none');
  assert.equal(parseComprefaceGallerySyncStatus({ comprefaceRecognitionSync: { status: 'synced' } }), 'synced');
  assert.equal(parseComprefaceGallerySyncStatus({ comprefaceRecognitionSync: { status: 'ERROR' } }), 'error');
  assert.equal(parseComprefaceGallerySyncStatus({ comprefaceRecognitionSync: { at: 'x' } }), 'none');
});
