'use strict';

/**
 * Deteta quando o canvas não espelha um artigo com esboço ##/### (muitos textos genéricos, poucas secções temáticas).
 * Usado para disparar uma segunda passagem automática no copiloto.
 */

/** @param {unknown} label */
function isGenericAvcbSectionLabel(label) {
  const s = String(label || '')
    .toLowerCase()
    .trim();
  if (s.length < 2) return true;
  if (/^etapa\s*\d*$/.test(s)) return true;
  if (/^itens?\s+de\s+segurança(\s+espec[ií]ficos)?$/.test(s)) return true;
  if (/^detalhes(\s+dos)?\s+itens$/.test(s)) return true;
  if (/documentação|documentos?\s+necessários/.test(s)) return true;
  if (/procedimentos?/.test(s) && s.length < 45) return true;
  if (/^outras?\s+informa(ç|c)ões/.test(s)) return true;
  if (/^informa(ç|c)ões\s+adicionais$/.test(s)) return true;
  if (s === 'checklist de segurança para avcb') return true;
  return false;
}

/**
 * @param {object[]} schemaData
 * @param {string[]} outlineHeadings
 * @returns {number} 0–1
 */
function scoreOutlineCoverage(schemaData, outlineHeadings) {
  if (!Array.isArray(schemaData) || !outlineHeadings.length) return 1;
  const sections = schemaData
    .filter((f) => f && f.type === 'section_break')
    .map((f) =>
      String(f.label || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    );
  if (!sections.length) return 0;
  let hits = 0;
  for (const h of outlineHeadings) {
    const norm = String(h)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const words = norm.split(/\s+/).filter((w) => w.length > 4);
    const keys = words.slice(0, 6);
    if (!keys.length) continue;
    const matched = keys.some((w) => {
      const frag = w.slice(0, 14);
      return sections.some((s) => s.includes(frag) || frag.length > 6 && s.includes(frag.slice(0, 8)));
    });
    if (matched) hits += 1;
  }
  return hits / outlineHeadings.length;
}

/**
 * @param {object[]} schemaData
 * @param {string[]} outlineHeadings
 * @returns {boolean}
 */
function isDocMirrorTooThin(schemaData, outlineHeadings) {
  if (!Array.isArray(schemaData) || !Array.isArray(outlineHeadings) || outlineHeadings.length < 5) {
    return false;
  }
  const score = scoreOutlineCoverage(schemaData, outlineHeadings);
  const texts = schemaData.filter((f) => f && f.type === 'text').length;
  const structured = schemaData.filter((f) =>
    f && ['yes_no', 'photo', 'photo_stamped', 'multiselect', 'dropdown', 'checkbox', 'repeatable_matrix', 'rating', 'number', 'date'].includes(String(f.type))
  ).length;
  const genericSections = schemaData.filter((f) => f && f.type === 'section_break' && isGenericAvcbSectionLabel(f.label)).length;

  if (score < 0.38) return true;
  if (texts >= 3 && structured < 3) return true;
  if (genericSections >= 2 && score < 0.55) return true;
  if (outlineHeadings.length >= 8 && score < 0.45) return true;
  return false;
}

/**
 * @param {object[]} schemaData
 * @param {string[]} outlineHeadings
 * @returns {string}
 */
function buildDocMirrorRepairUserMessage(schemaData, outlineHeadings) {
  const sections = schemaData
    .filter((f) => f && f.type === 'section_break')
    .map((f) => String(f.label || '').trim())
    .filter(Boolean);
  const fieldsByType = {};
  for (const f of schemaData || []) {
    if (!f || !f.type) continue;
    const t = String(f.type);
    fieldsByType[t] = (fieldsByType[t] || 0) + 1;
  }
  const lines = outlineHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const coverage = (scoreOutlineCoverage(schemaData, outlineHeadings) * 100).toFixed(0);
  return (
    '## VALIDADOR AUTOMÁTICO — primeira proposta REJEITADA\n\n' +
    'O servidor detetou que o formulário **não espelha** o documento de referência: poucos temas do artigo aparecem em `section_break`, e/ou há demasiados campos `text` genéricos («Descrição…», «Documentação…», «Procedimentos…») em vez de verificações por capítulo.\n\n' +
    `**Cobertura estimada dos títulos do artigo:** ${coverage}% (mínimo esperado: ~45–50% com secções nomeadas).\n\n` +
    '### Temas que **têm** de aparecer como etapas (cada um = `section_break` + campos **não** só texto livre):\n' +
    lines +
    '\n\n### Resumo do canvas actual\n' +
    '- `section_break` encontrados: ' +
    (sections.length ? sections.map((s) => '«' + s.slice(0, 80) + '»').join(', ') : '(nenhum)') +
    '\n' +
    '- Contagem por tipo: ' +
    JSON.stringify(fieldsByType).slice(0, 400) +
    '\n\n' +
    '### O que deve fazer agora (obrigatório)\n' +
    '1. Devolva **JSON** com **schemaPatch** forte: `add_field` / `update_field` para criar **uma etapa por tema** acima (rótulos podem ser ligeiramente encurtados, mas reconhecíveis).\n' +
    '2. Em **cada** tema: pelo menos **dois** campos que **não** sejam `text` puro — prefira `yes_no`, `photo`, `multiselect`, `repeatable_matrix`, `dropdown`.\n' +
    '3. Elimine ou renomeie secções vazias «Etapa 1» e blocos genéricos «Itens de Segurança» sem subtópicos do artigo.\n' +
    '4. `replyText` deve mencionar que esta é a **correção automática** e listar os temas agora cobertos.\n' +
    '5. **Preserve** `id` dos campos sempre que possível; use `afterId` para ordenar.\n'
  );
}

module.exports = {
  scoreOutlineCoverage,
  isDocMirrorTooThin,
  isGenericAvcbSectionLabel,
  buildDocMirrorRepairUserMessage,
};
