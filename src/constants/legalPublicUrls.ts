/** Fallbacks quando `/api/compliance/active/*` falha — alinhados ao site www (SPA). */
export const ARIA_PUBLIC_TERMS_FALLBACK = 'https://www.aria.com/term';
export const ARIA_PUBLIC_PRIVACY_FALLBACK = 'https://www.aria.com/privacy-policy';

export function complianceDocFallbackUrl(type: 'TERMS_OF_USE' | 'PRIVACY_POLICY'): string {
  return type === 'PRIVACY_POLICY' ? ARIA_PUBLIC_PRIVACY_FALLBACK : ARIA_PUBLIC_TERMS_FALLBACK;
}
