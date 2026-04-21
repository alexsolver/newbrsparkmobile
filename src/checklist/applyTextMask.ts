/**
 * Máscara dinâmica do construtor (# = um caractere do buffer).
 * Para moeda R$ e máscaras numéricas: o fluxo correto é descartar tudo que não é dígito
 * a partir do texto do TextInput — nunca alimentar a máscara com "R$ …" completo.
 */

function buildFromClean(mask: string, clean: string): string {
  let result = '';
  let cleanIdx = 0;
  for (let i = 0; i < mask.length; i++) {
    if (cleanIdx >= clean.length) break;
    if (mask[i] === '#') {
      result += clean[cleanIdx];
      cleanIdx++;
    } else {
      result += mask[i];
    }
  }
  return result;
}

const BRL_IN_MASK = /R\s*[$\uFF04﹩＄]/i;
const BRL_IN_MASK_G = new RegExp(BRL_IN_MASK.source, 'gi');

function normalizeFieldType(fieldType?: string | null): string {
  return String(fieldType ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isNumericFieldType(t: string): boolean {
  return (
    t === 'number' ||
    t === 'numeric' ||
    t === 'integer' ||
    t === 'float' ||
    t === 'decimal' ||
    t === 'numero'
  );
}

/** NFC + NFKC: R/$ fullwidth → ASCII para detetar R$. */
export function normalizeMaskString(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .normalize('NFC')
    .normalize('NFKC')
    .replace(/[\u00A0\u202F\u2007\u3000]/g, ' ')
    .trim();
}

function shouldUseDigitOnlyMask(m: string, fieldType: string | undefined | null): boolean {
  const t = normalizeFieldType(fieldType);
  const hasBrlInMask = BRL_IN_MASK.test(m);
  const maskBody = m.replace(BRL_IN_MASK_G, '');
  const maskExpectsLetterLiterals = /[A-Za-z]/.test(maskBody);
  return isNumericFieldType(t) || hasBrlInMask || !maskExpectsLetterLiterals;
}

/**
 * Converte o valor vindo do `onChangeText` no texto a passar à máscara.
 * Para moeda / número: só dígitos (remove R$, pontos e vírgulas do estado visual).
 */
export function uiValueForChecklistMask(
  uiValue: string,
  mask: string | null | undefined,
  fieldType: string | undefined
): string {
  const mRaw = mask != null && String(mask).trim() !== '' ? String(mask) : '';
  if (!mRaw) return uiValue;
  const m = normalizeMaskString(mRaw);
  if (shouldUseDigitOnlyMask(m, fieldType)) {
    return String(uiValue).replace(/\D/g, '');
  }
  return uiValue;
}

export function applyChecklistTextMask(
  rawValue: string,
  mask?: string | null,
  fieldType?: string
): string {
  const mRaw = mask != null && String(mask).trim() !== '' ? String(mask) : '';
  if (!mRaw) return rawValue;
  const m = normalizeMaskString(mRaw);
  const useDigitOnly = shouldUseDigitOnlyMask(m, fieldType);

  const clean = useDigitOnly
    ? String(rawValue).replace(/\D/g, '')
    : String(rawValue).replace(/[^A-Za-z0-9]/g, '');

  let result = buildFromClean(m, clean);
  if (clean.length > 0 && /R\$\s+R{2,}/i.test(result)) {
    result = buildFromClean(m, clean);
  }
  return result;
}
