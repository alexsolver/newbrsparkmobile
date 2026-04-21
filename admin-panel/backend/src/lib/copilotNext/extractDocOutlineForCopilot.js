'use strict';

/**
 * Tenta extrair títulos ##/### do texto vindo do fetch (markdown ou parecido) para
 * forçar o copiloto a espelhar capítulos reais — evita esboço genérico («Descrição…», «Procedimentos…»).
 */

const SKIP_HEADING = new RegExp(
  [
    'últimas postagens',
    '^tags?$',
    'categorias',
    '^home$',
    'sobre nós',
    'mapa do site',
    'copyright',
    'articulos relacionados',
    'posts recentes',
    'comentários',
    'share\\s',
    'breadcrumb',
    'cookie',
    'política de privacidade',
  ].join('|'),
  'i'
);

/**
 * @param {string} raw
 * @param {{ max?: number, minLength?: number, maxLength?: number }} [opts]
 * @returns {string[]}
 */
function extractMarkdownHeadingsForCopilotOutline(raw, opts = {}) {
  const max = opts.max != null ? opts.max : 28;
  const minL = opts.minLength != null ? opts.minLength : 6;
  const maxL = opts.maxLength != null ? opts.maxLength : 130;
  if (!raw || typeof raw !== 'string') return [];

  const lines = raw.split(/\r?\n/u);
  const out = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    const hm = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (!hm) continue;
    let t = String(hm[2] || '')
      .replace(/\*\*/g, '')
      .replace(/^\[|\]$/g, '')
      .trim();
    t = t.replace(/\s+/g, ' ');
    if (t.length < minL || t.length > maxL) continue;
    if (SKIP_HEADING.test(t)) continue;
    const key = t.toLowerCase().slice(0, 96);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }

  // Se demasiados títulos antes do «miolo», cortar ruído inicial (navegação em lista)
  if (out.length >= 12) {
    const idx = out.findIndex((h) =>
      /detecção|alarme|incêndio|saída|rota|fuga|extint|hidrante|iluminação|material|substância|avcb/i.test(h)
    );
    if (idx > 4) return out.slice(idx);
  }

  return out;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function buildMandatoryOutlinePromptBlock(raw) {
  const headings = extractMarkdownHeadingsForCopilotOutline(raw);
  if (headings.length < 4) return '';

  const lines = headings.map((h, i) => `${i + 1}. **${h}**`).join('\n');
  return (
    '\n\n#### Esboço obrigatório — temas detectados no documento (extraído pelo servidor)\n' +
    'O painel **listou** os títulos `##` / `###` encontrados no texto abaixo. O `schemaPatch` **tem de** materializar **cada tema principal** com **pelo menos um** `section_break` (rótulo igual, abreviado ou equivalente em pt-BR) e **campos verificáveis** (`yes_no`, `dropdown`, `photo`, `repeatable_matrix`, etc.) — **não** substituir o artigo inteiro por secções vazias tipo «Itens de Segurança Específicos», «Procedimentos a Serem Seguidos», «Outras Informações» só com **caixa de texto** (`text`). Esse padrão é **rejeitado**.\n' +
    '- Para **cada linha numerada**, planeje **vários** campos operacionais (não um único `text` «descrição…»).\n' +
    '- Se não houver dados de identificação no artigo, pode acrescentar **antes** uma etapa «Identificação da obra» — **sem** apagar os temas listados.\n\n' +
    lines +
    '\n'
  );
}

module.exports = {
  extractMarkdownHeadingsForCopilotOutline,
  buildMandatoryOutlinePromptBlock,
};
