'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  draftPatchTouchesLockedIdentity,
  draftPatchTouchesForbiddenIdentityWhenTechActive,
  draftPatchTouchesIdentityOutsideReenrollment,
} = require('../technicianIdentityLock');

test('draftPatchTouchesLockedIdentity: vazio / não-objeto', () => {
  assert.equal(draftPatchTouchesLockedIdentity(null), false);
  assert.equal(draftPatchTouchesLockedIdentity(undefined), false);
  assert.equal(draftPatchTouchesLockedIdentity([]), false);
  assert.equal(draftPatchTouchesLockedIdentity({}), false);
});

test('draftPatchTouchesLockedIdentity: deteta chaves de identidade', () => {
  assert.equal(draftPatchTouchesLockedIdentity({ name: 'x' }), false);
  assert.equal(draftPatchTouchesLockedIdentity({ avatarUrl: '/x' }), true);
  assert.equal(draftPatchTouchesLockedIdentity({ faceEnrollmentPhotos: [] }), true);
  assert.equal(draftPatchTouchesLockedIdentity({ techRegPrimaryProfileCapture: {} }), true);
  assert.equal(draftPatchTouchesLockedIdentity({ techRegIdDocument: {} }), true);
  assert.equal(draftPatchTouchesLockedIdentity({ birthDate: '2000-01-01' }), true);
});

test('draftPatchTouchesForbiddenIdentityWhenTechActive: só birthDate e documento', () => {
  assert.equal(draftPatchTouchesForbiddenIdentityWhenTechActive({ avatarUrl: '/x' }), false);
  assert.equal(draftPatchTouchesForbiddenIdentityWhenTechActive({ birthDate: 'x' }), true);
  assert.equal(draftPatchTouchesForbiddenIdentityWhenTechActive({ techRegIdDocument: {} }), true);
});

test('draftPatchTouchesIdentityOutsideReenrollment: na janela só avatar/fotos/captura', () => {
  assert.equal(draftPatchTouchesIdentityOutsideReenrollment({ avatarUrl: '/x' }), false);
  assert.equal(draftPatchTouchesIdentityOutsideReenrollment({ faceEnrollmentPhotos: [] }), false);
  assert.equal(
    draftPatchTouchesIdentityOutsideReenrollment({ techRegPrimaryProfileCapture: { photoId: 'a' } }),
    false
  );
  assert.equal(draftPatchTouchesIdentityOutsideReenrollment({ birthDate: 'x' }), true);
  assert.equal(draftPatchTouchesIdentityOutsideReenrollment({ techRegIdDocument: {} }), true);
});
