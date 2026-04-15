/**
 * Resolução de textos do painel admin por locale (pt-BR / en-US / es-ES)
 * com cadeia de fallback para chaves ainda não traduzidas ao espanhol.
 */

/** Ordem de fallback por locale persistido. */
export function adminI18nChain(loc) {
  if (loc === 'pt-BR') return ['pt-BR', 'en-US'];
  if (loc === 'en-US') return ['en-US', 'pt-BR'];
  if (loc === 'es-ES') return ['es-ES', 'en-US', 'pt-BR'];
  return ['pt-BR', 'en-US'];
}

/**
 * @param {Record<string, Record<string, string>>} M — mapa { 'pt-BR': {...}, 'en-US': {...}, 'es-ES': {...} }
 * @param {string} loc
 * @param {string} key
 */
export function adminResolve(M, loc, key) {
  for (const L of adminI18nChain(loc)) {
    const pack = M[L];
    if (pack && pack[key] != null) return pack[key];
  }
  return key;
}

/** `lang` no elemento raiz do documento. */
export function adminDocumentLang(loc) {
  if (loc === 'en-US') return 'en-US';
  if (loc === 'es-ES') return 'es-ES';
  return 'pt-BR';
}

/** Locale BCP-47 para `Intl` / `toLocaleString`. */
export function adminIntlLocale(loc) {
  return adminDocumentLang(loc);
}
