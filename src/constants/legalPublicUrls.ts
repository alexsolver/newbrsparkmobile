/** Fallbacks quando `/api/compliance/active/*` falha — alinhados ao site www (SPA). */
export const BRSPARK_PUBLIC_TERMS_FALLBACK = 'https://www.brspark.com/term';
export const BRSPARK_PUBLIC_PRIVACY_FALLBACK = 'https://www.brspark.com/privacy-policy';

export function complianceDocFallbackUrl(type: 'TERMS_OF_USE' | 'PRIVACY_POLICY'): string {
  return type === 'PRIVACY_POLICY' ? BRSPARK_PUBLIC_PRIVACY_FALLBACK : BRSPARK_PUBLIC_TERMS_FALLBACK;
}
