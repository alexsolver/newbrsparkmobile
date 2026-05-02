'use strict';

/**
 * Tenta extrair títulos ##/### do texto vindo do fetch (markdown ou parecido) para
 * forçar o Composer a espelhar capítulos reais — evita esboço genérico («Descrição…», «Procedimentos…»).
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
 * PDF e Word colados como texto plano raramente têm `##`; extrai anexos, itens numerados e linhas-título.
 * @param {string} raw
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
function extractPlainDocumentOutline(raw, opts = {}) {
  const max = opts.max != null ? opts.max : 30;
  const lines = String(raw || '').split(/\r?\n/u);
  const out = [];
  const seen = new Set();

  const push = (t) => {
    let s = String(t || '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—•]+/, '')
      .trim();
    if (s.length < 12 || s.length > 140) return;
    const key = s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .slice(0, 96);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  for (const line of lines) {
    const L = line.trim();
    if (!L || L.length > 200) continue;

    if (/^(ANEXO|AP[EÊ]NDICE|ANEXO\s+[IVXLCDM0-9]+)\b/i.test(L)) {
      push(L.slice(0, 140));
      continue;
    }
    if (/^(MODELO|MINUTA|FORMUL[ÁA]RIO|CHECKLIST|RELAT[ÓO]RIO|RIA\b|TERMO\s+D[E'])/i.test(L) && L.length < 130) {
      push(L);
      continue;
    }
    if (/^(ITEM|SUBITEM|CL[ÁA]USULA|SUBCL[ÁA]USULA|CAP[ÍI]TULO)\s*\d+/i.test(L) && L.length < 140) {
      push(L);
      continue;
    }

    const numItem = L.match(/^(\d{1,3}[\.\)]\s+|\d{1,2}\.\d{1,2}\s+)(.{10,130})$/);
    if (numItem) {
      push(numItem[2].trim());
      continue;
    }

    const lettersOnly = L.replace(/[^a-záéíóúçãõâêôA-ZÁÉÍÓÚÇÃÕÂÊÔ]/gu, '');
    if (lettersOnly.length >= 18 && lettersOnly === lettersOnly.toUpperCase() && L.length < 120) {
      push(L);
    }
  }

  return out.slice(0, max);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function extractDocumentOutlineForCopilot(raw) {
  const md = extractMarkdownHeadingsForCopilotOutline(raw);
  const plain = extractPlainDocumentOutline(raw);
  if (plain.length === 0) return md;
  if (md.length >= 6 && md.length >= plain.length) return md;

  const merged = [];
  const seen = new Set();
  const add = (h) => {
    const k = String(h)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .slice(0, 88);
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(h);
  };
  for (const h of md) add(h);
  for (const h of plain) {
    add(h);
    if (merged.length >= 28) break;
  }
  return merged;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function buildMandatoryOutlinePromptBlock(raw) {
  const headings = extractDocumentOutlineForCopilot(raw);
  if (headings.length < 4) return '';

  const lines = headings.map((h, i) => `${i + 1}. **${h}**`).join('\n');
  return (
    '\n\n#### Esboço obrigatório — temas detectados no documento (extraído pelo servidor)\n' +
    'O painel **listou** títulos (`##`/`###` em HTML) **ou** estrutura típica de PDF/modelo oficial (anexos, itens numerados, cláusulas). O `schemaPatch` **tem de** materializar **cada tema principal** com **pelo menos um** `section_break` (rótulo igual, abreviado ou equivalente em pt-BR) e **campos verificáveis** (`yes_no`, `dropdown`, `photo`, `repeatable_matrix`, etc.) — **não** substituir o documento por secções vazias tipo «Itens de Segurança Específicos», «Procedimentos a Serem Seguidos», «Outras Informações» só com **caixa de texto** (`text`). Esse padrão é **rejeitado**.\n' +
    '- Para **cada linha numerada**, planeje **vários** campos operacionais (não um único `text` «descrição…»).\n' +
    '- Em **modelos de contrato / RIA / licitação / termos oficiais**: cada **subitem ou tabela de critérios** do texto deve tender a **campos próprios** ou **matriz repetível**, não um parágrafo genérico.\n' +
    '- Se não houver dados de identificação no artigo, pode acrescentar **antes** uma etapa «Identificação / cadastro» — **sem** apagar os temas listados.\n\n' +
    lines +
    '\n'
  );
}

module.exports = {
  extractMarkdownHeadingsForCopilotOutline,
  extractPlainDocumentOutline,
  extractDocumentOutlineForCopilot,
  buildMandatoryOutlinePromptBlock,
};
