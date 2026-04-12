'use strict';

/** ID fixo da cópia da foto do passo 1 do cadastro de prestador (matrícula facial). */
const REGISTRATION_PRIMARY_FACE_ID = 'fe_reg_primary';

function isRegistrationPrimaryFacePhoto(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.registrationPrimary === true) return true;
  return p.id === REGISTRATION_PRIMARY_FACE_ID;
}

module.exports = {
  REGISTRATION_PRIMARY_FACE_ID,
  isRegistrationPrimaryFacePhoto,
};
