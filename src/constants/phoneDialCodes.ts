/**
 * Códigos de chamada internacional (DDI) para o registo com telefone.
 * Favoritos: ordem fixa pedida pelo produto (Brasil, EUA, México, Argentina, Espanha).
 */

export const PHONE_DIAL_FAVORITES_ISO = ['BR', 'US', 'MX', 'AR', 'ES'] as const;

export type PhoneDialEntry = {
  iso: string;
  dial: string;
  flag: string;
};

/** Lista única por ISO; `dial` é o indicativo sem +. */
export const PHONE_DIAL_ENTRIES: PhoneDialEntry[] = [
  { iso: 'BR', dial: '55', flag: '🇧🇷' },
  { iso: 'US', dial: '1', flag: '🇺🇸' },
  { iso: 'MX', dial: '52', flag: '🇲🇽' },
  { iso: 'AR', dial: '54', flag: '🇦🇷' },
  { iso: 'ES', dial: '34', flag: '🇪🇸' },
  { iso: 'PT', dial: '351', flag: '🇵🇹' },
  { iso: 'FR', dial: '33', flag: '🇫🇷' },
  { iso: 'DE', dial: '49', flag: '🇩🇪' },
  { iso: 'IT', dial: '39', flag: '🇮🇹' },
  { iso: 'GB', dial: '44', flag: '🇬🇧' },
  { iso: 'CA', dial: '1', flag: '🇨🇦' },
  { iso: 'CL', dial: '56', flag: '🇨🇱' },
  { iso: 'CO', dial: '57', flag: '🇨🇴' },
  { iso: 'PE', dial: '51', flag: '🇵🇪' },
  { iso: 'UY', dial: '598', flag: '🇺🇾' },
  { iso: 'PY', dial: '595', flag: '🇵🇾' },
  { iso: 'BO', dial: '591', flag: '🇧🇴' },
  { iso: 'EC', dial: '593', flag: '🇪🇨' },
  { iso: 'VE', dial: '58', flag: '🇻🇪' },
  { iso: 'CR', dial: '506', flag: '🇨🇷' },
  { iso: 'PA', dial: '507', flag: '🇵🇦' },
  { iso: 'GT', dial: '502', flag: '🇬🇹' },
  { iso: 'HN', dial: '504', flag: '🇭🇳' },
  { iso: 'NI', dial: '505', flag: '🇳🇮' },
  { iso: 'SV', dial: '503', flag: '🇸🇻' },
  { iso: 'JP', dial: '81', flag: '🇯🇵' },
  { iso: 'CN', dial: '86', flag: '🇨🇳' },
  { iso: 'IN', dial: '91', flag: '🇮🇳' },
  { iso: 'AU', dial: '61', flag: '🇦🇺' },
  { iso: 'NZ', dial: '64', flag: '🇳🇿' },
  { iso: 'ZA', dial: '27', flag: '🇿🇦' },
  { iso: 'AO', dial: '244', flag: '🇦🇴' },
  { iso: 'MZ', dial: '258', flag: '🇲🇿' },
];

export function getDefaultDialForAppRegion(appRegionCode: string): PhoneDialEntry {
  const upper = String(appRegionCode || '').toUpperCase();
  const hit = PHONE_DIAL_ENTRIES.find((e) => e.iso === upper);
  if (hit) return hit;
  return PHONE_DIAL_ENTRIES.find((e) => e.iso === 'BR')!;
}

export function buildE164Phone(dial: PhoneDialEntry, nationalDigits: string): string {
  const nat = nationalDigits.replace(/\D/g, '');
  if (!nat) return '';
  return `+${dial.dial}${nat}`;
}
