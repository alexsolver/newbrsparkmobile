/**
 * Rótulos e cores por `Tenant.kind` (CLIENT | PROVIDER | COMPANY).
 * Nomes legados no formato «Fulano — Cliente» são normalizados na UI — o tipo vem de `kind`.
 */

export type TenantKindKey = 'CLIENT' | 'PROVIDER' | 'COMPANY';

export function normalizeTenantKind(kind?: string | null): TenantKindKey {
  const k = String(kind || 'COMPANY').toUpperCase();
  if (k === 'CLIENT') return 'CLIENT';
  if (k === 'PROVIDER') return 'PROVIDER';
  return 'COMPANY';
}

export function tenantKindLabelPt(kind?: string | null): string {
  const k = normalizeTenantKind(kind);
  if (k === 'CLIENT') return 'Cliente';
  if (k === 'PROVIDER') return 'Prestador';
  return 'Empresa';
}

/** Título sem sufixo legado « — Cliente / Prestador / Empresa» quando bate com `kind`. */
export function displayTenantTitle(name: string | null | undefined, kind?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const k = normalizeTenantKind(kind);
  const re =
    k === 'CLIENT'
      ? /[\s\u2014\u2013–-]+Cliente\s*$/i
      : k === 'PROVIDER'
        ? /[\s\u2014\u2013–-]+Prestador\s*$/i
        : /[\s\u2014\u2013–-]+Empresa\s*$/i;
  const stripped = raw.replace(re, '').trim();
  return stripped || raw;
}

export type TenantKindUiColors = {
  /** Borda à esquerda / chip sólido */
  accent: string;
  /** Fundo suave da linha */
  subtleBg: string;
  /** Texto do título */
  title: string;
  /** Chip com texto branco */
  chipBg: string;
};

export function tenantKindUiColors(kind?: string | null): TenantKindUiColors {
  const k = normalizeTenantKind(kind);
  if (k === 'CLIENT') {
    return {
      accent: '#059669',
      subtleBg: '#ecfdf5',
      title: '#064e3b',
      chipBg: '#059669',
    };
  }
  if (k === 'PROVIDER') {
    return {
      accent: '#ca8a04',
      subtleBg: '#fffbeb',
      title: '#78350f',
      chipBg: '#d97706',
    };
  }
  return {
    accent: '#dc2626',
    subtleBg: '#fef2f2',
    title: '#7f1d1d',
    chipBg: '#dc2626',
  };
}
