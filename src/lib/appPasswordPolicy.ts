/** Alinhado com `admin-panel/backend/src/lib/appPasswordPolicy.js` e onboarding do app. */
export const MIN_APP_PASSWORD_LEN = 8;

export function passwordChecks(p: string) {
  return {
    len: p.length >= MIN_APP_PASSWORD_LEN,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    num: /[0-9]/.test(p),
  };
}

export function isAppPasswordPolicySatisfied(p: string): boolean {
  const c = passwordChecks(p);
  return c.len && c.upper && c.lower && c.num;
}
