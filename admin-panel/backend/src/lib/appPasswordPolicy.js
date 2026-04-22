'use strict';

/** Igual a `app/auth/register-onboarding.tsx` → `passwordChecks`. */
const MIN_APP_PASSWORD_LEN = 8;

/**
 * Texto único para UI, e-mails e primeiro erro de validação (comprimento).
 * Ao alterar, alinhar `admin-panel/reset-password.html` (validateAppPasswordPolicy + copy visível).
 */
const APP_PASSWORD_RULES_USER_FACING_PT =
  'A senha deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula e um número.';

/**
 * @param {string} raw
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateAppPasswordPolicy(raw) {
  const p = String(raw ?? '');
  if (p.length < MIN_APP_PASSWORD_LEN) {
    return {
      ok: false,
      error: APP_PASSWORD_RULES_USER_FACING_PT,
    };
  }
  if (!/[A-Z]/.test(p)) {
    return { ok: false, error: 'A senha deve incluir pelo menos uma letra maiúscula (A-Z).' };
  }
  if (!/[a-z]/.test(p)) {
    return { ok: false, error: 'A senha deve incluir pelo menos uma letra minúscula (a-z).' };
  }
  if (!/[0-9]/.test(p)) {
    return { ok: false, error: 'A senha deve incluir pelo menos um dígito (0-9).' };
  }
  return { ok: true };
}

module.exports = {
  MIN_APP_PASSWORD_LEN,
  validateAppPasswordPolicy,
  APP_PASSWORD_RULES_USER_FACING_PT,
};
