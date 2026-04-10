'use strict';

/**
 * Cadastro de prestador — passo 1 (foto de perfil).
 * Ver também POST /api/me/validate-technician-profile-photo (account.js) e
 * POST /api/technician-registration/public/:token/validate-profile-photo (technicianRegistration.js) — mesmo handler.
 */

const express = require('express');
const authUser = require('../middleware/authUser');
const { handleTechnicianProfilePhotoAiValidate } = require('../lib/handleTechnicianProfilePhotoAiValidate');

const router = express.Router();

router.post('/validate', authUser, handleTechnicianProfilePhotoAiValidate);

module.exports = router;
